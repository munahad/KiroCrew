import { useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Pencil, PinOff, RotateCcw, Settings2 } from 'lucide-react'

import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from '../../components/ui/context-menu'
import { i18nT } from '../../i18n/t'
import type { RailGroup } from '../../lib/railLayout'
import { canRemove } from '../../lib/shellLayout'
import { canShiftInSidebar, shiftInSidebar } from '../../lib/sidebarGrid'

/** What the menu and the modal need to draw a row they do not render themselves. */
export interface RailItemMeta { label: string; icon: ReactNode }

/** Shipped titles, by group id. A user-set `title` wins over these. */
export function groupTitle(g: RailGroup): string {
  if (g.title) return g.title
  if (g.id === 'workspace') return i18nT('nav.rail_group_workspace')
  if (g.id === 'apps') return i18nT('app.apps')
  return i18nT('nav.rail_new_group')
}

/** The id of the rail row a right-click landed on, or null for empty rail space. */
function railItemAt(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  return target.closest('[data-rail-item]')?.getAttribute('data-rail-item') ?? null
}

/**
 * Right-click menu over the whole layout region. One menu, not one per row:
 * the right-click records which row it landed on, so the same trigger serves a
 * row (Rename, Unpin, Move up / Move down) and empty sidebar space. Every
 * form ends with "Edit layout…", so the editor is always one right-click away,
 * even in an emptied sidebar. Radix supplies the keyboard form (Shift+F10 /
 * the Menu key) on a focused row. Round 1: no user sections, so no group items.
 */
export function RailContextMenu({ groups, onUnpin, onCustomize, onRename, onResetName, isRenamed, children }: {
  groups: readonly RailGroup[]
  onUnpin: (id: string) => void
  onCustomize: () => void
  /** Start renaming a row on the rail (its name elsewhere is untouched). */
  onRename: (id: string) => void
  onResetName: (id: string) => void
  isRenamed: (id: string) => boolean
  children: ReactNode
}) {
  const [target, setTarget] = useState<string | null>(null)
  // Rename opens a field that takes focus; the menu must not take it back on close.
  const keepFocus = useRef(false)
  const from = target ? groups.find(g => g.items.includes(target)) : undefined
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div onContextMenuCapture={e => setTarget(railItemAt(e.target))} className="contents">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent onCloseAutoFocus={e => { if (keepFocus.current) { keepFocus.current = false; e.preventDefault() } }}>
        {target && from && (
          <>
            <ContextMenuItem onSelect={() => { keepFocus.current = true; onRename(target) }}><Pencil size={14} />{i18nT('nav.rail_rename')}</ContextMenuItem>
            {isRenamed(target) && (
              <ContextMenuItem onSelect={() => onResetName(target)}><RotateCcw size={14} />{i18nT('nav.rail_reset_name')}</ContextMenuItem>
            )}
            {/* "You" can move but is never removed. */}
            {canRemove(target) && (
              <ContextMenuItem onSelect={() => onUnpin(target)}><PinOff size={14} />{i18nT('nav.rail_unpin')}</ContextMenuItem>
            )}
            {/* Design exploration: reorder without opening Edit layout. Hidden at the top or bottom. */}
            {canShiftInSidebar(groups, target, -1) && (
              <ContextMenuItem onSelect={() => shiftInSidebar(groups, target, -1)}><ArrowUp size={14} />{i18nT('nav.rail_move_up')}</ContextMenuItem>
            )}
            {canShiftInSidebar(groups, target, 1) && (
              <ContextMenuItem onSelect={() => shiftInSidebar(groups, target, 1)}><ArrowDown size={14} />{i18nT('nav.rail_move_down')}</ContextMenuItem>
            )}
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onSelect={onCustomize}><Settings2 size={14} />{i18nT('nav.rail_customize')}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
