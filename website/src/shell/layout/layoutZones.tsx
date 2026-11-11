/**
 * Full-size drop zones for "Edit layout" (design exploration).
 *
 * While editing, each chrome area of the canvas gets a dashed outline that
 * spans the WHOLE area: the top bar edge to edge, the sidebar top to bottom,
 * the bottom bar edge to edge.
 *
 * The page under them is dimmed (App.tsx), and each zone casts a lifted
 * shadow, so the zones read as raised above it.
 *
 * While an item is dragged (a native drag from the panel or a bar, or a
 * dnd-kit drag of a sidebar row, which the rail reports through
 * `setChromeDrag`), each zone shows its name, and:
 *  - a zone that can take the item is outlined in the accent colour; the one
 *    under the pointer lights up and draws a drop line in the gap where the
 *    item will land (it snaps to the nearest gap between items);
 *  - a zone that cannot take it (an app, Mate or session over a bar; search
 *    over the bottom bar; a window toggle over the sidebar) is greyed, with a
 *    "no" mark on its name, and refuses the drop, so the item goes back.
 *
 * The top and bottom outlines take pointer events during a native drag, so a
 * drop anywhere along the bar lands in it. The sidebar outline never does:
 * drops reach the rail itself, which pins at the drop point.
 */
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Ban } from 'lucide-react'

import { i18nT } from '../../i18n/t'
import {
  SEARCH_ITEM, SHELL_ITEM_MIME, announceLayout, barDropAt, searchTopSlotAt, setSearchTopSlot, moveItem, readChromeDrag, setChromeDrag, useChromeDrag, useLayoutEditing,
  type BarZone, type ShellZone,
} from '../../lib/shellLayout'
import { shellItemMeta, zonesFor } from './shellItems'
import { zoneLabel } from './barItems'

/** True while any native drag is in flight on the page (including drags from
 *  outside the layout, such as a Mate from the Mates page). */
function useNativeDragging(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const start = () => setOn(true)
    const end = () => setOn(false)
    window.addEventListener('dragstart', start)
    window.addEventListener('dragend', end)
    window.addEventListener('drop', end)
    return () => {
      window.removeEventListener('dragstart', start)
      window.removeEventListener('dragend', end)
      window.removeEventListener('drop', end)
    }
  }, [])
  return on
}

function ZoneOutline({ zone, area, dragging, nativeDrag, allowed, over, lineX }: {
  zone: ShellZone
  area: string
  /** Some item is being dragged: show names and availability. */
  dragging: boolean
  /** A native drag is in flight: the bar outlines take pointer events. */
  nativeDrag: boolean
  allowed: boolean
  over: boolean
  lineX: number | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const bar = zone === 'sidebar' ? null : (zone as BarZone)
  const catches = !!bar && nativeDrag

  const onDragOver = (e: DragEvent) => {
    // A refused drop: no preventDefault, so the browser shows "not allowed".
    if (!bar || !allowed || !e.dataTransfer.types.includes(SHELL_ITEM_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const dragged = readChromeDrag().id
    // Search over the top bar lands in its left, centre or right part.
    const lineX = dragged === SEARCH_ITEM && bar === 'top' ? searchTopSlotAt(e.clientX).lineX : barDropAt(bar, e.clientX, dragged).lineX
    setChromeDrag({ over: bar, lineX })
  }
  const onDragLeave = (e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    if (readChromeDrag().over === bar) setChromeDrag({ over: null, lineX: null })
  }
  const onDrop = (e: DragEvent) => {
    if (!bar || !allowed || !e.dataTransfer.types.includes(SHELL_ITEM_MIME)) return
    e.preventDefault()
    const id = e.dataTransfer.getData(SHELL_ITEM_MIME)
    if (!id) return
    if (id === SEARCH_ITEM && bar === 'top') setSearchTopSlot(searchTopSlotAt(e.clientX).slot)
    moveItem(id, bar, barDropAt(bar, e.clientX, id).index)
    announceLayout(i18nT('nav.layout_moved', { item: shellItemMeta(id)?.label ?? id, place: zoneLabel(bar) }))
  }

  const unavailable = dragging && !allowed
  const box = ref.current?.getBoundingClientRect()
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-layout-outline={zone}
      style={{ gridArea: area, zIndex: 70, pointerEvents: catches ? 'auto' : 'none' }}
      // Raised above the dimmed page (a lifted shadow and a full-strength
      // outline), so the three places you can edit stand out as the editor.
      className={`relative rounded-lg border-2 border-dashed transition-[border-color,background-color,box-shadow] ${
        zone === 'sidebar' ? 'mx-1 mb-1' : zone === 'top' ? 'mx-1 my-0.5' : 'mx-1'
      } ${unavailable
        ? 'border-border bg-bg-hover/60 shadow-none'
        : over
          ? 'border-accent bg-accent/10 shadow-[0_10px_28px_-6px_rgba(0,0,0,0.45)]'
          : 'border-accent/80 shadow-[0_8px_22px_-8px_rgba(0,0,0,0.4)]'}`}
      {...(catches ? { onDragOver, onDragLeave, onDrop } : {})}
    >
      {/* Where the item will land: a line in the gap it snaps to. */}
      {over && allowed && lineX != null && box && (
        <span
          className="absolute top-1 bottom-1 w-0.5 rounded-full bg-accent pointer-events-none"
          style={{ left: lineX - box.left - 3 }}
        />
      )}
      <span
        // One rule for all three: the tag sits on the MIDDLE of the edge that
        // faces the page, away from the corners where two zones meet, so it can
        // only belong to its own zone. Shown only while an item is dragged.
        className={`absolute inline-flex items-center gap-1 whitespace-nowrap px-1.5 py-px rounded text-[10px] font-medium uppercase tracking-wide pointer-events-none transition-opacity duration-150 motion-reduce:transition-none ${
          unavailable ? 'bg-bg-elevated text-muted border border-border' : 'bg-accent text-accent-fg'
        } ${dragging ? 'opacity-100' : 'opacity-0'} ${
          zone === 'sidebar'
            ? 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2'
            : zone === 'top'
              ? 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2'
              : 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2'
        }`}
      >
        {unavailable && <Ban size={10} aria-hidden="true" />}
        {zoneLabel(zone)}
      </span>
    </div>
  )
}

/** The three outlines, drawn only while editing. Place inside the desktop shell grid. */
export function LayoutZoneOutlines() {
  const editing = useLayoutEditing()
  const native = useNativeDragging()
  const drag = useChromeDrag()
  if (!editing) return null
  const dragging = native || drag.id !== null
  // A native drag with no layout item (a Mate or session from another page)
  // can only be pinned to the sidebar.
  const allowed = (z: ShellZone) => (drag.id ? zonesFor(drag.id).includes(z) : z === 'sidebar')
  const props = (zone: ShellZone) => ({
    zone,
    dragging,
    nativeDrag: native,
    allowed: allowed(zone),
    over: zone !== 'sidebar' && drag.over === zone,
    lineX: drag.over === zone ? drag.lineX : null,
  })
  return (
    <>
      <ZoneOutline area="topbar" {...props('top')} />
      <ZoneOutline area="nav" {...props('sidebar')} />
      <ZoneOutline area="status" {...props('bottom')} />
    </>
  )
}
