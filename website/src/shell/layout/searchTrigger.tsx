/**
 * The Command Bar trigger, drawn as a search field (design exploration).
 *
 * It reads as search at a glance: a magnifier, short placeholder text and the
 * keyboard hint on the right, inside a field-shaped box. Compact: a fixed,
 * modest width in the top bar's centre rather than stretching across it.
 * The same control can sit at the top of the sidebar instead; Edit layout
 * moves it between the two, and while editing it drags like any other item.
 *
 * "Show as icon" (the search row in Edit layout) draws it as the magnifier
 * alone, wherever it lives. In the expanded sidebar that icon moves up into
 * the header row, next to Back/Forward, instead of taking a row of its own.
 *
 * Responsive: when the top bar gets narrow (a small window, or a wide sidebar
 * plus the activity panel), the field shrinks to a magnifier button so the
 * other controls keep their room. It keeps its name and shortcut for
 * assistive tech either way.
 */
import { useContext, useEffect, useRef, useState } from 'react'
import { GripVertical, Search } from 'lucide-react'

import { IS_MAC } from '../../hooks/useKeyboardShortcuts'
import { i18nT } from '../../i18n/t'
import { uiLocation } from '../../uiLocations/uiLocation'
import { SEARCH_ITEM, useLayoutEditing, useSearchStyle } from '../../lib/shellLayout'
import { startItemDrag } from './barItems'
import { DragOwnedByParent } from './dragOwner'

/** Below this top-bar width (px) the top-bar field becomes an icon. */
export const SEARCH_ICON_BELOW = 820

/** Whether the top bar this element sits in is narrower than SEARCH_ICON_BELOW.
 *  Measures the BAR, not the field's own cell, so the switch cannot oscillate
 *  when the narrower trigger gives its track back. Marks the bar so its centre
 *  track shrinks to the icon too. */
function useNarrowTopBar(enabled: boolean) {
  const ref = useRef<HTMLButtonElement>(null)
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const bar = enabled ? ref.current?.closest<HTMLElement>('.topbar') : null
    if (!bar || typeof ResizeObserver === 'undefined') return
    const check = () => setNarrow(bar.getBoundingClientRect().width < SEARCH_ICON_BELOW)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(bar)
    return () => { ro.disconnect(); bar.removeAttribute('data-search-compact') }
  }, [enabled])
  useEffect(() => {
    const bar = ref.current?.closest<HTMLElement>('.topbar')
    if (!bar) return
    if (enabled && narrow) bar.setAttribute('data-search-compact', '')
    else bar.removeAttribute('data-search-compact')
  }, [enabled, narrow])
  return { ref, narrow: enabled && narrow }
}

export function SearchTrigger({ onOpen, launcherOwned, variant, collapsed = false, inHeader = false }: {
  onOpen: () => void
  /** An app owns the quick-search slot: the gesture opens a command launcher. */
  launcherOwned: boolean
  variant: 'top' | 'sidebar'
  /** Sidebar collapsed to its icon strip: the field shrinks to a magnifier button. */
  collapsed?: boolean
  /** "Show as icon" in the expanded sidebar: a borderless icon in the header
   *  row, sized like the Back/Forward arrows beside it. */
  inHeader?: boolean
}) {
  const editing = useLayoutEditing()
  const iconStyle = useSearchStyle() === 'icon'
  const { ref, narrow } = useNarrowTopBar(variant === 'top')
  // An icon in the top bar gives its centre track back, as a narrow bar does.
  useEffect(() => {
    if (variant !== 'top' || !iconStyle) return
    const bar = ref.current?.closest<HTMLElement>('.topbar')
    bar?.setAttribute('data-search-compact', '')
    return () => { if (!narrow) bar?.removeAttribute('data-search-compact') }
  }, [variant, iconStyle, narrow, ref])
  const label = launcherOwned ? i18nT('app.open_command_bar') : i18nT('app.search_sessions_files_and_commands')
  const placeholder = launcherOwned ? i18nT('app.k_run_a_command') : i18nT('nav.search_placeholder')
  const chord = IS_MAC ? '⌘K' : 'Ctrl K'
  // Inside a sidebar row or a bar cell, that wrapper owns the drag.
  const owned = useContext(DragOwnedByParent)
  const drag = editing && !owned
    ? { draggable: true, onDragStart: (e: React.DragEvent) => startItemDrag(e, SEARCH_ITEM) }
    : {}
  const editCls = editing ? 'group/edit relative cursor-grab active:cursor-grabbing [&_*]:cursor-grab hover:bg-bg-hover' : 'cursor-pointer hover:border-text/30'

  // Header-row icon (expanded sidebar, "Show as icon").
  if (inHeader) {
    return (
      <button
        type="button"
        onClick={editing ? undefined : onOpen}
        aria-label={label}
        title={`${label} (${chord})`}
        aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'}
        data-bar-item={SEARCH_ITEM}
        data-testid="search-trigger-sidebar"
        {...drag}
        className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-md bg-transparent border-none text-muted hover:text-text hover:bg-bg-hover ${editing ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
      >
        <Search size={15} />
      </button>
    )
  }

  // Collapsed sidebar, a narrow top bar, or "Show as icon": a magnifier button only.
  if ((variant === 'sidebar' && collapsed) || narrow || iconStyle) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={editing ? undefined : onOpen}
        aria-label={label}
        title={`${label} (${chord})`}
        aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'}
        data-bar-item={SEARCH_ITEM}
        data-testid={`search-trigger-${variant}`}
        {...drag}
        className={`${variant === 'top' ? 'h-7 w-8' : 'mx-auto mb-1.5 w-9 h-8'} shrink-0 flex items-center justify-center rounded-lg border border-border bg-bg text-muted hover:text-text ${editCls}`}
      >
        <Search size={15} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={editing ? undefined : onOpen}
      aria-label={launcherOwned ? i18nT('app.open_command_bar') : i18nT('app.search_sessions_files_and_commands')}
      aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'}
      data-bar-item={SEARCH_ITEM}
      data-testid={`search-trigger-${variant}`}
      // The guide system points at this control by name. Only the full search
      // field registers it: one location id names one render site.
      {...uiLocation('shell.search', ref)}
      {...drag}
      className={`h-7 flex items-center gap-2 pl-2.5 pr-1.5 rounded-lg border border-border bg-bg text-muted hover:text-text transition-colors min-w-0 ${
        variant === 'top' ? 'w-[240px] max-w-full' : 'w-full mb-1.5'
      } ${editCls}`}
    >
      {/* In the sidebar the grip sits in the gutter, outside the field, so the
          field keeps the same width as the rest of the sidebar while editing. */}
      {editing && !owned && <GripVertical size={12} aria-hidden="true" className={`absolute top-1/2 -translate-y-1/2 text-muted opacity-0 group-hover/edit:opacity-100 ${variant === 'sidebar' ? '-left-2.5' : 'left-0.5'}`} />}
      <Search size={14} className="shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0 truncate text-left text-[13px]">{placeholder}</span>
      <kbd className="shrink-0 px-1.5 py-px rounded border border-border bg-bg-elevated text-[10px] font-medium text-muted font-sans">{chord}</kbd>
    </button>
  )
}
