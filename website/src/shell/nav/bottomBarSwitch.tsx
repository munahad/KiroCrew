/**
 * "Show bottom bar" switch for the sidebar editors (design exploration).
 *
 * The bottom bar is opt-in and off by default. Its switch lives with the other
 * layout choices in "Customize sidebar", not in the profile menu, so that menu
 * holds only places to go.
 */
import { PanelBottom } from 'lucide-react'

import { i18nT } from '../../i18n/t'
import { setShowBottomBar, useShowBottomBar } from '../../lib/shellBottomBar'

export function BottomBarSwitch() {
  const on = useShowBottomBar()
  return (
    <label className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm text-text cursor-pointer">
      <PanelBottom size={16} className="text-muted shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className="block">{i18nT('nav.show_bottom_bar')}</span>
        <span className="block text-[12px] text-muted">{i18nT('nav.show_bottom_bar_hint')}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={i18nT('nav.show_bottom_bar')}
        onClick={() => setShowBottomBar(!on)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-none cursor-pointer transition-colors ${on ? 'bg-accent' : 'bg-border'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-bg transition-[left] ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
}
