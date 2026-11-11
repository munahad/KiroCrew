/**
 * Shell widgets wherever Edit layout puts them (design exploration): search,
 * the status cluster, the remote Crews switcher, Back/Forward and the profile
 * menu ("You"). Each has its own native slot in the sidebar and the top bar;
 * the bars draw the rest here, in their compact form.
 *
 * While editing, every widget drags like any other item (WidgetSlot), and the
 * Edit layout panel's "Show in" menu moves it without a drag (WCAG 2.5.7).
 */
import { useContext, type ReactNode } from 'react'
import { GripVertical } from 'lucide-react'

import { NavHistoryArrows } from '../../components/NavHistoryArrows'
import {
  HISTORY_ITEM, PROFILE_ITEM, REMOTE_ITEM, SEARCH_ITEM, STATUS_ITEM, useLayoutEditing, type ShellZone, type WidgetItem,
} from '../../lib/shellLayout'
import { ShellProfileMenu } from '../nav/railSettingsFlyout'
import type { AppShell } from '../appShell'
import { startItemDrag } from './barItems'
import { DragOwnedByParent } from './dragOwner'
import { SearchTrigger } from './searchTrigger'
import { SidebarStatus } from './sidebarStatus'
import { RemoteCrewSwitcher } from './remoteCrews'

/** A widget's wrapper: names it for drop indexing and lets it drag while editing. */
export function WidgetSlot({ id, children, className = '', gutter = false }: {
  id: WidgetItem
  children: ReactNode
  className?: string
  /** In the sidebar: the grip sits in the sidebar's left gutter, outside the
   *  control, so the control keeps its full width (like the rows below it).
   *  In a bar there is no gutter, so the control makes room for the grip. */
  gutter?: boolean
}) {
  const owned = useContext(DragOwnedByParent)
  const editing = useLayoutEditing() && !owned
  return (
    <div
      data-bar-item={id}
      draggable={editing}
      onDragStart={editing ? e => startItemDrag(e, id) : undefined}
      className={`relative flex items-center min-w-0 ${editing ? `group/edit rounded-md cursor-grab active:cursor-grabbing [&_*]:cursor-grab ${gutter ? '' : 'pl-3 hover:bg-bg-hover'}` : ''} ${className}`}
    >
      {editing && <GripVertical size={12} aria-hidden="true" className={`absolute top-1/2 -translate-y-1/2 text-muted opacity-0 group-hover/edit:opacity-100 ${gutter ? '-left-2.5' : 'left-0'}`} />}
      {children}
    </div>
  )
}

/** One widget, drawn for the place it is in. */
export function ShellWidget({ id, zone, shell, collapsed = false }: {
  id: WidgetItem
  zone: ShellZone
  shell: AppShell
  /** Collapsed sidebar: the narrow icon strip. */
  collapsed?: boolean
}) {
  const bar = zone === 'sidebar' ? undefined : zone
  switch (id) {
    case SEARCH_ITEM:
      return (
        <SearchTrigger
          variant={zone === 'sidebar' ? 'sidebar' : 'top'}
          collapsed={collapsed}
          onOpen={shell.commandPalette.openPalette}
          launcherOwned={!!shell.slotOwners['quick-search']}
        />
      )
    case STATUS_ITEM:
      return <SidebarStatus shell={shell} collapsed={collapsed} />
    case REMOTE_ITEM:
      // Always shown, even with no remote yet (then it offers to add one).
      return (
        <WidgetSlot id={REMOTE_ITEM} gutter={zone === 'sidebar'} className={zone === 'sidebar' && !collapsed ? 'w-full' : ''}>
          <RemoteCrewSwitcher shape={zone === 'sidebar' && collapsed ? 'icon' : 'chip'} fill={zone === 'sidebar' && !collapsed} />
        </WidgetSlot>
      )
    case HISTORY_ITEM:
      return <WidgetSlot id={HISTORY_ITEM}><NavHistoryArrows vertical={collapsed} /></WidgetSlot>
    case PROFILE_ITEM:
      return <WidgetSlot id={PROFILE_ITEM} gutter={!bar} className={bar ? '' : 'w-full'}><ShellProfileMenu shell={shell} collapsed={collapsed} compact={bar} /></WidgetSlot>
  }
}
