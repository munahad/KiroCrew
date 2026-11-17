/**
 * The picture that follows the pointer while an item is dragged from the
 * panel, the tiles or a bar (design exploration).
 *
 * The browser would draw its own picture of whatever was picked up (a whole
 * panel row or tile, name included), even over a bar that will show the item
 * as its icon only. Instead the drag uses a blank picture and this draws the
 * item as it will land: its icon alone over an Icon only bar, its icon and name
 * anywhere else. The sidebar's own drag (dnd-kit) draws the same chip.
 */
import { useEffect, useState, type DragEvent } from 'react'

import { OverlayPortal } from '../../components/overlayRoot'
import { styleInBar } from '../../lib/barGrid'
import { useChromeDrag } from '../../lib/shellLayout'

interface Ghost { id: string; icon: string; label: string }
const EVENT = 'mc:drag-ghost'
let ghost: Ghost | null = null
let blank: HTMLImageElement | null = null

/** Call from a dragstart: swaps the browser's picture for the drawn one. */
export function startDragGhost(e: DragEvent, id: string): void {
  const el = e.currentTarget as HTMLElement
  // The item's own icon: skip the drag grip that rows and cells show on hover.
  const svg = [...el.querySelectorAll('svg, img')].find(x => !x.classList.contains('lucide-grip-vertical'))
  const label = el.getAttribute('aria-label') ?? el.querySelector('[aria-label]')?.getAttribute('aria-label') ?? (el.innerText || '').split('\n')[0]?.trim() ?? id
  if (!svg) return
  if (!blank) { blank = new Image(); blank.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' }
  e.dataTransfer.setDragImage(blank, 0, 0)
  ghost = { id, icon: svg.outerHTML, label }
  window.dispatchEvent(new Event(EVENT))
  const end = () => {
    ghost = null
    window.dispatchEvent(new Event(EVENT))
    window.removeEventListener('dragend', end, true)
    window.removeEventListener('drop', end, true)
  }
  window.addEventListener('dragend', end, true)
  window.addEventListener('drop', end, true)
}

export function DragGhost() {
  const [g, setG] = useState(ghost)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const drag = useChromeDrag()
  useEffect(() => {
    const sync = () => { setG(ghost); if (!ghost) setAt(null) }
    const move = (e: globalThis.DragEvent) => { if (ghost && (e.clientX || e.clientY)) setAt({ x: e.clientX, y: e.clientY }) }
    window.addEventListener(EVENT, sync)
    window.addEventListener('dragover', move, true)
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('dragover', move, true) }
  }, [])
  if (!g || !at) return null
  const iconOnly = !!drag.over && styleInBar(drag.over, g.id) === 'icon'
  return (
    <OverlayPortal>
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed z-[10000] flex items-center gap-1.5 rounded-md border border-accent bg-bg-elevated text-[12px] text-text shadow-lg [&_svg]:h-3.5 [&_svg]:w-3.5 [&_img]:h-4 [&_img]:w-4 ${iconOnly ? 'h-7 w-8 justify-center' : 'h-7 px-2'}`}
        style={{ left: at.x + 10, top: at.y + 10 }}
      >
        <span className="flex items-center justify-center" dangerouslySetInnerHTML={{ __html: g.icon }} />
        {!iconOnly && <span className="whitespace-nowrap">{g.label}</span>}
      </div>
    </OverlayPortal>
  )
}
