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
import { SHELL_ITEM_MIME, announceLayout, moveItem, useLayoutEditing, type BarZone, type ShellZone } from '../../lib/shellLayout'
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

function ZoneOutline({ zone, area, dragging }: { zone: ShellZone; area: string; dragging: boolean }) {
  const [over, setOver] = useState(false)
  const droppable = zone !== 'sidebar' && dragging
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(SHELL_ITEM_MIME)
  useEffect(() => { if (!dragging) setOver(false) }, [dragging])
  return (
    <div
      aria-hidden="true"
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
        moveItem(id, bar, barIndexAt(bar, e.clientX))
        announceLayout(i18nT('nav.layout_moved', { item: shellItemMeta(id)?.label ?? id, place: zoneLabel(bar) }))
      } : undefined}
    >
      <span
        className={`absolute px-1.5 py-px rounded text-[10px] font-medium uppercase tracking-wide bg-accent text-accent-fg ${
          zone === 'sidebar' ? 'left-1/2 -translate-x-1/2 -bottom-2.5' : zone === 'top' ? 'left-3 -bottom-2' : 'right-3 -top-2'
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
  const dragging = useNativeDragging()
  if (!editing) return null
  return (
    <>
      <ZoneOutline zone="top" area="topbar" dragging={dragging} />
      <ZoneOutline zone="sidebar" area="nav" dragging={dragging} />
      <ZoneOutline zone="bottom" area="status" dragging={dragging} />
    </>
  )
}
