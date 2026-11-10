import { useRef, useState, type ReactNode } from 'react'
import { FolderPlus, Pencil, PinOff, RotateCcw, Settings2 } from 'lucide-react'

import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
  ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger,
} from '../../components/ui/context-menu'
import { i18nT } from '../../i18n/t'
import { useIsMobile } from '../../hooks/useIsMobile'
import { FALLBACK_GROUP_ID, addGroup, commitRail, moveToGroup, type RailGroup } from '../../lib/railLayout'

/** What the menu and the modal need to draw a row they do not render themselves. */
export interface RailItemMeta { label: string; icon: ReactNode }

/** Shipped titles, by group id. A user-set `title` wins over these. */
export function groupTitle(g: RailGroup): string {
  if (g.title) return g.title
  if (g.id === 'workspace') return i18nT('nav.rail_group_workspace')
  if (g.id === 'apps') return i18nT('app.apps')
  return i18nT('nav.rail_new_group')
}

/** The group a right-click landed in (on a row or its header), or null. */
function railGroupAt(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  return target.closest('[data-rail-group]')?.getAttribute('data-rail-group') ?? null
}

/** The id of the rail row a right-click landed on, or null for empty rail space. */
function railItemAt(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  return target.closest('[data-rail-item]')?.getAttribute('data-rail-item') ?? null
}

/**
 * Right-click menu over the whole layout region. One menu, not one per row:
 * the right-click records which row it landed on, so the same trigger serves a
 * row ("Unpin", "Move to group") and empty rail space ("New group"). Radix
 * supplies the keyboard form (Shift+F10 / the Menu key) on a focused row.
 */
export function RailContextMenu({ groups, onUnpin, onCustomize, onRename, onResetName, isRenamed, onRenameGroup, onGroupCreated, children }: {
  groups: readonly RailGroup[]
  onUnpin: (id: string) => void
  onCustomize: () => void
  /** Start renaming a row on the rail (its name elsewhere is untouched). */
  onRename: (id: string) => void
  onResetName: (id: string) => void
  isRenamed: (id: string) => boolean
  /** Start renaming a group you made (the base flat list has no name to edit). */
  onRenameGroup?: (groupId: string) => void
  /** A group was just created: the caller opens its name for editing. */
  onGroupCreated?: (groupId: string) => void
  children: ReactNode
}) {
  const isMobile = useIsMobile()
  const [target, setTarget] = useState<string | null>(null)
  const [targetGroup, setTargetGroup] = useState<string | null>(null)
  // Rename opens a field that takes focus; the menu must not take it back on close.
  const keepFocus = useRef(false)
  const from = target ? groups.find(g => g.items.includes(target)) : undefined
  const moveInto = (groupId: string) => { if (target) commitRail(moveToGroup(groups, target, groupId)) }
  const moveIntoNew = () => {
    if (!target) return
    const { groups: withNew, groupId } = addGroup(groups, '')
    commitRail(moveToGroup(withNew, target, groupId))
    keepFocus.current = true
    onGroupCreated?.(groupId)
  }
  const newGroup = () => {
    const { groups: withNew, groupId } = addGroup(groups, '')
    commitRail(withNew)
    keepFocus.current = true
    onGroupCreated?.(groupId)
  }
  // A group you made can be renamed; the base flat list is never shown with a name.
  const renamable = targetGroup && targetGroup !== FALLBACK_GROUP_ID && groups.some(g => g.id === targetGroup) ? targetGroup : null
  const renameGroupItem = renamable && onRenameGroup ? (
    <ContextMenuItem onSelect={() => { keepFocus.current = true; onRenameGroup(renamable) }}><Pencil size={14} />{i18nT('nav.rail_rename_group')}</ContextMenuItem>
  ) : null
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div onContextMenuCapture={e => { setTarget(railItemAt(e.target)); setTargetGroup(railGroupAt(e.target)) }} className="contents">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent onCloseAutoFocus={e => { if (keepFocus.current) { keepFocus.current = false; e.preventDefault() } }}>
        {target && from ? (
          <>
            <ContextMenuItem onSelect={() => { keepFocus.current = true; onRename(target) }}><Pencil size={14} />{i18nT('nav.rail_rename')}</ContextMenuItem>
            {isRenamed(target) && (
              <ContextMenuItem onSelect={() => onResetName(target)}><RotateCcw size={14} />{i18nT('nav.rail_reset_name')}</ContextMenuItem>
            )}
            <ContextMenuItem onSelect={() => onUnpin(target)}><PinOff size={14} />{i18nT('nav.rail_unpin')}</ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger>{i18nT('nav.rail_move_to')}</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {groups.filter(g => g.id !== from.id).map(g => (
                  <ContextMenuItem key={g.id} onSelect={() => moveInto(g.id)}>{groupTitle(g)}</ContextMenuItem>
                ))}
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={moveIntoNew}><FolderPlus size={14} />{i18nT('nav.rail_move_to_new_group')}</ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            {renameGroupItem}
          </>
        ) : (
          <>
            {renameGroupItem}
            <ContextMenuItem onSelect={newGroup}><FolderPlus size={14} />{i18nT('nav.rail_new_group')}</ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        {/* Design exploration: Edit layout is desktop-only. The phone has its
            own shell (a drawer, no top or bottom bar to place things in). */}
        {!isMobile && <ContextMenuItem onSelect={onCustomize}><Settings2 size={14} />{i18nT('nav.rail_customize')}</ContextMenuItem>}
      </ContextMenuContent>
    </ContextMenu>
  )
}
