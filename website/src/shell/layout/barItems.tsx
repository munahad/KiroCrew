/**
 * One item a user placed in the top bar or the bottom bar (design
 * exploration), drawn as a plain control: a page opens, the terminal toggles,
 * phone connect opens its dialog. Where it sits is the bar grid's job
 * (barGridView.tsx), which also makes it draggable while "Edit layout" is on.
 * The keyboard path for every move is the edit panel's per-item menu and its
 * Move left / Move right, so no move needs a drag (WCAG 2.5.7).
 */
import type { DragEvent } from 'react'
import { Fullscreen } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import { toggleBottomTerminal } from '../../hooks/useBottomTerminal'
import { IS_MAC } from '../../hooks/useKeyboardShortcuts'
import { useAppDispatch } from '../../store'
import { setAgentSwitchNotice, switchSlot } from '../../store/chatSlice'
import { i18nT } from '../../i18n/t'
import { uiLocation } from '../../uiLocations/uiLocation'
import { RAIL_PIN_MIME } from '../../lib/railLayout'
import {
  FEEDBACK_ITEM, FOCUS_ITEM, PHONE_ITEM, SHELL_ITEM_MIME, TERMINAL_ITEM, isWindowToggle, setChromeDrag, useLayoutEditing, type BarZone,
} from '../../lib/shellLayout'
import { focusPopout as focusTerminalPopout } from '../../utils/terminalPopout'
import { useItemStyle } from '../../lib/barGrid'
import type { AppShell } from '../appShell'
import { useBarItemMeta } from './shellItems'

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
  setChromeDrag({ id, over: null, lineX: null, cell: null })
  const clear = () => {
    setChromeDrag(null)
    window.removeEventListener('dragend', clear, true)
    window.removeEventListener('drop', clear, true)
  }
  window.addEventListener('dragend', clear, true)
  window.addEventListener('drop', clear, true)
}

/** What tapping a placed item does, and whether it shows as on: shared by the
 *  bars and the phone's sidebar column, so an item behaves the same anywhere. */
export function useBarItemActions(shell: AppShell) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const meta = useBarItemMeta(shell.allAppGroup)
  const act = (id: string) => {
    if (id === TERMINAL_ITEM) { if (shell.terminalPoppedOut) focusTerminalPopout(); else toggleBottomTerminal(shell.activeSlotProject); return }
    if (id === PHONE_ITEM) { shell.setMobileConnectOpen(true); return }
    if (id === FEEDBACK_ITEM) { void shell.requestFeature(); return }
    if (id === FOCUS_ITEM) { shell.toggleFocusMode(); return }
    const m = meta(id)
    // A pinned session: switch the chat to it (navigate alone does not while /chat is open).
    if (m?.sessionKey) { dispatch(switchSlot({ key: m.sessionKey, announceOnMissing: true, gesture: true })); navigate('/chat'); return }
    if (m?.path) navigate(m.path)
  }
  const pressed = (id: string) => {
    if (id === TERMINAL_ITEM) return shell.bottomTerminalOpen || shell.terminalPoppedOut
    if (id === PHONE_ITEM) return shell.mobileConnectOpen
    if (id === FOCUS_ITEM) return shell.focusMode
    const path = meta(id)?.path
    return !!path && (location.pathname === path || location.pathname.startsWith(path + '/'))
  }
  /** Whether this bar can draw the item at all right now. */
  const drawable = (id: string) => {
    if (id === TERMINAL_ITEM) return shell.terminalEnabled
    if (id === PHONE_ITEM) return shell.hasRenderableMobileConnect
    return meta(id) !== null
  }
  return { meta, act, pressed, drawable }
}

/** Focus mode, wherever Edit layout put it. The same control the top bar
 *  always had: the guide finds it by name, and on a keyboard activation that
 *  turns focus mode ON it shows how to get back out, because the toggle the
 *  user just pressed hides with the chrome and Tab cannot bring it back.
 *  (`detail === 0` is how a keyboard-synthesised click differs from a pointer
 *  click.) `showLabel`: icon and label, as dropped, or the icon only. */
export function FocusModeButton({ shell, zone, showLabel }: {
  shell: Pick<AppShell, 'focusMode' | 'toggleFocusMode' | 'focusModeChord' | 'focusModeExitMsgVisible' | 'dispatch'>
  zone: BarZone
  showLabel: boolean
}) {
  const editing = useLayoutEditing()
  const { focusMode, toggleFocusMode, focusModeChord, focusModeExitMsgVisible, dispatch } = shell
  return (
    <button
      type="button"
      data-testid="focus-mode-toggle"
      onClick={editing ? undefined : e => {
        const turningOn = !focusMode
        toggleFocusMode()
        if (turningOn && e.detail === 0 && focusModeExitMsgVisible) dispatch(setAgentSwitchNotice(focusModeExitMsgVisible))
      }}
      aria-label={i18nT('app.focus_mode')}
      aria-pressed={focusMode}
      // The chord as currently bound; the title names the default for hover.
      aria-keyshortcuts={focusModeChord ?? undefined}
      {...uiLocation('shell.focus-mode')}
      title={i18nT(IS_MAC ? 'app.focus_mode_title_mac' : 'app.focus_mode_title')}
      className={`inline-flex items-center gap-1.5 shrink-0 rounded-md border-none text-[12px] whitespace-nowrap ${zone === 'top' ? 'h-7 px-2' : 'h-[22px] px-1.5'} ${editing ? 'pointer-events-none bg-transparent text-text' : `cursor-pointer hover:bg-bg-hover transition-colors bg-transparent ${focusMode ? 'text-accent' : 'text-muted hover:text-text'}`}`}
    >
      <Fullscreen size={14} aria-hidden="true" />
      {showLabel && <span>{i18nT('app.focus_mode')}</span>}
    </button>
  )
}

/** A placed page, app, Mate, session or window toggle in a bar. */
export function BarItemButton({ id, zone, shell }: { id: string; zone: BarZone; shell: AppShell }) {
  const editing = useLayoutEditing()
  const { meta, act, pressed } = useBarItemActions(shell)
  const styleOf = useItemStyle()
  if (id === FOCUS_ITEM) return <FocusModeButton shell={shell} zone={zone} showLabel={styleOf(id) !== 'icon'} />
  const m = meta(id, 14)
  if (!m) return null
  const on = pressed(id)
  return (
    <button
      type="button"
      onClick={editing ? undefined : () => act(id)}
      // Feedback explains itself in real copy (it starts a chat and uses the
      // plan's monthly usage), read on focus too, not in a hover-only title.
      title={id === FEEDBACK_ITEM ? undefined : m.label}
      aria-label={m.label}
      aria-describedby={id === FEEDBACK_ITEM ? `bar-feedback-desc-${zone}` : undefined}
      aria-pressed={id === TERMINAL_ITEM || id === PHONE_ITEM ? on : undefined}
      aria-current={!isWindowToggle(id) && on ? 'page' : undefined}
      className={`inline-flex items-center gap-1.5 shrink-0 rounded-md border-none text-[12px] whitespace-nowrap ${zone === 'top' ? 'h-7 px-2' : 'h-[22px] px-1.5'} ${editing ? 'pointer-events-none bg-transparent text-text' : `cursor-pointer ${on ? 'text-text bg-bg-hover' : 'bg-transparent text-muted hover:text-text hover:bg-bg-hover'}`}`}
    >
      <span className="w-3.5 h-3.5 flex items-center justify-center">{m.icon}</span>
      {/* Icon and label wherever it is dropped, unless switched to the icon
          only in the edit panel: a move never changes how an item looks. */}
      {styleOf(id) !== 'icon' && <span>{m.label}</span>}
      {id === FEEDBACK_ITEM && <span id={`bar-feedback-desc-${zone}`} className="sr-only">{i18nT('components.feedbackPill.request_feature_starts_agent')}</span>}
    </button>
  )
}
