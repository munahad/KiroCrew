/**
 * Right-click menu on the top and bottom bars, outside Edit layout (design
 * exploration). The sidebar already has one (Gary's), and Sketch's toolbar
 * opens "Customize Toolbar…" the same way.
 *
 * On an item: Move left / Move right (one cell), Move to another area, Remove,
 * then Edit layout…. On empty bar space: Edit layout… only. Opens from the
 * keyboard too (Shift+F10 or the Menu key on a focused item). Arrow keys move
 * through it; Escape or a press outside closes it and focus returns.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ArrowLeft, ArrowRight, EyeOff, PanelBottom, PanelLeft, PanelTop, Settings2 } from 'lucide-react'

import { OverlayPortal } from '../../components/overlayRoot'
import { i18nT } from '../../i18n/t'
import { cellOf, shiftOnBar } from '../../lib/barGrid'
import { announceLayout, setLayoutEditing, type BarZone } from '../../lib/shellLayout'
import { zoneLabel } from './barItems'
import { hideFromCanvas, layoutItemLabel } from './dragOnlyEdit'
import { moveInto } from './keyboardMove'

interface At { zone: BarZone; id: string | null; label: string; x: number; y: number; from: HTMLElement | null }

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
      if (z === at.zone) continue
      const Icon = z === 'top' ? PanelTop : z === 'bottom' ? PanelBottom : PanelLeft
      items.push({ key: `to-${z}`, icon: <Icon size={13} />, text: i18nT('nav.layout_kbd_move_to', { place: zoneLabel(z) }), run: () => { moveInto(id, z, 'end'); announceLayout(i18nT('nav.layout_moved', { item: at.label, place: zoneLabel(z) })) } })
    }
    items.push({ key: 'remove', icon: <EyeOff size={13} />, text: i18nT('nav.layout_kbd_remove'), run: () => hideFromCanvas(id, at.label) })
  }
  items.push({ key: 'edit', icon: <Settings2 size={13} />, text: i18nT('nav.rail_customize'), run: () => setLayoutEditing(true), divider: !!at.id })

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
