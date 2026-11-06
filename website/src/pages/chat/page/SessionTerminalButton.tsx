/**
 * Terminal toggle beside the session's folder chip (design exploration).
 *
 * The docked terminal opens in the session's project folder, so the toggle
 * sits right after that folder in the composer's context shelf: "this folder,
 * open a terminal in it". With the bottom bar off (the default in this
 * exploration) this is where the terminal lives; Ctrl+` keeps working as
 * before. Hidden while the bottom bar is on, which carries its own Terminal
 * toggle, so the two layouts stay distinct for comparison. Desktop only, like
 * the bottom bar it replaces.
 */
import { SquareTerminal } from 'lucide-react'

import { toggleBottomTerminal, useBottomTerminalOpen } from '../../../hooks/useBottomTerminal'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { i18nT } from '../../../i18n/t'
import { useShowBottomBar } from '../../../lib/shellBottomBar'
import { useTerminalEnabled } from '../../../utils/terminalRegistry'
import { focusPopout as focusTerminalPopout, useTerminalPoppedOut } from '../../../utils/terminalPopout'

/** `project`: the session's project folder, where the terminal opens. */
export function SessionTerminalButton({ project }: { project?: string }) {
  const enabled = useTerminalEnabled()
  const showBottomBar = useShowBottomBar()
  const isMobile = useIsMobile()
  const open = useBottomTerminalOpen()
  const poppedOut = useTerminalPoppedOut()
  if (!enabled || showBottomBar || isMobile) return null
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
