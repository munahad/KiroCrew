/**
 * "Edit layout" in place (design exploration).
 *
 * The real canvas becomes editable: the page dims, the top bar, the sidebar
 * and the bottom bar are raised above it as drop zones, and this panel floats
 * in the middle of the page area (feedback: docked on the right between the
 * bars, it read as part of the layout being edited). Every change still shows
 * live, at real size, in the raised chrome. It lists
 * everything that can go on the canvas (pages, apps, mates, sessions, the
 * terminal and phone toggles). Each item can be dragged onto a bar, or placed
 * with its "Show in" menu, which is the keyboard and screen-reader path for
 * every move (WCAG 2.5.7 Dragging Movements, 2.1.1 Keyboard). Moves are
 * announced through a live region (4.1.3). Escape or Done leaves edit mode.
 *
 * Rendered by RailGroups, which owns the sidebar data the list needs, and
 * portaled to the body so it floats over the page area only.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Bell, CircleUserRound, GripVertical, Lightbulb, Lock, MessageSquare, PanelLeft, Search, Smartphone, SquareTerminal, X } from 'lucide-react'

import CrewAvatar from '../../components/CrewAvatar'
import SimpleSelect from '../../components/SimpleSelect'
import { OverlayPortal } from '../../components/overlayRoot'
import { Btn } from '../../components/ui'
import { membersRosterQuery } from '../../api/membersQuery'
import { isAppNavId } from '../../appNotificationBadges'
import { i18nT } from '../../i18n/t'
import { useAppSelector } from '../../store'
import {
  MATE_PIN_PREFIX, SESSION_PIN_PREFIX, insertPin, isEntityPin, matePinId, removePin, sessionPinId, updateRail,
  type RailGroup,
} from '../../lib/railLayout'
import {
  FEEDBACK_ITEM, PHONE_ITEM, SEARCH_ITEM, STATUS_ITEM, TERMINAL_ITEM, isTwoPlaceItem, announceLayout, isWindowToggle, moveItem, resetShellLayout, setLayoutEditing,
  setSearchStyle, useLayoutAnnouncement, useSearchStyle, useShellPlacement, zoneOf, type SearchStyle, type ShellZone,
} from '../../lib/shellLayout'
import { useTerminalEnabled } from '../../utils/terminalRegistry'
import { useRailWidth } from '../../hooks/useRailWidth'
import type { RailItemMeta } from '../nav/railCustomize'
import { canSitInBar } from './shellItems'
import { startItemDrag, zoneLabel } from './barItems'


/** Items that never move, listed so their place reads as deliberate. */
const LOCKED: { key: string; icon: JSX.Element; zone: 'sidebar' | 'top' }[] = [
  { key: 'nav.layout_locked_brand', icon: <PanelLeft size={16} />, zone: 'sidebar' },
  { key: 'nav.layout_locked_back_forward', icon: <ArrowLeftRight size={16} />, zone: 'sidebar' },
  { key: 'nav.profile_menu_name', icon: <CircleUserRound size={16} />, zone: 'sidebar' },
]

/** Built-in surfaces that read as apps (the App Store rows and Task Runner). */
const APP_STORE_IDS = new Set(['apps', 'apps-library', 'projects'])

type Category = 'all' | 'pages' | 'apps' | 'mates' | 'sessions' | 'tools'
const CATEGORIES: Category[] = ['all', 'pages', 'apps', 'mates', 'sessions', 'tools']
const SESSION_BROWSE_LIMIT = 20

interface Candidate { id: string; category: Exclude<Category, 'all'>; meta: RailItemMeta }

function categoryOf(id: string): Exclude<Category, 'all'> {
  if (id.startsWith(MATE_PIN_PREFIX)) return 'mates'
  if (id.startsWith(SESSION_PIN_PREFIX)) return 'sessions'
  if (isWindowToggle(id) || isTwoPlaceItem(id)) return 'tools'
  // Task Runner, Discover and Library ship in the Apps group, so they read as apps.
  return isAppNavId(id) || APP_STORE_IDS.has(id) ? 'apps' : 'pages'
}
/** Literal keys, so the catalog checks can see each one is used. */
const CATEGORY_KEY: Record<Category, string> = {
  all: 'nav.layout_cat_all',
  pages: 'nav.layout_cat_pages',
  apps: 'nav.layout_cat_apps',
  mates: 'nav.layout_cat_mates',
  sessions: 'nav.layout_cat_sessions',
  tools: 'nav.layout_cat_tools',
}
const categoryLabel = (c: Category) => i18nT(CATEGORY_KEY[c])

/** The places an item may go, in the order the menu lists them. */
function placesFor(id: string): (ShellZone | 'none')[] {
  if (isTwoPlaceItem(id)) return ['top', 'sidebar']
  if (isWindowToggle(id)) return ['top', 'bottom', 'none']
  if (canSitInBar(id)) return ['sidebar', 'top', 'bottom', 'none']
  return ['sidebar', 'none']
}
const placeLabel = (p: ShellZone | 'none') => (p === 'none' ? i18nT('nav.layout_zone_none') : zoneLabel(p))

export function LayoutEditPanel({ groups, hidden, meta, isApp, setAppPinned }: {
  groups: readonly RailGroup[]
  hidden: readonly string[]
  meta: (id: string) => RailItemMeta | null
  isApp: (id: string) => boolean
  setAppPinned?: (id: string, pinned: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('all')
  const placement = useShellPlacement()
  const railWidth = useRailWidth()
  const searchStyle = useSearchStyle()
  const announcement = useLayoutAnnouncement()
  const terminalEnabled = useTerminalEnabled()
  const slots = useAppSelector(s => s.dashboard.slots)
  const roster = useQuery({ ...membersRosterQuery }).data
  const panelRef = useRef<HTMLElement>(null)

  // Escape leaves edit mode, from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLayoutEditing(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // Focus the panel on open so keyboard users land in the editor.
  useEffect(() => { panelRef.current?.focus() }, [])

  const onSidebar = useMemo(() => new Set(groups.flatMap(g => g.items)), [groups])

  const candidates = useMemo((): Candidate[] => {
    const out: Candidate[] = []
    const seen = new Set<string>()
    const add = (id: string, m: RailItemMeta | null) => {
      if (!m || seen.has(id)) return
      seen.add(id)
      out.push({ id, category: categoryOf(id), meta: m })
    }
    add(SEARCH_ITEM, { label: i18nT('nav.layout_locked_search'), icon: <Search size={16} /> })
    add(STATUS_ITEM, { label: i18nT('nav.layout_status_item'), icon: <Bell size={16} /> })
    if (terminalEnabled) add(TERMINAL_ITEM, { label: i18nT('app.terminal'), icon: <SquareTerminal size={16} /> })
    add(PHONE_ITEM, { label: i18nT('app.connect_your_phone'), icon: <Smartphone size={16} /> })
    add(FEEDBACK_ITEM, { label: i18nT('nav.send_feedback'), icon: <Lightbulb size={16} /> })
    for (const id of [...groups.flatMap(g => g.items), ...hidden, ...placement.top, ...placement.bottom]) {
      if (!isEntityPin(id) && !isWindowToggle(id)) add(id, meta(id))
    }
    for (const m of roster ?? []) add(matePinId(m.slug), { label: m.name, icon: <CrewAvatar seed={m.name} avatar={m.avatar} size={18} /> })
    for (const s of slots) add(sessionPinId(s.key), { label: s.title || s.key, icon: <MessageSquare size={16} /> })
    return out
  }, [groups, hidden, meta, placement.top, placement.bottom, roster, slots, terminalEnabled])

  const q = query.trim().toLowerCase()
  const matches = (x: Candidate) => !q || x.meta.label.toLowerCase().includes(q)
  const counts = useMemo(() => {
    const c: Record<Category, number> = { all: 0, pages: 0, apps: 0, mates: 0, sessions: 0, tools: 0 }
    for (const x of candidates) if (matches(x)) { c[x.category]++; c.all++ }
    return c
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, q])
  const shown = useMemo(() => {
    let list = candidates.filter(x => (category === 'all' || x.category === category) && matches(x))
    if (!q) { let n = 0; list = list.filter(x => x.category !== 'sessions' || n++ < SESSION_BROWSE_LIMIT) }
    return list
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, category, q])

  const where = (id: string): ShellZone | 'none' => zoneOf(id, placement, onSidebar.has(id)) ?? 'none'

  const place = (id: string, to: ShellZone | 'none', label: string) => {
    if (to === where(id)) return
    if (isApp(id)) {
      // Installed apps: the Library owns their pin state; sidebar-only here.
      setAppPinned?.(id, to === 'sidebar')
    } else if (isEntityPin(id)) {
      if (to === 'sidebar') updateRail(l => insertPin(l, id, groups[0]?.id ?? '', null))
      else updateRail(l => removePin(l, id))
    } else {
      moveItem(id, to === 'none' ? null : to)
    }
    announceLayout(to === 'none'
      ? i18nT('nav.layout_removed', { item: label })
      : i18nT('nav.layout_moved', { item: label, place: zoneLabel(to) }))
  }

  // The pane's own overlay root, so the panel hides with this Crew when a
  // remote Crew is in front.
  return (
    <OverlayPortal>
    {/* Floats in the middle of the page area (right of the sidebar), over the
        dimmed page, so it reads as a tool laid over the layout rather than as
        one more part of it. The frame lets clicks through to the bars; only the
        panel itself takes them. */}
    <div
      className="fixed inset-y-0 right-0 z-[60] flex items-center justify-center p-16 pointer-events-none"
      style={{ left: railWidth }}
    >
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-label={i18nT('nav.rail_customize_title')}
      className="pointer-events-auto w-[360px] max-w-full h-[min(560px,100%)] flex flex-col rounded-2xl border border-border bg-bg-elevated text-text shadow-2xl outline-none"
      data-testid="layout-edit-panel"
    >
      <header className="flex items-start gap-2 px-4 pt-3 pb-2 border-b border-border">
        <div className="flex-1 min-w-0">
          <h2 className="m-0 text-[15px] font-semibold text-text">{i18nT('nav.rail_customize_title')}</h2>
          <p className="mt-1 mb-0 text-[12px] text-muted">{i18nT('nav.layout_hint')}</p>
        </div>
        <button
          type="button"
          onClick={() => setLayoutEditing(false)}
          aria-label={i18nT('nav.rail_done')}
          title={i18nT('nav.rail_done')}
          className="w-7 h-7 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer text-muted hover:text-text hover:bg-bg-hover"
        >
          <X size={15} />
        </button>
      </header>

      <div className="px-4 pt-3 flex flex-col gap-2">
        <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-bg focus-within:border-accent">
          <Search size={14} className="text-muted shrink-0" aria-hidden="true" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={i18nT('nav.rail_palette_search')}
            aria-label={i18nT('nav.rail_palette_search')}
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] text-text placeholder:text-muted"
          />
        </label>
        <div role="tablist" aria-label={i18nT('nav.layout_categories')} className="flex flex-wrap gap-1">
          {CATEGORIES.filter(c => c === 'all' || counts[c] > 0).map(c => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              onClick={() => setCategory(c)}
              className={`px-2 py-0.5 rounded-full text-[11px] border cursor-pointer ${category === c ? 'bg-accent text-accent-fg border-accent' : 'bg-transparent text-muted border-border hover:text-text'}`}
            >
              {categoryLabel(c)} <span className="opacity-70">{counts[c]}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="m-0 mt-2 px-2 pb-2 list-none flex-1 min-h-0 overflow-y-auto">
        {shown.length === 0 && (
          <li className="px-2 py-8 text-center text-[13px] text-muted">{i18nT('nav.rail_palette_no_results', { query: query.trim() })}</li>
        )}
        {shown.map(x => {
          const at = where(x.id)
          return (
            <li
              key={x.id}
              draggable
              onDragStart={e => startItemDrag(e, x.id)}
              className="group/row flex flex-col gap-1 px-2 py-1.5 rounded-lg hover:bg-bg-hover cursor-grab active:cursor-grabbing"
            >
              <div className="flex items-center gap-2">
              <GripVertical size={13} className="text-muted opacity-0 group-hover/row:opacity-100 shrink-0" aria-hidden="true" />
              <span className="w-5 h-5 flex items-center justify-center shrink-0 text-muted">{x.meta.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-[13px] text-text" title={x.meta.label}>{x.meta.label}</span>
                <span className="block text-[11px] text-muted">{categoryLabel(x.category)}</span>
              </span>
              {/* The app's own dropdown (themed), kept out of the row's drag. */}
              <SimpleSelect
                options={placesFor(x.id)}
                optionLabels={placesFor(x.id).map(placeLabel)}
                value={at}
                onChange={v => place(x.id, v as ShellZone | 'none', x.meta.label)}
                aria-label={i18nT('nav.layout_show_in', { item: x.meta.label })}
                className={`!w-auto shrink-0 max-w-[120px] h-6 px-1.5 py-0 text-[11px] ${at === 'none' ? 'text-muted' : 'border-accent/50 text-text'}`}
                contentClassName="min-w-[120px]"
              />
              </div>
              {/* Search only: draw it as the full field or the icon alone. */}
              {x.id === SEARCH_ITEM && (
                <div className="flex items-center gap-2 pl-[49px] pb-0.5">
                  <label htmlFor="layout-search-style" className="flex-1 text-[11px] text-muted">{i18nT('nav.layout_show_as')}</label>
                  <SimpleSelect
                    id="layout-search-style"
                    options={['field', 'icon']}
                    optionLabels={[i18nT('nav.layout_search_field'), i18nT('nav.layout_search_icon')]}
                    value={searchStyle}
                    onChange={v => {
                      const style = v as SearchStyle
                      setSearchStyle(style)
                      announceLayout(i18nT(style === 'icon' ? 'nav.layout_search_now_icon' : 'nav.layout_search_now_field'))
                    }}
                    className="!w-auto shrink-0 max-w-[120px] h-6 px-1.5 py-0 text-[11px] text-text"
                    contentClassName="min-w-[120px]"
                  />
                </div>
              )}
            </li>
          )
        })}
        {/* Always-here items, after everything you can move: their place and a
            lock, never a menu. */}
        {category === 'all' && LOCKED.some(l => !q || i18nT(l.key).toLowerCase().includes(q)) && (
          <li aria-hidden="true" className="mt-2 mb-1 mx-2 pt-2 border-t border-border text-[11px] font-medium uppercase tracking-wide text-muted">
            {i18nT('nav.layout_always_here')}
          </li>
        )}
        {category === 'all' && LOCKED.filter(l => !q || i18nT(l.key).toLowerCase().includes(q)).map(l => (
          <li key={l.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
            <span className="w-[13px] shrink-0" aria-hidden="true" />
            <span className="w-5 h-5 flex items-center justify-center shrink-0 text-muted">{l.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="block truncate text-[13px] text-text">{i18nT(l.key)}</span>
            </span>
            <span
              className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-border text-[11px] text-muted"
              title={i18nT('nav.layout_locked_title')}
            >
              <Lock size={11} aria-hidden="true" />
              {zoneLabel(l.zone)}
              <span className="sr-only">{i18nT('nav.layout_locked_title')}</span>
            </span>
          </li>
        ))}
      </ul>

      <footer className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border">
        <Btn onClick={() => { resetShellLayout(); announceLayout(i18nT('nav.layout_reset_done')) }}>{i18nT('nav.rail_reset')}</Btn>
        <Btn primary onClick={() => setLayoutEditing(false)}>{i18nT('nav.rail_done')}</Btn>
      </footer>

      {/* Moves, read out to screen readers. */}
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
    </aside>
    </div>
    </OverlayPortal>
  )
}
