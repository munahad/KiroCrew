import { i18nT } from '../../i18n/t'
import { BarItems, zoneLabel } from '../layout/barItems'
import type { AppShell } from '../appShell'

/** Grid row height of the status bar, in px. App.tsx sizes the shell's last track with it. */
export const STATUS_BAR_HEIGHT = 32

/**
 * Desktop bottom bar (design exploration). It ships EMPTY and is drawn only
 * when the user has placed something in it, or while "Edit layout" is on (as
 * a drop target). What it holds is the user's choice: window toggles (the
 * docked terminal, phone connect) and built-in pages. Not rendered on the
 * phone or in focus mode.
 */
export function ShellStatusBar({ shell }: { shell: AppShell }) {
  return (
    <div
      role="toolbar"
      aria-label={zoneLabel('bottom')}
      className="flex items-center gap-1 px-2 text-muted border-t border-border"
      style={{ gridArea: 'status', height: STATUS_BAR_HEIGHT }}
    >
      {/* Left, centre and right parts: an item lands in the one it is dropped on. */}
      <div className="flex-1 min-w-0 flex justify-start"><BarItems zone="bottom" slot="left" shell={shell} /></div>
      <div className="flex-1 min-w-0 flex justify-center"><BarItems zone="bottom" slot="center" shell={shell} /></div>
      <div className="flex-1 min-w-0 flex justify-end"><BarItems zone="bottom" slot="right" shell={shell} /></div>
    </div>
  )
}
