/**
 * The items a user placed in the top bar or the bottom bar (design
 * exploration), and, while "Edit layout" is on, the drop target for that bar.
 *
 * Outside edit mode an item is a plain control: a page opens, the terminal
 * toggles, phone connect opens its dialog. In edit mode every item drags
 * (between bars, or back onto the sidebar); the full-size dashed outline for
 * each area is drawn by `layoutZones.tsx`. The keyboard path for every move is the
 * edit panel's per-item "Show in" menu, so no move needs a drag (WCAG 2.5.7).
 */
import { useRef, useState, type DragEvent } from 'react'
import { GripVertical } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import { toggleBottomTerminal } from '../../hooks/useBottomTerminal'
import { useAppDispatch } from '../../store'
import { switchSlot } from '../../store/chatSlice'
import { i18nT } from '../../i18n/t'
import { RAIL_PIN_MIME } from '../../lib/railLayout'
import {
  FEEDBACK_ITEM, HISTORY_ITEM, PHONE_ITEM, REMOTE_ITEM, SEARCH_ITEM, SHELL_ITEM_MIME, STATUS_ITEM, TERMINAL_ITEM, announceLayout, isWindowToggle, moveItem,
  readChromeDrag, setChromeDrag, setZoneSlot, zoneDropAt, useLayoutEditing, useSearchTopSlot, useShellPlacement, useZoneSlots, useWidgetsIn,
  type BarZone, type TopSlot,
} from '../../lib/shellLayout'
import { focusPopout as focusTerminalPopout } from '../../utils/terminalPopout'
import type { AppShell } from '../appShell'
import { useBarItemMeta, zonesFor } from './shellItems'
import { ShellWidget } from './shellWidgets'

/** Widgets the top bar draws in its own slots (search centre, status capsule,
 *  remote switcher and Back/Forward on the left); BarItems draws the rest. */
const TOP_NATIVE = new Set<string>([SEARCH_ITEM, STATUS_ITEM, REMOTE_ITEM, HISTORY_ITEM])

export const zoneLabel = (z: BarZone | 'sidebar') =>
  i18nT(z === 'top' ? 'nav.layout_zone_top' : z === 'bottom' ? 'nav.layout_zone_bottom' : 'nav.layout_zone_sidebar')

/** Start dragging an item: bars read SHELL_ITEM_MIME, the sidebar reads RAIL_PIN_MIME
 *  (and sends widgets and window toggles to their own sidebar slots, not the groups). */
export function startItemDrag(e: DragEvent, id: string) {
  e.dataTransfer.setData(SHELL_ITEM_MIME, id)
  e.dataTransfer.setData(RAIL_PIN_MIME, id)
  e.dataTransfer.effectAllowed = 'move'
  // Tell the zone outlines what is moving (a native dragover cannot read the
  // data), so places that cannot take it show as unavailable. Cleared on drop
  // or drag end; both, since a moved source can unmount before its dragend.
  setChromeDrag({ id, over: null, lineX: null })
  const clear = () => {
    setChromeDrag(null)
    window.removeEventListener('dragend', clear, true)
    window.removeEventListener('drop', clear, true)
  }
  window.addEventListener('dragend', clear, true)
  window.addEventListener('drop', clear, true)
}

/** `slot`: in the top bar, which part this group draws (left, centre or right).
 *  Each part is its own drop target; widgets other than search draw on the right. */
export function BarItems({ zone, shell, slot }: { zone: BarZone; shell: AppShell; slot?: TopSlot }) {
  const placement = useShellPlacement()
  const dispatch = useAppDispatch()
  const shellItemMeta = useBarItemMeta(shell.allAppGroup)
  const searchTopSlot = useSearchTopSlot()
  const slotOf = useZoneSlots(zone)
  const inThisSlot = (id: string) => !slot || slotOf(id) === slot
  // Top bar: widgets draw in the right part (search only when it sits there).
  // Bottom bar: every widget draws in the part it was dropped in.
  const widgets = useWidgetsIn(zone).filter(id => zone === 'bottom'
    ? inThisSlot(id)
    : (!slot || slot === 'right') && (!TOP_NATIVE.has(id) || (id === SEARCH_ITEM && searchTopSlot === 'right')))
  const editing = useLayoutEditing()
  const navigate = useNavigate()
  const location = useLocation()
  const ref = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState(false)

  const ids = (zone === 'top' ? placement.top : placement.bottom).filter(inThisSlot).filter(id => {
    if (id === TERMINAL_ITEM) return shell.terminalEnabled
    if (id === PHONE_ITEM) return shell.hasRenderableMobileConnect
    return shellItemMeta(id) !== null
  })

  // Only an item that may sit in this bar (an app, Mate or session may not).
  const accepts = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(SHELL_ITEM_MIME)) return false
    const id = readChromeDrag().id
    return !id || zonesFor(id).includes(zone)
  }
  const dropHandlers = editing ? {
    onDragOver: (e: DragEvent) => { if (!accepts(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true) },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false) },
    onDrop: (e: DragEvent) => {
      setOver(false)
      if (!accepts(e)) return
      e.preventDefault()
      const id = e.dataTransfer.getData(SHELL_ITEM_MIME)
      if (!id) return
      // Dropped on one part of a bar: the item joins that part.
      const t = zoneDropAt(zone, e.clientX, id)
      setZoneSlot(zone, id, slot ?? t.slot)
      moveItem(id, zone, t.index)
      announceLayout(i18nT('nav.layout_moved', { item: shellItemMeta(id)?.label ?? id, place: zoneLabel(zone) }))
    },
  } : {}

  if (!editing && ids.length === 0 && widgets.length === 0) return null

  const act = (id: string) => {
    if (id === TERMINAL_ITEM) { if (shell.terminalPoppedOut) focusTerminalPopout(); else toggleBottomTerminal(shell.activeSlotProject); return }
    if (id === PHONE_ITEM) { shell.setMobileConnectOpen(true); return }
    if (id === FEEDBACK_ITEM) { void shell.requestFeature(); return }
    const m = shellItemMeta(id)
    // A pinned session: switch the chat to it (navigate alone does not while /chat is open).
    if (m?.sessionKey) { dispatch(switchSlot({ key: m.sessionKey, announceOnMissing: true, gesture: true })); navigate('/chat'); return }
    if (m?.path) navigate(m.path)
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
      // One part of a bar: the bar itself is the named toolbar, so its three
      // parts are not announced as three toolbars with the same name.
      role={slot ? undefined : 'toolbar'}
      aria-label={slot ? undefined : zoneLabel(zone)}
      data-layout-zone={zone}
      data-top-slot={slot ?? (zone === 'top' ? 'right' : 'left')}
      className={`flex items-center gap-1 min-w-0 rounded-md transition-colors ${over ? 'bg-accent/10' : ''} ${zone === 'top' ? 'h-8' : 'h-[22px]'}`}
      {...dropHandlers}
    >
      {widgets.map(id => <ShellWidget key={id} id={id} zone={zone} shell={shell} />)}
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
            // Feedback explains itself in real copy (it starts a chat and uses the
            // plan's monthly usage), read on focus too, not in a hover-only title.
            title={id === FEEDBACK_ITEM ? undefined : m.label}
            aria-label={m.label}
            aria-describedby={id === FEEDBACK_ITEM ? `bar-feedback-desc-${zone}` : undefined}
            aria-pressed={id === TERMINAL_ITEM || id === PHONE_ITEM ? on : undefined}
            aria-current={!isWindowToggle(id) && on ? 'page' : undefined}
            className={`group/edit relative inline-flex items-center gap-1.5 shrink-0 rounded-md border-none text-[12px] ${zone === 'top' ? 'h-7 px-2' : 'h-[22px] px-1.5'} ${editing ? 'cursor-grab active:cursor-grabbing [&_*]:cursor-grab active:[&_*]:cursor-grabbing bg-transparent text-text hover:bg-bg-hover hover:pl-4' : `cursor-pointer ${on ? 'text-text bg-bg-hover' : 'bg-transparent text-muted hover:text-text hover:bg-bg-hover'}`}`}
          >
            {/* While editing, hovering shows the item can be picked up. */}
            {editing && <GripVertical size={12} aria-hidden="true" className="absolute left-0.5 top-1/2 -translate-y-1/2 text-muted opacity-0 group-hover/edit:opacity-100" />}
            <span className="w-3.5 h-3.5 flex items-center justify-center">{m.icon}</span>
            {/* The top bar is tight: icons only there, labels in the bottom bar. */}
            {zone === 'bottom' && <span>{m.label}</span>}
            {id === FEEDBACK_ITEM && <span id={`bar-feedback-desc-${zone}`} className="sr-only">{i18nT('components.feedbackPill.request_feature_starts_agent')}</span>}
          </button>
        )
      })}
    </div>
  )
}
