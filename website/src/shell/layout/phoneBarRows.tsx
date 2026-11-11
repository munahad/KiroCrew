/**
 * The phone's sidebar column (design exploration): items a desktop layout put
 * in the top or bottom bar, drawn as ordinary drawer rows, since the phone has
 * no bars. Tapping one does what it does in a bar.
 */
import { NavItem } from '../nav/navRow'
import type { AppShell } from '../appShell'
import { useBarItemActions } from './barItems'

export function PhoneBarRows({ ids, shell, onNavigate, label }: {
  ids: readonly string[]
  shell: AppShell
  /** Closes the drawer after a row opens its target. */
  onNavigate?: () => void
  /** Names the group for screen readers ("Top bar", "Bottom bar"). */
  label: string
}) {
  const { meta, act, pressed } = useBarItemActions(shell)
  const rows = ids.map(id => ({ id, m: meta(id, 16) })).filter(x => x.m !== null)
  if (rows.length === 0) return null
  return (
    <div role="group" aria-label={label} className="grid gap-0.5" data-testid="phone-bar-rows">
      {rows.map(({ id, m }) => (
        <NavItem
          key={id}
          navId={id}
          path={m!.path ?? '#'}
          label={m!.label}
          icon={m!.icon}
          active={pressed(id)}
          collapsed={false}
          onClickOverride={() => { act(id); onNavigate?.() }}
        />
      ))}
    </div>
  )
}
