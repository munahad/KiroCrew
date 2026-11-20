/**
 * The collapse button's lock while editing (checkpoint 57, note 20), in all
 * three options: on hover or keyboard focus of the fixed item, a small faded
 * lock where a drag handle would sit, and the label "Fixed in sidebar, can't
 * be moved". No handle, no arrows, no "⋯". The lock is lucide's Lock, the
 * icon the old "Always here" tiles used.
 *
 * Render inside an element with the `group/fixed` class; the lock and its
 * label show while that element is hovered or holds focus. Both are
 * decoration: the fixed item's own name says it is fixed ("Collapse sidebar, fixed").
 */
import { Lock } from 'lucide-react'

import { i18nT } from '../../i18n/t'

export function FixedLock({ className = '', labelSide = 'below' }: {
  /** Where the lock sits (the handle's spot of the item it marks). */
  className?: string
  /** Where its label shows, beside the lock. */
  labelSide?: 'below' | 'below-end' | 'right'
}) {
  const show = 'opacity-0 group-hover/fixed:opacity-100 group-focus-within/fixed:opacity-100 transition-opacity duration-100 motion-reduce:transition-none'
  const label = labelSide === 'below' ? 'left-0 top-full mt-1' : labelSide === 'below-end' ? 'right-0 top-full mt-1' : 'left-full top-1/2 ml-1 -translate-y-1/2'
  return (
    <span aria-hidden="true" data-testid="fixed-lock" className={`pointer-events-none flex items-center ${className}`}>
      <span className={`relative flex items-center text-muted ${show}`}>
        <Lock size={11} className="opacity-60" />
        <span className={`absolute z-[70] whitespace-nowrap rounded-md border border-border bg-bg-elevated px-1.5 py-0.5 text-[11px] text-muted shadow-md ${label}`}>
          {i18nT('nav.layout_fixed_sidebar')}
        </span>
      </span>
    </span>
  )
}
