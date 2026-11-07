/**
 * The Command Bar trigger, drawn as a search field (design exploration).
 *
 * It reads as search at a glance: a magnifier, short placeholder text and the
 * keyboard hint on the right, inside a field-shaped box. Compact: a fixed,
 * modest width in the top bar's centre rather than stretching across it.
 * The same control can sit at the top of the sidebar instead; Edit layout
 * moves it between the two, and while editing it drags like any other item.
 */
import { GripVertical, Search } from 'lucide-react'

import { IS_MAC } from '../../hooks/useKeyboardShortcuts'
import { i18nT } from '../../i18n/t'
import { uiLocation } from '../../uiLocations/uiLocation'
import { SEARCH_ITEM, useLayoutEditing } from '../../lib/shellLayout'
import { startItemDrag } from './barItems'

export function SearchTrigger({ onOpen, launcherOwned, variant, collapsed = false }: {
  onOpen: () => void
  /** An app owns the quick-search slot: the gesture opens a command launcher. */
  launcherOwned: boolean
  variant: 'top' | 'sidebar'
  /** Sidebar collapsed to its icon strip: the field shrinks to a magnifier button. */
  collapsed?: boolean
}) {
  const editing = useLayoutEditing()
  const label = launcherOwned ? i18nT('app.open_command_bar') : i18nT('app.search_sessions_files_and_commands')
  const placeholder = launcherOwned ? i18nT('app.k_run_a_command') : i18nT('nav.search_placeholder')
  const chord = IS_MAC ? '⌘K' : 'Ctrl K'
  const drag = editing
    ? { draggable: true, onDragStart: (e: React.DragEvent) => startItemDrag(e, SEARCH_ITEM) }
    : {}
  const editCls = editing ? 'group/edit relative cursor-grab active:cursor-grabbing [&_*]:cursor-grab hover:bg-bg-hover' : 'cursor-pointer hover:border-text/30'

  if (variant === 'sidebar' && collapsed) {
    return (
      <button
        type="button"
        onClick={editing ? undefined : onOpen}
        aria-label={label}
        title={`${label} (${chord})`}
        data-bar-item={SEARCH_ITEM}
        {...drag}
        className={`mx-auto mb-1.5 w-9 h-8 flex items-center justify-center rounded-lg border border-border bg-bg text-muted hover:text-text ${editCls}`}
      >
        <Search size={15} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={editing ? undefined : onOpen}
      aria-label={label}
      aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'}
      data-bar-item={SEARCH_ITEM}
      data-testid={`search-trigger-${variant}`}
      // The guide system points at this control by name.
      {...uiLocation('shell.search')}
      {...drag}
      className={`h-7 flex items-center gap-2 pl-2.5 pr-1.5 rounded-lg border border-border bg-bg text-muted hover:text-text transition-colors min-w-0 ${
        variant === 'top' ? 'w-[240px] max-w-full' : 'w-full mb-1.5'
      } ${editCls}`}
    >
      {editing && <GripVertical size={12} aria-hidden="true" className="absolute left-0.5 top-1/2 -translate-y-1/2 text-muted opacity-0 group-hover/edit:opacity-100" />}
      <Search size={14} className="shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0 truncate text-left text-[13px]">{placeholder}</span>
      <kbd className="shrink-0 px-1.5 py-px rounded border border-border bg-bg-elevated text-[10px] font-medium text-muted font-sans">{chord}</kbd>
    </button>
  )
}
