/**
 * Right-click menu on the top and bottom bars, outside Edit layout (design
 * exploration). The sidebar already has one (Gary's), and Sketch's toolbar
 * opens "Customize Toolbar…" the same way.
 *
 * On an item: Move left / Move right (one cell), Move to another area, Remove,
 * then Edit layout…. On empty bar space: Remove all from <bar> (never "You"
 * or the Crews switcher, which are move-only) and Edit layout…. While option 1
 * edits the window, empty bar space offers Remove all alone (checkpoint 56). Opens from the
 * keyboard too (Shift+F10 or the Menu key on a focused item). Arrow keys move
 * through it; Escape or a press outside closes it and focus returns.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ArrowLeft, ArrowRight, EyeOff, ListX, PanelBottom, PanelLeft, PanelTop, Settings2 } from 'lucide-react'

import { OverlayPortal } from '../../components/overlayRoot'
import { i18nT } from '../../i18n/t'
import { barOrder, cellOf, shiftOnBar } from '../../lib/barGrid'
import { announceLayout, canRemove, isLayoutEditing, placesOf, setLayoutEditing, type BarZone } from '../../lib/shellLayout'
import { zoneLabel } from './barItems'
import { hideFromCanvas, layoutItemLabel } from './dragOnlyEdit'
import { moveInto } from './keyboardMove'

interface At { zone: BarZone; id: string | null; label: string; x: number; y: number; from: HTMLElement | null }

/** On bar chrome outside a bar's item grid (the top bar's fixed end group,
 *  its padding): hand a right-click to the grid, so the same menu opens. */
export function forwardBarContextMenu(e: MouseEvent<HTMLElement>) {
  const grid = e.currentTarget.querySelector<HTMLElement>('[data-bar-grid]')
  const target = e.target as Element | null
  if (!grid || (target && (grid.contains(target) || target.closest('input, textarea, [contenteditable="true"]')))) return
  e.preventDefault()
  grid.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY }))
}

/** Props for a bar's root element: opens the menu on right-click or Shift+F10. */
export function useBarContextMenu(zone: BarZone, editing: boolean) {
  const [at, setAt] = useState<At | null>(null)
  const open = (target: Element, x: number, y: number) => {
    const cell = target.closest<HTMLElement>('[data-bar-item]')
    const id = cell?.dataset.barItem ?? null
    const named = cell?.querySelector<HTMLElement>('[aria-label]')
    setAt({ zone, id, label: id ? named?.getAttribute('aria-label') ?? layoutItemLabel(id) : '', x, y, from: document.activeElement as HTMLElement | null })
  }
  const props = editing ? {} : {
    onContextMenu: (e: MouseEvent<HTMLElement>) => { e.preventDefault(); open(e.target as Element, e.clientX, e.clientY) },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      // An item's own menu (edit mode) took the key first.
      if (e.defaultPrevented) return
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault()
        const r = (e.target as HTMLElement).getBoundingClientRect()
        open(e.target as Element, r.left, zone === 'bottom' ? r.top : r.bottom)
      }
    },
  }
  const menu = at ? <BarMenu at={at} close={() => { at.from?.focus?.(); setAt(null) }} /> : null
  return { props, menu }
}

/** Remove every item a bar holds, except "You" and the Crews switcher. Each
 *  removal can be undone on its own (Undo, Cmd/Ctrl+Z). */
export function removeAllFrom(zone: BarZone): void {
  for (const id of barOrder(zone)) if (canRemove(id)) hideFromCanvas(id)
}

function BarMenu({ at, close }: { at: At; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    const w = r?.width ?? 220, h = r?.height ?? 200
    const top = at.zone === 'bottom' ? at.y - h - 4 : at.y + 4
    setPos({ left: Math.min(at.x, window.innerWidth - w - 8), top: Math.max(8, Math.min(top, window.innerHeight - h - 8)) })
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
  }, [at])
  useEffect(() => {
    const onScroll = () => close()
    window.addEventListener('resize', onScroll)
    return () => window.removeEventListener('resize', onScroll)
  }, [close])

  const items: { key: string; text: string; icon: JSX.Element; run: () => void; divider?: boolean }[] = []
  if (at.id) {
    const id = at.id
    const cell = cellOf(at.zone, id)
    if (cell && cell.col > 0) items.push({ key: 'left', icon: <ArrowLeft size={13} />, text: i18nT('nav.layout_move_left', { item: at.label }), run: () => { if (shiftOnBar(at.zone, id, -1)) announceLayout(i18nT('nav.layout_moved_left', { item: at.label })) } })
    if (cell && cell.col < cell.max) items.push({ key: 'right', icon: <ArrowRight size={13} />, text: i18nT('nav.layout_move_right', { item: at.label }), run: () => { if (shiftOnBar(at.zone, id, 1)) announceLayout(i18nT('nav.layout_moved_right', { item: at.label })) } })
    for (const z of ['top', 'sidebar', 'bottom'] as const) {
      if (z === at.zone || !placesOf(id).includes(z)) continue
      const Icon = z === 'top' ? PanelTop : z === 'bottom' ? PanelBottom : PanelLeft
      items.push({ key: `to-${z}`, icon: <Icon size={13} />, text: i18nT('nav.layout_kbd_move_to', { place: zoneLabel(z) }), run: () => { moveInto(id, z, 'end'); announceLayout(i18nT('nav.layout_moved', { item: at.label, place: zoneLabel(z) })) } })
    }
    if (canRemove(id)) items.push({ key: 'remove', icon: <EyeOff size={13} />, text: i18nT('nav.layout_kbd_remove'), run: () => hideFromCanvas(id, at.label) })
  }
  // Empty bar space: Remove all, when it saves clicks: two or more items that
  // can go ("You" and the Crews switcher never count), as option 3's.
  if (!at.id && barOrder(at.zone).filter(canRemove).length >= 2) {
    items.push({ key: 'remove-all', icon: <ListX size={13} />, text: i18nT('nav.layout_remove_all_from', { place: zoneLabel(at.zone) }), run: () => removeAllFrom(at.zone) })
  }
  if (!isLayoutEditing()) items.push({ key: 'edit', icon: <Settings2 size={13} />, text: i18nT('nav.rail_customize'), run: () => setLayoutEditing(true), divider: items.length > 0 })

  // Nothing to offer (editing, and nothing here can go): no menu.
  if (items.length === 0) { queueMicrotask(close); return null }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const i = list.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus() }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); list[e.key === 'Home' ? 0 : list.length - 1]?.focus() }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); close() }
  }
  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-[84]" aria-hidden="true" onPointerDown={close} onContextMenu={e => { e.preventDefault(); close() }} />
      <div
        ref={ref}
        role="menu"
        tabIndex={-1}
        aria-label={at.id ? i18nT('nav.layout_kbd_menu', { item: at.label }) : zoneLabel(at.zone)}
        onKeyDown={onKey}
        data-testid="bar-context-menu"
        className="fixed z-[85] min-w-[200px] max-w-[280px] rounded-lg border border-border bg-bg-elevated p-1 text-text shadow-xl"
        style={pos ?? { left: at.x, top: at.y, visibility: 'hidden' }}
      >
        {items.map(x => (
          <div key={x.key}>
            {x.divider && <div role="separator" className="my-1 h-px bg-border" />}
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => { x.run(); close() }}
              className="flex w-full items-center gap-2 rounded-md border-none bg-transparent px-2.5 py-1.5 text-left text-[13px] text-text cursor-pointer hover:bg-bg-hover focus-visible:bg-bg-hover outline-none [&_svg]:shrink-0 [&_svg]:text-muted"
            >
              {x.icon}{x.text}
            </button>
          </div>
        ))}
      </div>
    </OverlayPortal>
  )
}
