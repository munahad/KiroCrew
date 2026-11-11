/**
 * Window toggles in the sidebar (design exploration): the terminal, Connect
 * your phone and Send feedback, when Edit layout puts them there. They are
 * actions, not pages, so they sit in their own rows at the foot of the
 * sidebar, above the status row, instead of in the sidebar's groups.
 */
import {
  FEEDBACK_ITEM, FOCUS_ITEM, PHONE_ITEM, TERMINAL_ITEM, useLayoutEditing, useShellPlacement,
} from '../../lib/shellLayout'
import { toggleBottomTerminal } from '../../hooks/useBottomTerminal'
import { focusPopout as focusTerminalPopout } from '../../utils/terminalPopout'
import { NavItem } from '../nav/navRow'
import type { AppShell } from '../appShell'
import { startItemDrag } from './barItems'
import { shellItemMeta } from './shellItems'

export function SidebarTools({ shell, collapsed }: { shell: AppShell; collapsed: boolean }) {
  const placement = useShellPlacement()
  const editing = useLayoutEditing()
  const ids = placement.side.filter(id => {
    if (id === TERMINAL_ITEM) return shell.terminalEnabled
    if (id === PHONE_ITEM) return shell.hasRenderableMobileConnect
    return id === FEEDBACK_ITEM || id === FOCUS_ITEM
  })
  if (ids.length === 0) return null
  const act = (id: string) => {
    if (id === TERMINAL_ITEM) { if (shell.terminalPoppedOut) focusTerminalPopout(); else toggleBottomTerminal(shell.activeSlotProject); return }
    if (id === PHONE_ITEM) { shell.setMobileConnectOpen(true); return }
    if (id === FOCUS_ITEM) { shell.toggleFocusMode(); return }
    void shell.requestFeature()
  }
  const pressed = (id: string) =>
    id === TERMINAL_ITEM ? shell.bottomTerminalOpen || shell.terminalPoppedOut
      : id === PHONE_ITEM ? shell.mobileConnectOpen
        : id === FOCUS_ITEM ? shell.focusMode : false
  return (
    <div className="grid gap-0.5" data-testid="sidebar-tools">
      {ids.map(id => {
        const m = shellItemMeta(id)!
        return (
          <div
            key={id}
            data-bar-item={id}
            draggable={editing}
            onDragStart={editing ? e => startItemDrag(e, id) : undefined}
            className={editing ? 'rounded-lg cursor-grab active:cursor-grabbing [&_*]:cursor-grab' : ''}
          >
            <NavItem
              path="#"
              label={m.label}
              icon={m.icon}
              active={pressed(id)}
              pressed={id === FEEDBACK_ITEM ? undefined : pressed(id)}
              collapsed={collapsed}
              onClickOverride={editing ? () => {} : () => act(id)}
            />
          </div>
        )
      })}
    </div>
  )
}
