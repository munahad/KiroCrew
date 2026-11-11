import { zoneLabel } from '../layout/barItems'
import { BarGrid } from '../layout/barGridView'
import type { AppShell } from '../appShell'

/** Grid row height of the status bar, in px. App.tsx sizes the shell's last track with it. */
export const STATUS_BAR_HEIGHT = 32

/**
 * Desktop bottom bar (design exploration). It ships EMPTY and is drawn only
 * when the user has placed something in it, or while "Edit layout" is on (as
 * a drop target). What it holds is the user's choice, each item in the cells
 * it was dropped on (lib/barGrid.ts). Not rendered on the phone or in focus mode.
 */
export function ShellStatusBar({ shell }: { shell: AppShell }) {
  return (
    <div
      role="toolbar"
      aria-label={zoneLabel('bottom')}
      className="flex items-center px-2 text-muted border-t border-border"
      style={{ gridArea: 'status', height: STATUS_BAR_HEIGHT }}
    >
      <BarGrid zone="bottom" shell={shell} />
    </div>
  )
}
