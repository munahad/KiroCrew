/**
 * The items a user placed in the top bar or the bottom bar (design
 * exploration), and, while "Edit layout" is on, the drop target for that bar.
 *
 * Outside edit mode an item is a plain control: a page opens, the terminal
 * toggles, phone connect opens its dialog. In edit mode every item drags
 * (between bars, or back onto the sidebar) and the bar shows a dashed outline;
 * an empty bar shows where to drop. The keyboard path for every move is the
 * edit panel's per-item "Show in" menu, so no move needs a drag (WCAG 2.5.7).
 */
import { useRef, useState, type DragEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { toggleBottomTerminal } from '../../hooks/useBottomTerminal'
import { i18nT } from '../../i18n/t'
import { RAIL_PIN_MIME } from '../../lib/railLayout'
import {
  PHONE_ITEM, SHELL_ITEM_MIME, TERMINAL_ITEM, announceLayout, isWindowToggle, moveItem, useLayoutEditing, useShellPlacement,
  type BarZone,
} from '../../lib/shellLayout'
import { focusPopout as focusTerminalPopout } from '../../utils/terminalPopout'
import type { AppShell } from '../appShell'
import { shellItemMeta } from './shellItems'

export const zoneLabel = (z: BarZone | 'sidebar') =>
  i18nT(z === 'top' ? 'nav.layout_zone_top' : z === 'bottom' ? 'nav.layout_zone_bottom' : 'nav.layout_zone_sidebar')

/** Start dragging an item: bars read SHELL_ITEM_MIME, the sidebar reads RAIL_PIN_MIME. */
export function startItemDrag(e: DragEvent, id: string) {
  e.dataTransfer.setData(SHELL_ITEM_MIME, id)
  if (!isWindowToggle(id)) e.dataTransfer.setData(RAIL_PIN_MIME, id)
  e.dataTransfer.effectAllowed = 'move'
}

export function BarItems({ zone, shell }: { zone: BarZone; shell: Pick<AppShell, 'terminalEnabled' | 'terminalPoppedOut' | 'bottomTerminalOpen' | 'activeSlotProject' | 'hasRenderableMobileConnect' | 'mobileConnectOpen' | 'setMobileConnectOpen'> }) {
  const placement = useShellPlacement()
  const editing = useLayoutEditing()
  const navigate = useNavigate()
  const location = useLocation()
  const ref = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState(false)

  const ids = (zone === 'top' ? placement.top : placement.bottom).filter(id => {
    if (id === TERMINAL_ITEM) return shell.terminalEnabled
    if (id === PHONE_ITEM) return shell.hasRenderableMobileConnect
    return shellItemMeta(id) !== null
  })

  // Drop index: before the first item whose middle is right of the pointer.
  const indexAt = (x: number) => {
    const els = [...(ref.current?.querySelectorAll<HTMLElement>('[data-bar-item]') ?? [])]
    const i = els.findIndex(el => { const r = el.getBoundingClientRect(); return r.left + r.width / 2 > x })
    return i < 0 ? els.length : i
  }
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(SHELL_ITEM_MIME)
  const dropHandlers = editing ? {
    onDragOver: (e: DragEvent) => { if (!accepts(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true) },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false) },
    onDrop: (e: DragEvent) => {
      setOver(false)
      if (!accepts(e)) return
      e.preventDefault()
      const id = e.dataTransfer.getData(SHELL_ITEM_MIME)
      if (!id) return
      moveItem(id, zone, indexAt(e.clientX))
      announceLayout(i18nT('nav.layout_moved', { item: shellItemMeta(id)?.label ?? id, place: zoneLabel(zone) }))
    },
  } : {}

  if (!editing && ids.length === 0) return null

  const act = (id: string) => {
    if (id === TERMINAL_ITEM) { if (shell.terminalPoppedOut) focusTerminalPopout(); else toggleBottomTerminal(shell.activeSlotProject); return }
    if (id === PHONE_ITEM) { shell.setMobileConnectOpen(true); return }
    const path = shellItemMeta(id)?.path
    if (path) navigate(path)
  }
  const pressed = (id: string) => {
    if (id === TERMINAL_ITEM) return shell.bottomTerminalOpen || shell.terminalPoppedOut
    if (id === PHONE_ITEM) return shell.mobileConnectOpen
    const path = shellItemMeta(id)?.path
    return !!path && (location.pathname === path || location.pathname.startsWith(path + '/'))
  }

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={zoneLabel(zone)}
      data-layout-zone={zone}
      className={`flex items-center gap-1 min-w-0 rounded-md transition-colors ${editing ? `border border-dashed px-1 ${over ? 'border-accent bg-accent/10' : 'border-accent/60'}` : ''} ${zone === 'top' ? 'h-8' : 'h-[22px]'}`}
      {...dropHandlers}
    >
      {ids.map(id => {
        const m = shellItemMeta(id, 14)!
        const on = pressed(id)
        return (
          <button
            key={id}
            type="button"
            data-bar-item={id}
            draggable={editing}
            onDragStart={editing ? e => startItemDrag(e, id) : undefined}
            onClick={editing ? undefined : () => act(id)}
            title={m.label}
            aria-label={m.label}
            aria-pressed={isWindowToggle(id) ? on : undefined}
            aria-current={!isWindowToggle(id) && on ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 shrink-0 rounded-md border-none text-[12px] ${zone === 'top' ? 'h-7 px-2' : 'h-[22px] px-1.5'} ${editing ? 'cursor-grab bg-bg-hover text-text' : `cursor-pointer ${on ? 'text-text bg-bg-hover' : 'bg-transparent text-muted hover:text-text hover:bg-bg-hover'}`}`}
          >
            <span className="w-3.5 h-3.5 flex items-center justify-center">{m.icon}</span>
            {/* The top bar is tight: icons only there, labels in the bottom bar. */}
            {zone === 'bottom' && <span>{m.label}</span>}
          </button>
        )
      })}
      {editing && ids.length === 0 && (
        <span className="px-2 text-[11px] text-accent whitespace-nowrap">{i18nT('nav.layout_drop_here', { place: zoneLabel(zone) })}</span>
      )}
    </div>
  )
}
