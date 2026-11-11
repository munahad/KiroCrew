/**
 * Status cluster at the foot of the sidebar (design exploration): the
 * connection light, the Kiro credits reading and the notifications bell,
 * moved here from the top bar so the shipped top bar is empty and hidden
 * (Linear and Slack keep their inbox and activity in the sidebar).
 *
 * Edit layout can move it back to the top bar, where the original readout
 * capsule draws it. While editing, it drags like any other item.
 */
import { useContext } from 'react'
import { GripVertical, Plug, Unplug } from 'lucide-react'

import { useLayoutEditing, STATUS_ITEM } from '../../lib/shellLayout'
import { kiroUsageSegment } from '../topbar/kiroUsageReadout'
import { NotificationsBellButton } from '../topbar/shellHeader'
import type { AppShell } from '../appShell'
import { startItemDrag } from './barItems'
import { DragOwnedByParent } from './dragOwner'

export function SidebarStatus({ shell, collapsed }: {
  shell: Pick<AppShell, 'connected' | 'gatewayStatusMsg' | 'kiroUsageState' | 'usageSegmentHidden' | 'setKiroUsageOpen'>
  collapsed: boolean
}) {
  const owned = useContext(DragOwnedByParent)
  const editing = useLayoutEditing() && !owned
  const { connected, gatewayStatusMsg, kiroUsageState, usageSegmentHidden, setKiroUsageOpen } = shell
  const seg = 'flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-transparent border-none cursor-pointer transition-colors hover:bg-bg-hover whitespace-nowrap'
  // The credits reading needs room: shown in the expanded sidebar only.
  const usage = collapsed ? null : kiroUsageSegment({ kiroUsageState, usageSegmentHidden, setKiroUsageOpen }, seg, false)
  return (
    <div
      data-bar-item={STATUS_ITEM}
      data-testid="sidebar-status"
      draggable={editing}
      onDragStart={editing ? e => startItemDrag(e, STATUS_ITEM) : undefined}
      className={`relative flex items-center text-muted ${collapsed ? 'flex-col gap-1 py-1' : 'gap-1 px-1 py-1'} ${editing ? 'group/edit rounded-lg cursor-grab active:cursor-grabbing hover:bg-bg-hover' : ''}`}
    >
      {editing && <GripVertical size={12} aria-hidden="true" className="absolute left-0 top-1/2 -translate-y-1/2 text-muted opacity-0 group-hover/edit:opacity-100" />}
      {/* Connection light. Its SHAPE carries the state (WCAG 1.4.1); hover
          names it, and the live region announces changes. */}
      <span
        className="flex items-center justify-center w-7 h-7 shrink-0"
        title={gatewayStatusMsg}
        aria-label={gatewayStatusMsg}
        role="img"
      >
        {connected
          ? <Plug size={13} strokeWidth={2.25} className="text-ok" aria-hidden="true" />
          : <Unplug size={13} strokeWidth={2.25} className="text-danger animate-pulse [animation-iteration-count:3]! motion-reduce:animate-none" aria-hidden="true" />}
        <span role="status" className="sr-only">{gatewayStatusMsg}</span>
      </span>
      {usage && <span className="flex-1 min-w-0 flex items-center text-[11px]">{usage}</span>}
      {!usage && !collapsed && <span className="flex-1" />}
      <NotificationsBellButton />
    </div>
  )
}
