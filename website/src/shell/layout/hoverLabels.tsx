/**
 * Hover labels for icon-only items (design exploration).
 *
 * Outside Edit layout, any item that shows only its icon names itself on hover
 * or keyboard focus, in the same styled label the collapsed sidebar's page
 * rows already use: items in the top and bottom bars, and the widgets (search,
 * remote Crews, Back and forward, status, You) in a collapsed sidebar. The
 * browser's own `title` tooltip is held back while the label shows, so the two
 * never appear together. An item with a status (connection, say) reads its
 * name, then the status.
 *
 * One listener for the whole shell, so every icon-only item gets the label
 * without each component wiring its own.
 */
import { useEffect, useState } from 'react'

import { OverlayPortal } from '../../components/overlayRoot'
import { isWidgetItem, useLayoutEditing } from '../../lib/shellLayout'

interface Tip { text: string; status?: string; x: number; y: number; side: 'below' | 'above' | 'right' }

/** The element that names the hovered part: the nearest one with a name. */
function namedAt(target: Element, cell: Element): HTMLElement | null {
  let el: Element | null = target
  while (el && el !== cell.parentElement) {
    if (el instanceof HTMLElement && (el.getAttribute('aria-label') || el.getAttribute('title') || el.dataset.hlTitle)) return el
    el = el.parentElement
  }
  return cell.querySelector<HTMLElement>('[aria-label], [title]')
}

/** Icon only: the cell shows no words of its own. */
const iconOnly = (cell: HTMLElement) => (cell.innerText || '').trim().length === 0

export function HoverLabels() {
  const editing = useLayoutEditing()
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    if (editing) { setTip(null); return }
    let held: HTMLElement | null = null
    let timer: number | undefined
    const release = () => {
      if (held?.dataset.hlTitle !== undefined) { held.setAttribute('title', held.dataset.hlTitle); delete held.dataset.hlTitle }
      held = null
    }
    const hide = () => { window.clearTimeout(timer); release(); setTip(null) }

    const show = (target: Element) => {
      const bar = target.closest<HTMLElement>('[data-bar-grid] [data-bar-item]')
      const row = bar ? null : target.closest<HTMLElement>('[data-column-row]')
      const cell = bar ?? (row && isWidgetItem(row.dataset.columnRow ?? '') ? row : null)
      if (!cell || !iconOnly(cell)) { hide(); return }
      const named = namedAt(target, cell)
      if (!named) { hide(); return }
      const name = named.getAttribute('aria-label') ?? ''
      const title = named.dataset.hlTitle ?? named.getAttribute('title') ?? ''
      const text = name || title
      if (!text) { hide(); return }
      // Hold the browser's tooltip back while ours shows.
      if (held !== named) { release(); if (named.hasAttribute('title')) { named.dataset.hlTitle = title; named.removeAttribute('title') }; held = named }
      const r = named.getBoundingClientRect()
      const inBottom = !!cell.closest('[data-bar-grid="bottom"]')
      const side: Tip['side'] = row ? 'right' : inBottom ? 'above' : 'below'
      const status = name && title && title !== name ? title : undefined
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setTip({
        text, status,
        x: side === 'right' ? r.right + 8 : r.left + r.width / 2,
        y: side === 'right' ? r.top + r.height / 2 : side === 'above' ? r.top - 6 : r.bottom + 6,
        side,
      }), 250)
    }
    const over = (e: PointerEvent) => { if (e.target instanceof Element) show(e.target) }
    const focus = (e: FocusEvent) => { if (e.target instanceof Element && (e.target as HTMLElement).matches(':focus-visible')) show(e.target) }
    const out = (e: PointerEvent) => {
      const to = e.relatedTarget as Element | null
      if (!to || !to.closest('[data-bar-item], [data-column-row]')) hide()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') hide() }
    window.addEventListener('pointerover', over)
    window.addEventListener('pointerout', out)
    window.addEventListener('focusin', focus)
    window.addEventListener('focusout', hide)
    window.addEventListener('pointerdown', hide, true)
    window.addEventListener('keydown', key)
    window.addEventListener('scroll', hide, true)
    return () => {
      hide()
      window.removeEventListener('pointerover', over)
      window.removeEventListener('pointerout', out)
      window.removeEventListener('focusin', focus)
      window.removeEventListener('focusout', hide)
      window.removeEventListener('pointerdown', hide, true)
      window.removeEventListener('keydown', key)
      window.removeEventListener('scroll', hide, true)
    }
  }, [editing])

  if (!tip || editing) return null
  const transform = tip.side === 'right' ? 'translateY(-50%)' : tip.side === 'above' ? 'translate(-50%, -100%)' : 'translateX(-50%)'
  return (
    <OverlayPortal>
      <div
        role="tooltip"
        data-testid="hover-label"
        className="pointer-events-none fixed z-[9999] flex max-w-[320px] items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1 text-[13px] font-medium text-text shadow-lg"
        style={{ left: tip.x, top: tip.y, transform }}
      >
        <span className="whitespace-nowrap">{tip.text}</span>
        {tip.status && <span className="truncate text-[12px] font-normal text-muted">{tip.status}</span>}
      </div>
    </OverlayPortal>
  )
}
