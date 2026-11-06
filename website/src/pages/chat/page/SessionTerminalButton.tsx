/**
 * Terminal toggle beside the session's folder chip (design exploration).
 *
 * The docked terminal opens in the session's project folder, so the toggle
 * sits right after that folder in the composer's context shelf: "this folder,
 * open a terminal in it". With the bottom bar off (the default in this
 * exploration) this is where the terminal lives; Ctrl+` keeps working as
 * before. Hidden once the user places the terminal in the top or bottom bar
 * through "Edit layout". Desktop only.
 */
import { SquareTerminal } from 'lucide-react'

import { toggleBottomTerminal, useBottomTerminalOpen } from '../../../hooks/useBottomTerminal'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { i18nT } from '../../../i18n/t'
import { TERMINAL_ITEM, useShellPlacement } from '../../../lib/shellLayout'
import { useTerminalEnabled } from '../../../utils/terminalRegistry'
import { focusPopout as focusTerminalPopout, useTerminalPoppedOut } from '../../../utils/terminalPopout'

/** `project`: the session's project folder, where the terminal opens. */
export function SessionTerminalButton({ project }: { project?: string }) {
  const enabled = useTerminalEnabled()
  const placement = useShellPlacement()
  // Placed in the top or bottom bar, the terminal lives there instead.
  const inABar = placement.top.includes(TERMINAL_ITEM) || placement.bottom.includes(TERMINAL_ITEM)
  const isMobile = useIsMobile()
  const open = useBottomTerminalOpen()
  const poppedOut = useTerminalPoppedOut()
  if (!enabled || inABar || isMobile) return null
  const active = open || poppedOut
  const label = poppedOut
    ? i18nT('nav.session_terminal_focus')
    : open ? i18nT('nav.session_terminal_close') : i18nT('nav.session_terminal_open')
  return (
    <button
      type="button"
      onClick={() => { if (poppedOut) focusTerminalPopout(); else toggleBottomTerminal(project) }}
      aria-label={label}
      aria-pressed={active}
      title={`${label} (Ctrl+\`)`}
      className={`inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-md border-none cursor-pointer transition-colors ${active ? 'text-accent bg-accent/10 hover:bg-accent/20' : 'text-muted bg-transparent hover:text-text hover:bg-[color-mix(in_srgb,var(--bg-elevated)_84%,var(--text))]'}`}
    >
      <SquareTerminal size={13} />
    </button>
  )
}
