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
 *    under the pointer lights up, and its bar shows its cells, with the ones
 *    the item would take highlighted and the items there sliding aside
 *    (barGridView.tsx);
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
  SHELL_ITEM_MIME, announceLayout, readChromeDrag, setChromeDrag, useChromeDrag, useLayoutEditing, useShellPlacement, useWidgetsIn,
  type BarZone, type ShellZone,
} from '../../lib/shellLayout'
import { cellAt, placeOnBar } from '../../lib/barGrid'
import { useDragOnlyEditing } from './dragOnlyEdit'
import { useEditOption, useGridStyle, useTilesPanel } from '../../lib/editOption'
import { shellItemMeta, zonesFor } from './shellItems'
import { zoneLabel } from './barItems'

/** True while any native drag is in flight on the page (including drags from
 *  outside the layout, such as a Mate from the Mates page). */
export function useNativeDragging(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const start = () => setOn(true)
    const end = () => setOn(false)
    // A dragged item that is removed or moved mid-drag unmounts, and its
    // dragend never reaches the window: the drag looked stuck on (every bar
    // greyed with ⊘, the top bar's outline taking every press). No pointer or
    // key event fires during a native drag, so any of them means it is over.
    const after = ['pointerdown', 'pointermove', 'mousemove', 'keydown'] as const
    window.addEventListener('dragstart', start)
    window.addEventListener('dragend', end, true)
    window.addEventListener('drop', end, true)
    for (const t of after) window.addEventListener(t, end, true)
    return () => {
      window.removeEventListener('dragstart', start)
      window.removeEventListener('dragend', end, true)
      window.removeEventListener('drop', end, true)
      for (const t of after) window.removeEventListener(t, end, true)
    }
  }, [])
  return on
}

function ZoneOutline({ zone, area, dragging, nativeDrag, allowed, over, lineX, flat, count }: {
  /** Option 1 (drag only): a flat dashed area like option 3's drawing, not raised. */
  flat: boolean
  /** How many items the area holds (empty areas say so). */
  count: number
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
    // The cells the item would take, centred under the pointer.
    setChromeDrag({ over: bar, lineX: null, cell: cellAt(bar, e.clientX, readChromeDrag().id) })
  }
  const onDragLeave = (e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    if (readChromeDrag().over === bar) setChromeDrag({ over: null, lineX: null, cell: null })
  }
  const onDrop = (e: DragEvent) => {
    if (!bar || !e.dataTransfer.types.includes(SHELL_ITEM_MIME)) return
    const id = e.dataTransfer.getData(SHELL_ITEM_MIME)
    // Checkpoint 59 (note 26): judged from the dropped item, not from the
    // drag state. The window's own drop listeners clear that state, and React
    // re-renders before this handler runs, so `allowed` already reads false.
    if (!id || !zonesFor(id).includes(bar)) return
    e.preventDefault()
    // The item takes the cells under the pointer; what was there moves aside.
    placeOnBar(bar, id, cellAt(bar, e.clientX, id) ?? 0)
    announceLayout(i18nT('nav.layout_moved', { item: shellItemMeta(id)?.label ?? id, place: zoneLabel(bar) }))
  }

  const unavailable = dragging && !allowed
  // Minimal grid: no grey dashed outlines; each area is just its plain raised
  // surface, and the grid itself appears only in the area being dragged over.
  // Tiles keeps the dashed area outlines (they read in dark mode) while its
  // drags use the minimal, gridless look.
  const tiles = useTilesPanel()
  const minimal = useGridStyle() === 'minimal' && !tiles
  const bars = zone !== 'sidebar'
  const box = ref.current?.getBoundingClientRect()
  return (
    <div
      ref={ref}
      data-layout-outline={zone}
      style={{ gridArea: area, zIndex: 70, pointerEvents: catches ? 'auto' : 'none' }}
      // Raised above the dimmed page (a lifted shadow and a full-strength
      // outline), so the three places you can edit stand out as the editor.
      className={flat
        // Flat: a dashed outline as strong as option 2's (2px, 40%) so it reads
        // in dark mode too, but no lift; the drop target still lights up.
        ? `relative rounded-lg border-2 border-dashed transition-[border-color,background-color] ${zone === 'sidebar' ? 'mx-1 mb-1' : 'mx-1 my-0.5'} ${
          unavailable ? 'border-border bg-bg-hover/60' : over ? 'border-text/70 bg-text/5' : 'border-text/40'}`
        : `relative rounded-lg border-2 border-dashed transition-[border-color,background-color,box-shadow] ${
        zone === 'sidebar' ? 'mx-1 mb-1' : 'mx-1 my-0.5'
      } ${unavailable
        ? `${minimal ? 'border-transparent' : 'border-border'} bg-bg-hover/60 shadow-none`
        : over
          ? `${minimal ? 'border-transparent' : 'border-text/70'} bg-text/5 ${zone === 'bottom' ? 'shadow-[0_-10px_28px_-6px_rgba(0,0,0,0.45)]' : 'shadow-[0_10px_28px_-6px_rgba(0,0,0,0.45)]'}`
          // The lift falls toward the page: down from the top bar and the
          // sidebar, UP from the bottom bar (below it is the window's edge,
          // which would clip it and leave that bar looking flat).
          : `${minimal ? 'border-transparent' : 'border-text/40'} ${zone === 'bottom' ? 'shadow-[0_-8px_22px_-8px_rgba(0,0,0,0.4)]' : 'shadow-[0_8px_22px_-8px_rgba(0,0,0,0.4)]'}`}`}
      // The handlers stay on option 1's bar outlines: `catches` (pointer
      // events) turns off in the same re-render that runs before the drop
      // reaches React (note 26).
      {...(catches || (bar && flat) ? { onDragOver, onDragLeave, onDrop } : {})}
    >
      {/* Where the item will land: a line in the gap it snaps to. */}
      {over && allowed && lineX != null && box && (
        <span
          aria-hidden="true"
          className="absolute top-1 bottom-1 w-0.5 rounded-full bg-accent pointer-events-none"
          style={{ left: lineX - box.left - 3 }}
        />
      )}
      {flat && bars && count === 0 && !dragging && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] text-muted">
          {i18nT('nav.layout_preview_empty_area')}
        </span>
      )}
      {/* Remove all is in the bar's right-click menu on empty space (checkpoint 56). */}
      <span
        aria-hidden="true"
        // One rule for all three: the tag sits on the MIDDLE of the edge that
        // faces the page, away from the corners where two zones meet, so it can
        // only belong to its own zone. Shown only while an item is dragged.
        className={`absolute inline-flex items-center gap-1 whitespace-nowrap px-1.5 py-px rounded text-[10px] font-medium uppercase tracking-wide pointer-events-none transition-opacity duration-150 motion-reduce:transition-none ${
          unavailable ? 'bg-bg-elevated text-muted border border-border' : 'bg-text text-bg'
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
  const flat = useDragOnlyEditing()
  const placement = useShellPlacement()
  const topWidgets = useWidgetsIn('top')
  const bottomWidgets = useWidgetsIn('bottom')
  // Option 2 edits in the list only: the window behind it takes no drops.
  const listOnly = useEditOption() === 'panel'
  if (!editing) return null
  const countOf = (z: ShellZone) => (z === 'top' ? placement.top.length + topWidgets.length : z === 'bottom' ? placement.bottom.length + bottomWidgets.length : 1)
  const dragging = native || drag.id !== null
  // A native drag with no layout item (a Mate or session from another page)
  // can only be pinned to the sidebar.
  const allowed = (z: ShellZone) => !listOnly && (drag.id ? zonesFor(drag.id).includes(z) : z === 'sidebar')
  const props = (zone: ShellZone) => ({
    zone,
    dragging: dragging && !listOnly,
    nativeDrag: native && !listOnly,
    allowed: allowed(zone),
    over: zone !== 'sidebar' && drag.over === zone,
    lineX: drag.over === zone ? drag.lineX : null,
    flat,
    count: countOf(zone),
  })
  return (
    <>
      <ZoneOutline area="topbar" {...props('top')} />
      <ZoneOutline area="nav" {...props('sidebar')} />
      <ZoneOutline area="status" {...props('bottom')} />
    </>
  )
}
