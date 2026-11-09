import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DndContext, closestCenter, DragOverlay, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'

import { GripVertical } from 'lucide-react'

import { useDndSensors } from '../../hooks/useDndSensors'
import { haptic } from '../../lib/haptic'
import { i18nT } from '../../i18n/t'
import {
  FALLBACK_GROUP_ID, applyVisibleOrder, commitRail, isEntityPin, renameGroup, readRailLayout, removePin, resolveRailLayout, setRailLabel, updateRail,
  useRailLayout, writeRailLayout, type RailGroup,
} from '../../lib/railLayout'
import { SortableAppNavRow } from './appRail'
import { RailContextMenu, groupTitle, type RailItemMeta } from './railCustomize'
import { LayoutEditPanel } from '../layout/layoutEditPanel'
import { announceLayout, barDropAt, barZoneAt, moveItem, setChromeDrag, setLayoutEditing, useLayoutEditing } from '../../lib/shellLayout'
import { shellItemMeta, zonesFor } from '../layout/shellItems'

/** Stand-in drag id for an installed app: matches no bar, so bars show as unavailable. */
const APP_DRAG_ID = 'app:sidebar-only'
import { zoneLabel } from '../layout/barItems'
import { OPEN_RAIL_CUSTOMIZE_EVENT } from './railSettingsFlyout'
import { RAIL_PIN_DROP_HOST_ID, useRailNativeDrop } from './railPinDrop'
import { RailRenameInput } from './railRename'

/** Sortable id of a group's header. Prefixed so it can never equal a nav id. */
const HEADER_PREFIX = 'rail-group:'
const headerId = (groupId: string) => HEADER_PREFIX + groupId
const isHeaderId = (id: string) => id.startsWith(HEADER_PREFIX)

/**
 * Rebuild groups from the flat sortable order: each header opens its group,
 * and a row that lands above the first header joins the first group. Headers
 * never move (they are not draggable), so the group order is unchanged.
 */
export function regroupFlat(flat: readonly string[], groups: readonly RailGroup[]): RailGroup[] {
  const out: RailGroup[] = groups.map(g => ({ ...g, items: [] }))
  let current = -1
  const orphans: string[] = []
  for (const id of flat) {
    if (isHeaderId(id)) { current = out.findIndex(g => headerId(g.id) === id); continue }
    if (current < 0) orphans.push(id)
    else out[current].items.push(id)
  }
  if (out.length) out[0].items.unshift(...orphans)
  return out
}

/** A group header: a divider when collapsed, a title when expanded. It is a
 *  droppable slot in the flat list (so a row can be dropped at a group's top)
 *  but never draggable itself. */
/** A group's name typed in place over its header: Enter or leaving saves, Escape cancels. */
function GroupNameInput({ initial, onSave, onCancel }: { initial: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  // Focus on the next frame, as the row rename does: the right-click menu that
  // opened this is still closing, and focusing now would lose the field to it.
  const focused = useRef(false)
  useEffect(() => {
    const f = requestAnimationFrame(() => { ref.current?.focus(); ref.current?.select(); focused.current = true })
    return () => cancelAnimationFrame(f)
  }, [])
  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    if (save) onSave(value)
    else onCancel()
  }
  return (
    <input
      ref={ref}
      value={value}
      aria-label={i18nT('nav.rail_group_name')}
      placeholder={i18nT('nav.rail_new_group')}
      maxLength={60}
      onChange={e => setValue(e.target.value)}
      // A blur before the field ever had focus is the menu closing, not the user leaving.
      onBlur={() => { if (focused.current) finish(true) }}
      // Typing must not reach the sidebar's drag sensors.
      onPointerDown={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); finish(true) }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false) }
      }}
      className="flex-1 min-w-0 h-6 px-1.5 -mx-1.5 rounded border border-accent bg-bg text-[13px] font-medium text-text outline-none"
    />
  )
}

function GroupHeader({ group, first, collapsed, renaming = false, onRenamed }: {
  group: RailGroup
  first: boolean
  collapsed: boolean
  /** Design exploration: the header is being renamed (Rename group, or a new group). */
  renaming?: boolean
  onRenamed?: (name: string | null) => void
}) {
  const { setNodeRef } = useSortable({ id: headerId(group.id), disabled: { draggable: true, droppable: false } })
  const title = groupTitle(group)
  // Design exploration: the base list (the shipped flat list) has no header.
  // It stays a drop slot, so a row can still be dropped at the very top.
  if (group.id === FALLBACK_GROUP_ID && !group.title) {
    return <div ref={setNodeRef} role="presentation" className="h-0" />
  }
  if (collapsed) {
    return (
      <div ref={setNodeRef} role="presentation" className={first ? 'h-0' : 'py-1.5 px-2'}>
        {!first && <div aria-hidden="true" className="h-px bg-border" />}
      </div>
    )
  }
  return (
    <div ref={setNodeRef} className={`nav-section flex items-center pl-3 pr-1 pb-1 ${first ? 'pt-1' : 'pt-3'}`}>
      {renaming && onRenamed
        ? <GroupNameInput initial={group.title ?? ''} onSave={name => onRenamed(name)} onCancel={() => onRenamed(null)} />
        : /* Clipped by nowrap/overflow in a longer locale, so `title` keeps the full string. */
          <span title={title} className="text-[13px] font-medium text-muted whitespace-nowrap overflow-hidden">{title}</span>}
    </div>
  )
}

/**
 * The layout-driven part of the rail: every group in the user's rail layout,
 * with its rows drag-reorderable within a group and across groups. `available`
 * is every id the rail can currently draw; `renderItem` draws one of them.
 */
export function RailGroups({ available, renderItem, collapsed, defaultGroup, meta, unpinnedApps = [], isApp = () => false, setAppPinned }: {
  available: readonly string[]
  /** Draw one row. `label` is the user's rail-only name for it, when set. */
  renderItem: (id: string, label?: string) => ReactNode
  collapsed: boolean
  /** The group an id the layout never listed joins (e.g. a newly installed app). */
  defaultGroup?: (id: string) => string
  /** Label + icon of any id, including ones not on the rail (for the modal). */
  meta: (id: string) => RailItemMeta | null
  /** Apps unpinned through the Library, which owns app pinning. */
  unpinnedApps?: readonly string[]
  /** True for an installed-app id: its pin state lives in the Library's set, not the layout. */
  isApp?: (id: string) => boolean
  setAppPinned?: (id: string, pinned: boolean) => void
}) {
  const layout = useRailLayout()
  const groups = useMemo(() => resolveRailLayout(layout, available, defaultGroup), [layout, available, defaultGroup])
  const flat = useMemo(() => groups.flatMap(g => [headerId(g.id), ...g.items]), [groups])
  // Same 8px mouse threshold as the Apps list: a plain click must reach navigation.
  const sensors = useDndSensors({ distance: 8 })
  const [activeId, setActiveId] = useState<string | null>(null)
  // "Edit layout" edits the real canvas in place (design exploration).
  const editing = useLayoutEditing()
  // The profile menu opens the same editor from outside this component.
  useEffect(() => {
    const open = () => setLayoutEditing(true)
    window.addEventListener(OPEN_RAIL_CUSTOMIZE_EVENT, open)
    return () => window.removeEventListener(OPEN_RAIL_CUSTOMIZE_EVENT, open)
  }, [])
  // Unpin: apps go through the Library's set (the rail drops them via
  // `sortedAppGroup`); everything else is hidden in the layout itself.
  const unpin = useCallback((id: string) => {
    if (isApp(id)) setAppPinned?.(id, false)
    // A pinned session or Mate has no shipped slot to remember: it just goes.
    else if (isEntityPin(id)) updateRail(l => removePin(l, id))
    else commitRail(groups.map(g => ({ ...g, items: g.items.filter(x => x !== id) })), { add: id })
  }, [groups, isApp, setAppPinned])
  const hidden = useMemo(() => {
    const avail = new Set(available)
    return [...layout.hidden.filter(id => avail.has(id)), ...unpinnedApps]
  }, [layout.hidden, available, unpinnedApps])

  const [renaming, setRenaming] = useState<string | null>(null)
  // Design exploration: the group whose name is open for editing, if any.
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null)
  const saveGroupName = useCallback((groupId: string, name: string | null) => {
    setRenamingGroup(null)
    if (name !== null) commitRail(renameGroup(groups, groupId, name))
  }, [groups])
  const labelOf = useCallback((id: string) => layout.labels?.[id], [layout.labels])
  const saveName = useCallback((id: string, name: string | null) => {
    setRenaming(null)
    updateRail(l => setRailLabel(l, id, name))
  }, [])
  const nativeDrop = useRailNativeDrop()
  // Stable: the modal memoizes on it, and its rows show rail-only names.
  const modalMeta = useCallback((id: string) => { const m = meta(id); const l = labelOf(id); return m && l ? { ...m, label: l } : m }, [meta, labelOf])

  // Design exploration: while editing the layout, a sidebar row can be dragged
  // out onto the top or bottom bar. dnd-kit drags are pointer-based, so the
  // bars' native drop handlers never see them; the rail works out which bar
  // the pointer is over and tells the zone outlines (names and highlight).
  const pointerAt = (e: DragMoveEvent | DragEndEvent) => {
    const a = e.activatorEvent as PointerEvent | MouseEvent | TouchEvent | null
    const p = a && 'touches' in a ? a.touches[0] : (a as PointerEvent | null)
    return p ? { x: p.clientX + e.delta.x, y: p.clientY + e.delta.y } : null
  }
  /** The bar under the pointer (any item), whether this item may go there,
   *  and where in it the item would land. */
  const barTarget = (e: DragMoveEvent | DragEndEvent) => {
    const id = String(e.active.id)
    const p = editing ? pointerAt(e) : null
    const bar = p ? barZoneAt(p.x, p.y) : null
    if (!bar || !p) return null
    const allowed = !isApp(id) && zonesFor(id).includes(bar)
    return { bar, allowed, ...barDropAt(bar, p.x, id) }
  }
  const onDragStart = useCallback((e: DragStartEvent) => {
    haptic('medium')
    setActiveId(String(e.active.id))
    // Apps are sidebar-only here even when a page of the same id could sit in a bar.
    if (editing) setChromeDrag({ id: isApp(String(e.active.id)) ? APP_DRAG_ID : String(e.active.id), over: null, lineX: null })
  }, [editing, isApp])
  const onDragMove = (e: DragMoveEvent) => {
    if (!editing) return
    const t = barTarget(e)
    setChromeDrag({ over: t?.bar ?? null, lineX: t?.allowed ? t.lineX : null })
  }
  const onDragCancel = useCallback(() => { setActiveId(null); setChromeDrag(null) }, [])
  const onDragEnd = useCallback((e: DragEndEvent) => {
    setActiveId(null)
    setChromeDrag(null)
    const t = barTarget(e)
    if (t) {
      // Over a bar that cannot take it: no move, and the item slides back.
      if (!t.allowed) return
      const id = String(e.active.id)
      haptic('light')
      moveItem(id, t.bar, t.index)
      announceLayout(i18nT('nav.layout_moved', { item: shellItemMeta(id)?.label ?? id, place: zoneLabel(t.bar) }))
      return
    }
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = flat.indexOf(String(active.id))
    let to = flat.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    // Dropping onto the FIRST header means "top of the first group", which in
    // the flat list is just below that header.
    if (to === 0) to = 1
    haptic('light')
    const next = regroupFlat(arrayMove(flat, from, to), groups)
    // Merge into a fresh read: another tab may have written since this render.
    writeRailLayout(applyVisibleOrder(readRailLayout(), next))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, groups, editing, isApp])

  return (<>
    <RailContextMenu
      groups={groups}
      onUnpin={unpin}
      onCustomize={() => setLayoutEditing(true)}
      onRename={setRenaming}
      onResetName={id => saveName(id, null)}
      isRenamed={id => !!labelOf(id)}
      onRenameGroup={setRenamingGroup}
      onGroupCreated={setRenamingGroup}
    >
    {/* Drop host: sessions dragged from the chat sidebar land on the zone the
        sidebar portals in here; Mates drag natively and drop on this element. */}
    <div id={RAIL_PIN_DROP_HOST_ID} data-layout-zone="sidebar" className="relative pb-6" {...nativeDrop.handlers}>
    {nativeDrop.over && <div aria-hidden="true" className="absolute inset-0 pointer-events-none rounded-lg border-2 border-dashed border-accent bg-accent/10 z-10" />}
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
      <SortableContext items={flat} strategy={verticalListSortingStrategy}>
        {groups.map((g, gi) => (
          <div key={g.id} role="group" aria-label={groupTitle(g)} className="flex flex-col gap-0.5" data-rail-group={g.id}>
            <GroupHeader group={g} first={gi === 0} collapsed={collapsed} renaming={renamingGroup === g.id} onRenamed={name => saveGroupName(g.id, name)} />
            {g.items.map(id => (
              <SortableAppNavRow key={id} id={id}>
                <div
                  data-rail-item={id}
                  // Design exploration: while editing the layout, hovering a row shows
                  // it can be picked up, the same way the Edit layout panel's rows do
                  // (grey hover, muted grip, grab cursor).
                  className={`relative ${editing ? 'group/edit rounded-lg cursor-grab active:cursor-grabbing hover:bg-bg-hover [&_*]:cursor-grab active:[&_*]:cursor-grabbing' : ''}`}
                >
                  {renderItem(id, labelOf(id))}
                  {editing && <GripVertical size={13} aria-hidden="true" className="absolute left-0 top-1/2 -translate-y-1/2 z-10 text-muted opacity-0 group-hover/edit:opacity-100 pointer-events-none" />}
                  {renaming === id && (
                    <RailRenameInput
                      initial={labelOf(id) ?? meta(id)?.label ?? ''}
                      collapsed={collapsed}
                      onSave={name => saveName(id, name)}
                      onCancel={() => setRenaming(null)}
                    />
                  )}
                </div>
              </SortableAppNavRow>
            ))}
          </div>
        ))}
      </SortableContext>
      <DragOverlay>{activeId ? renderItem(activeId, labelOf(activeId)) : null}</DragOverlay>
    </DndContext>
    </div>
    </RailContextMenu>
    {editing && (
      <LayoutEditPanel
        groups={groups}
        hidden={hidden}
        meta={modalMeta}
        isApp={isApp}
        setAppPinned={setAppPinned}
      />
    )}
  </>)
}

/** Sortable id of a group header, for tests that build a flat order. */
export { headerId as railGroupHeaderId }
