/**
 * Full-size drop zones for "Edit layout" (design exploration).
 *
 * While editing, each chrome area of the canvas gets a dashed outline that
 * spans the WHOLE area: the top bar edge to edge, the sidebar top to bottom,
 * the bottom bar edge to edge. Each outline carries its name, so the canvas
 * reads as three places you can put things.
 *
 * The outlines sit in the shell grid's own areas (`topbar`, `nav`, `status`),
 * over the real chrome. They let clicks through. During a native drag the top
 * and bottom outlines take pointer events, so a drop ANYWHERE along the bar
 * lands in it (the index comes from where the bar's existing items sit). The
 * sidebar outline never takes pointer events: drops reach the rail itself,
 * which pins at the drop point.
 */
import { useEffect, useState, type DragEvent } from 'react'

import { i18nT } from '../../i18n/t'
import { isTwoPlaceItem, SHELL_ITEM_MIME, announceLayout, moveItem, useChromeDrag, useLayoutEditing, type BarZone, type ShellZone } from '../../lib/shellLayout'
import { shellItemMeta } from './shellItems'
import { zoneLabel } from './barItems'

/** True while any native drag is in flight on the page. */
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

/** Drop index along a bar: before the first placed item whose middle is right of x. */
function barIndexAt(zone: BarZone, x: number): number {
  const els = [...document.querySelectorAll<HTMLElement>(`[data-layout-zone="${zone}"] [data-bar-item]`)]
  const i = els.findIndex(el => { const r = el.getBoundingClientRect(); return r.left + r.width / 2 > x })
  return i < 0 ? els.length : i
}

function ZoneOutline({ zone, area, dragging, sidebarOver }: { zone: ShellZone; area: string; dragging: boolean; sidebarOver: boolean }) {
  const [nativeOver, setOver] = useState(false)
  // Highlighted by a native drag over it, or by a sidebar drag (reported by the rail).
  const over = nativeOver || sidebarOver
  const droppable = zone !== 'sidebar' && dragging
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(SHELL_ITEM_MIME)
  useEffect(() => { if (!dragging) setOver(false) }, [dragging])
  return (
    <div
      aria-hidden="true"
      data-layout-outline={zone}
      style={{ gridArea: area, zIndex: 70, pointerEvents: droppable ? 'auto' : 'none' }}
      className={`relative rounded-lg border-2 border-dashed transition-colors ${
        zone === 'sidebar' ? 'mx-1 mb-1' : zone === 'top' ? 'mx-1 my-0.5' : 'mx-1'
      } ${over ? 'border-accent bg-accent/10' : 'border-accent/50'}`}
      onDragOver={droppable ? e => { if (!accepts(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true) } : undefined}
      onDragLeave={droppable ? () => setOver(false) : undefined}
      onDrop={droppable ? e => {
        setOver(false)
        if (!accepts(e)) return
        e.preventDefault()
        const id = e.dataTransfer.getData(SHELL_ITEM_MIME)
        if (!id) return
        const bar = zone as BarZone
        // Search and status live in the top bar or the sidebar only.
        if (isTwoPlaceItem(id) && bar === 'bottom') return
        moveItem(id, bar, barIndexAt(bar, e.clientX))
        announceLayout(i18nT('nav.layout_moved', { item: shellItemMeta(id)?.label ?? id, place: zoneLabel(bar) }))
      } : undefined}
    >
      <span
        // One rule for all three: the tag sits on the MIDDLE of the edge that
        // faces the page, away from the corners where two zones meet, so it can
        // only belong to its own zone.
        // Shown only while an item is being dragged, when "where can this go?"
        // is the question; the rest of the time the outlines alone mark the zones.
        className={`absolute whitespace-nowrap px-1.5 py-px rounded text-[10px] font-medium uppercase tracking-wide bg-accent text-accent-fg transition-opacity duration-150 motion-reduce:transition-none ${dragging ? 'opacity-100' : 'opacity-0'} ${
          zone === 'sidebar'
            ? 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2'
            : zone === 'top'
              ? 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2'
              : 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2'
        }`}
      >
        {zoneLabel(zone)}
      </span>
    </div>
  )
}

/** The three outlines, drawn only while editing. Place inside the desktop shell grid. */
export function LayoutZoneOutlines() {
  const editing = useLayoutEditing()
  const native = useNativeDragging()
  // A sidebar row being dragged (dnd-kit, not a native drag) counts too, so
  // the zone names show and the bar under the pointer lights up.
  const sidebar = useChromeDrag()
  const dragging = native || sidebar.active
  if (!editing) return null
  return (
    <>
      <ZoneOutline zone="top" area="topbar" dragging={dragging} sidebarOver={sidebar.over === 'top'} />
      <ZoneOutline zone="sidebar" area="nav" dragging={dragging} sidebarOver={false} />
      <ZoneOutline zone="bottom" area="status" dragging={dragging} sidebarOver={sidebar.over === 'bottom'} />
    </>
  )
}
