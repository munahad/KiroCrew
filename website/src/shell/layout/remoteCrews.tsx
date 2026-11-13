/**
 * Remote Crews switcher (design exploration): one control for picking which
 * Crew you are working in, wherever Edit layout puts it.
 *
 * Unlike the shipped switcher (components/InstanceTabBar), which draws nothing
 * until a remote Crew exists, this one is always there: with no remote it
 * shows "Local" and offers "Add remote crew", so the place it holds in the
 * layout is visible and the way to add one is one click away.
 *
 * Shapes: a chip with the active Crew's name (sidebar, bars) or an icon button
 * (collapsed sidebar). `RemoteCrewList` is the same list as plain rows, for
 * the profile menu's "Switch remote…" dialog.
 *
 * Data and switching are the shipped ones: the shared ['instances'] query,
 * `visibleInstanceTabs` for which Crews have an entry, and `useSelectInstance`
 * (the hook the switcher and the ⌘/Ctrl+digit chord share).
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, Home, Plus, Server } from 'lucide-react'

import { api, type InstanceView } from '../../api/client'
import { visibleInstanceTabs } from '../../components/InstanceTabBar'
import { settingsPath } from '../../components/settingsPath'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { useSelectInstance } from '../../hooks/useSelectInstance'
import { i18nT } from '../../i18n/t'
import { isEmbeddedPane } from '../../lib/embedded'
import { useAppSelector } from '../../store'
import { isInstancesDisabledError } from '../../utils/instancesDisabled'

interface CrewRow { id: string | null; name: string; detail: string; state?: string }

/** The Crews you can switch to: Local first, then each remote with an entry. */
function useCrews() {
  const embedded = isEmbeddedPane()
  const query = useQuery({ queryKey: ['instances'], queryFn: () => api.listInstances(), enabled: !embedded })
  const warm = useAppSelector(s => s.instances?.warm ?? {})
  const activeId = useAppSelector(s => s.instances?.activeId ?? null)
  const instances = useMemo<InstanceView[]>(() => query.data?.instances ?? [], [query.data?.instances])
  const { selectInstance } = useSelectInstance(instances)
  const rows = useMemo<CrewRow[]>(() => [
    { id: null, name: i18nT('components.instanceTabBar.local'), detail: i18nT('components.instanceTabBar.local_dashboard') },
    ...visibleInstanceTabs(instances, warm).map(inst => ({
      id: inst.id,
      name: inst.name,
      detail: (inst.connection_method === 'ssm' ? inst.ssm_target : inst.ssh_host) ?? '',
      state: inst.status?.state,
    })),
  ], [instances, warm])
  // Remote Crews turned off on this Crew: the list is Local alone, plus "Add
  // remote crew". The switcher still shows (design exploration: it is a
  // default shell item, so a drop must always draw it); only a remote pane
  // embedded in another Crew's window, which has its own switcher, hides it.
  const remotesOff = isInstancesDisabledError(query.error)
  return { rows, activeId, selectInstance, disabled: embedded, remotesOff }
}

const dotCls = (state?: string) =>
  state === 'connected' ? 'bg-[var(--ok)]' : state === 'connecting' ? 'bg-[var(--warn)]' : 'bg-[var(--danger)]'

function CrewIcon({ row }: { row: CrewRow }) {
  if (row.id === null) return <Home size={14} aria-hidden="true" />
  return <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls(row.state)}`} aria-hidden="true" />
}

/** The switcher control. `shape`: chip with a name, or icon only. */
export function RemoteCrewSwitcher({ shape = 'chip', fill = false }: { shape?: 'chip' | 'icon'; fill?: boolean }) {
  const navigate = useNavigate()
  const { rows, activeId, selectInstance, disabled } = useCrews()
  if (disabled) return null
  const active = rows.find(r => r.id === activeId) ?? rows[0]
  const label = i18nT('components.instanceTabBar.switch_crew')
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {shape === 'icon' ? (
          <button
            type="button"
            aria-label={`${label}: ${active.name}`}
            title={`${label}: ${active.name}`}
            className="relative mx-auto flex items-center justify-center w-9 h-8 rounded-lg border border-border bg-bg text-muted hover:text-text cursor-pointer"
          >
            <Server size={15} aria-hidden="true" />
            {active.id !== null && <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${dotCls(active.state)}`} aria-hidden="true" />}
          </button>
        ) : (
          <button
            type="button"
            aria-label={`${label}: ${active.name}`}
            className={`h-7 flex items-center gap-1.5 pl-2 pr-1.5 rounded-lg border border-border bg-bg text-[13px] text-text hover:bg-bg-hover cursor-pointer min-w-0 ${fill ? 'w-full' : 'max-w-[200px]'}`}
          >
            <span className="shrink-0 flex items-center text-muted"><CrewIcon row={active} /></span>
            <span className="flex-1 min-w-0 truncate text-left">{active.name}</span>
            <ChevronDown size={13} aria-hidden="true" className="shrink-0 text-muted" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px] max-w-[300px]" aria-label={i18nT('components.instanceTabBar.instances')}>
        {rows.map(r => (
          <DropdownMenuItem key={r.id ?? 'local'} onSelect={() => selectInstance(r.id)} className="flex items-center gap-2">
            <span className="w-4 flex items-center justify-center shrink-0 text-muted"><CrewIcon row={r} /></span>
            <span className="flex-1 min-w-0">
              <span className="block truncate text-[13px]">{r.name}</span>
              {r.detail && <span className="block truncate text-[11px] text-muted">{r.detail}</span>}
            </span>
            {r.id === activeId && <Check size={14} aria-hidden="true" className="shrink-0 text-accent" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate(settingsPath({ tab: 'instances' }))} className="flex items-center gap-2">
          <span className="w-4 flex items-center justify-center shrink-0 text-muted"><Plus size={14} aria-hidden="true" /></span>
          <span className="text-[13px]">{i18nT('pages.settings.instancesPanel.add_remote_crew')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The same Crews as plain rows, for the profile menu's "Switch remote…" dialog. */
export function RemoteCrewList({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const { rows, activeId, selectInstance } = useCrews()
  return (
    <div role="list" aria-label={i18nT('components.instanceTabBar.instances')} className="flex flex-col gap-0.5">
      {rows.map(r => (
        <button
          key={r.id ?? 'local'}
          type="button"
          role="listitem"
          aria-current={r.id === activeId ? 'true' : undefined}
          onClick={() => { selectInstance(r.id); onDone() }}
          className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg border-none text-left cursor-pointer ${r.id === activeId ? 'bg-bg-hover text-text' : 'bg-transparent text-text hover:bg-bg-hover'}`}
        >
          <span className="w-4 flex items-center justify-center shrink-0 text-muted"><CrewIcon row={r} /></span>
          <span className="flex-1 min-w-0">
            <span className="block truncate text-sm">{r.name}</span>
            {r.detail && <span className="block truncate text-[12px] text-muted">{r.detail}</span>}
          </span>
          {r.id === activeId && <Check size={15} aria-hidden="true" className="shrink-0 text-accent" />}
        </button>
      ))}
      <button
        type="button"
        onClick={() => { onDone(); navigate(settingsPath({ tab: 'instances' })) }}
        className="mt-1 flex items-center gap-2.5 px-2.5 py-2 rounded-lg border-none bg-transparent text-left text-sm text-muted hover:text-text hover:bg-bg-hover cursor-pointer"
      >
        <span className="w-4 flex items-center justify-center shrink-0"><Plus size={15} aria-hidden="true" /></span>
        {i18nT('pages.settings.instancesPanel.add_remote_crew')}
      </button>
    </div>
  )
}
