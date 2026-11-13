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
import { ArrowLeftRight, Bell, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleUserRound, EyeOff, Fullscreen, GripVertical, PanelBottom, PanelTop, RectangleHorizontal, Square, Lightbulb, Lock, MessageSquare, Minus, MonitorSmartphone, PanelLeft, Search, Smartphone, SquareTerminal, X } from 'lucide-react'

import CrewAvatar from '../../components/CrewAvatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { OverlayPortal } from '../../components/overlayRoot'
import { Btn } from '../../components/ui'
import { membersRosterQuery } from '../../api/membersQuery'
import { isAppNavId } from '../../appNotificationBadges'
import { i18nT } from '../../i18n/t'
import { useAppSelector } from '../../store'
import {
  MATE_PIN_PREFIX, SESSION_PIN_PREFIX, insertPin, isEntityPin, matePinId, removePin, sessionPinId,
  updateRail, type RailGroup,
} from '../../lib/railLayout'
import {
  FEEDBACK_ITEM, FOCUS_ITEM, HISTORY_ITEM, PHONE_ITEM, PROFILE_ITEM, REMOTE_ITEM, SEARCH_ITEM, removeFromBars, STATUS_ITEM, TERMINAL_ITEM, isTwoPlaceItem, announceLayout, isWindowToggle, moveItem, resetShellLayout, setLayoutEditing,
  moveWithinBar, setSearchStyle, useLayoutAnnouncement, useSearchStyle, useShellPlacement, zoneOf, type BarZone, type ShellZone,
} from '../../lib/shellLayout'
import { barOrder, cellOf, clearBarCells, setItemStyle, shiftOnBar, useBarCells, useItemStyle } from '../../lib/barGrid'
import { canShiftInSidebar, clearSidebarRows, columnIdsOf, columnOrder, shiftInSidebar, useSidebarRows } from '../../lib/sidebarGrid'
import { useTerminalEnabled } from '../../utils/terminalRegistry'
import { useRailWidth } from '../../hooks/useRailWidth'
import { useIsMobile } from '../../hooks/useIsMobile'
import { forPhone, phoneBarIds, phoneHide, phoneShow, phoneStep, resetPhoneLayout, usePhoneLayout } from '../../lib/phoneLayout'
import type { RailItemMeta } from '../nav/railCustomize'
import { startItemDrag, zoneLabel } from './barItems'
import { noteRemoved, useDisclosure } from '../../lib/editOption'
import { HiddenItemPicker } from './hiddenItemPicker'
import { STATUS_BAR_EDIT_HEIGHT } from '../statusbar/shellStatusBar'


/** Items that never move, listed so their place reads as deliberate. */
const LOCKED: { key: string; icon: JSX.Element; zone: 'sidebar' | 'top' }[] = [
  { key: 'nav.layout_locked_brand', icon: <PanelLeft size={16} />, zone: 'sidebar' },
]

/** Built-in surfaces that read as apps (the App Store rows and Task Runner). */
const APP_STORE_IDS = new Set(['apps', 'apps-library', 'projects'])

type Category = 'all' | 'pages' | 'apps' | 'mates' | 'sessions' | 'tools'
const CATEGORIES: Category[] = ['all', 'pages', 'apps', 'mates', 'sessions', 'tools']
const SESSION_BROWSE_LIMIT = 20


/** `detail`: a short tag that tells apart two items with the same name (two
 *  sessions both titled "Kiro Crew Feature Request", say). Shown only then. */
interface Candidate { id: string; category: Exclude<Category, 'all'>; meta: RailItemMeta; detail?: string }

function categoryOf(id: string): Exclude<Category, 'all'> {
  if (id.startsWith(MATE_PIN_PREFIX)) return 'mates'
  if (id.startsWith(SESSION_PIN_PREFIX)) return 'sessions'
  if (isWindowToggle(id) || isTwoPlaceItem(id)) return 'tools'
  // Task Runner, Discover and Library ship in the Apps group, so they read as apps.
  return isAppNavId(id) || APP_STORE_IDS.has(id) ? 'apps' : 'pages'
}
/** The panel's two columns: what comes with every Crew, and what this person
 *  added (their mates, sessions and the apps they installed), the split most
 *  products draw between "Built-in" and what you installed. */
type Column = 'builtin' | 'yours'
const COLUMNS: Column[] = ['builtin', 'yours']
const COLUMN_KEY: Record<Column, string> = { builtin: 'nav.layout_col_builtin', yours: 'nav.layout_col_yours' }
function columnOf(x: Candidate): Column {
  if (x.category === 'mates' || x.category === 'sessions') return 'yours'
  if (x.category === 'apps' && !APP_STORE_IDS.has(x.id)) return 'yours'
  return 'builtin'
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
function placesFor(_id: string, phone = false): (ShellZone | 'none')[] {
  // Every movable item can go anywhere, or nowhere. Only the logo and sidebar
  // toggle are fixed, and they are listed under "Always here" instead.
  // The phone has no top or bottom bar: there it is the sidebar or nothing.
  return phone ? ['sidebar', 'none'] : ['sidebar', 'top', 'bottom', 'none']
}
/** Panel sections, in the order the canvas reads: top bar, sidebar, bottom
 *  bar, then everything not shown. Locked items follow under "Always here". */
const SECTIONS: (ShellZone | 'none')[] = ['top', 'sidebar', 'bottom', 'none']
const PHONE_SECTIONS: (ShellZone | 'none')[] = ['sidebar', 'none']
/** Icon for a place: the sidebar, top bar, bottom bar, or not shown. */
function PlaceIcon({ place }: { place: ShellZone | 'none' }) {
  const Icon = place === 'top' ? PanelTop : place === 'bottom' ? PanelBottom : place === 'sidebar' ? PanelLeft : EyeOff
  return <Icon size={13} aria-hidden="true" />
}
const placeLabel = (p: ShellZone | 'none') => (p === 'none' ? i18nT('nav.layout_zone_none') : zoneLabel(p))

export function LayoutEditPanel({ groups, hidden, meta }: {
  groups: readonly RailGroup[]
  hidden: readonly string[]
  meta: (id: string) => RailItemMeta | null
  isApp: (id: string) => boolean
  setAppPinned?: (id: string, pinned: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('all')
  const placement = useShellPlacement()
  // Re-render when a bar item moves cells, so its row and arrows follow.
  useBarCells('top')
  useBarCells('bottom')
  useSidebarRows()
  const railWidth = useRailWidth()
  // Phone layout: Edit layout edits the phone's one sidebar column, for this
  // phone only (lib/phoneLayout.ts). Its shell has no top or bottom bar, so
  // bar items join the column, and its header, search and account controls
  // are fixed, so only pages, apps, mates, sessions and feedback are listed,
  // each with Sidebar or Not shown. The panel is a full-screen sheet.
  const phone = useIsMobile()
  const phoneLayout = usePhoneLayout()
  const searchStyle = useSearchStyle()
  const styleOf = useItemStyle()
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
  // Gradual reveal (prototype band, option 2): what is not shown sits behind
  // an "Add an item" picker, and row controls show on hover or focus.
  const gradual = useDisclosure() === 'gradual' && !phone
  // Hidden: edit by dragging alone, with a small bar to bring the panel back.
  // Each Edit layout starts with the panel shown.
  const [panelHidden, setPanelHidden] = useState(false)
  const hiddenBarRef = useRef<HTMLDivElement>(null)
  // Focus the panel on open, and whichever of panel or bar is showing after a
  // switch, so keyboard users always land in the editor.
  useEffect(() => { (panelHidden ? hiddenBarRef.current : panelRef.current)?.focus() }, [panelHidden])

  const onSidebar = useMemo(() => new Set(groups.flatMap(g => g.items)), [groups])

  /** The phone's column in parts (top-bar items, each sidebar group, then
   *  bottom-bar and phone-only items), each in the phone's order. Move up and
   *  Move down stay within a part, as they stay within a group on the desktop. */
  const phoneParts = useMemo(() => (phone ? [
    forPhone(phoneBarIds(placement.top), phoneLayout),
    ...groups.map(g => forPhone(g.items, phoneLayout)),
    forPhone([...phoneBarIds(placement.bottom), ...phoneLayout.extra], phoneLayout),
  ] : []), [phone, placement.top, placement.bottom, groups, phoneLayout])
  const phoneColumn = useMemo(() => phoneParts.flat(), [phoneParts])

  const candidates = useMemo((): Candidate[] => {
    const out: Candidate[] = []
    const seen = new Set<string>()
    const add = (id: string, m: RailItemMeta | null, detail?: string) => {
      if (!m || seen.has(id)) return
      seen.add(id)
      out.push({ id, category: categoryOf(id), meta: m, detail })
    }
    if (!phone) {
      add(SEARCH_ITEM, { label: i18nT('nav.layout_locked_search'), icon: <Search size={16} /> })
      add(REMOTE_ITEM, { label: i18nT('components.instanceTabBar.instances'), icon: <MonitorSmartphone size={16} /> })
      add(HISTORY_ITEM, { label: i18nT('nav.layout_locked_back_forward'), icon: <ArrowLeftRight size={16} /> })
      add(PROFILE_ITEM, { label: i18nT('nav.profile_menu_name'), icon: <CircleUserRound size={16} /> })
      add(STATUS_ITEM, { label: i18nT('nav.layout_status_item'), icon: <Bell size={16} /> })
      if (terminalEnabled) add(TERMINAL_ITEM, { label: i18nT('app.terminal'), icon: <SquareTerminal size={16} /> })
      add(PHONE_ITEM, { label: i18nT('app.connect_your_phone'), icon: <Smartphone size={16} /> })
      add(FEEDBACK_ITEM, { label: i18nT('nav.send_feedback'), icon: <Lightbulb size={16} /> })
      add(FOCUS_ITEM, { label: i18nT('app.focus_mode'), icon: <Fullscreen size={16} /> })
    } else {
      add(FEEDBACK_ITEM, { label: i18nT('nav.send_feedback'), icon: <Lightbulb size={16} /> })
    }
    for (const id of [...groups.flatMap(g => g.items), ...hidden, ...placement.top, ...placement.bottom, ...(phone ? phoneLayout.extra : [])]) {
      if (!isEntityPin(id) && !isWindowToggle(id)) add(id, meta(id))
    }
    for (const m of roster ?? []) add(matePinId(m.slug), { label: m.name, icon: <CrewAvatar seed={m.name} avatar={m.avatar} size={18} /> })
    for (const s of slots) add(sessionPinId(s.key), { label: s.title || s.key, icon: <MessageSquare size={16} /> }, s.key.slice(-6))
    return out
  }, [groups, hidden, meta, placement.top, placement.bottom, roster, slots, terminalEnabled, phone, phoneLayout.extra])

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

  // Names that appear more than once get their detail tag on the second line.
  const repeated = useMemo(() => {
    const n = new Map<string, number>()
    for (const x of candidates) n.set(x.meta.label, (n.get(x.meta.label) ?? 0) + 1)
    return new Set([...n].filter(([, c]) => c > 1).map(([l]) => l))
  }, [candidates])

  const orderOf = (id: string, section: ShellZone | 'none'): number => {
    if (phone) return section === 'sidebar' ? phoneColumn.indexOf(id) : 0
    // The bars list their items left to right, as their grid draws them.
    if (section === 'top' || section === 'bottom') return barOrder(section).indexOf(id)
    // The sidebar's own order: its rows top to bottom as the column draws
    // them, then its tool rows.
    if (section === 'sidebar') return placement.side.includes(id) ? 10_000 + placement.side.indexOf(id) : columnOrder(columnIdsOf(groups)).indexOf(id)
    return 0
  }
  /** The bar a row sits in, when it is in one (desktop). */
  const barOf = (id: string): BarZone | null => {
    if (phone) return null
    const z = where(id)
    return z === 'top' || z === 'bottom' ? z : null
  }
  /** Can this row move one step? In a bar, one cell left or right; in the
   *  sidebar, one row up or down. Either way a neighbour is pushed aside. */
  const canStep = (id: string, delta: -1 | 1): boolean => {
    if (phone) {
      const part = phoneParts.find(p => p.includes(id))
      const i = part ? part.indexOf(id) : -1
      return !!part && i + delta >= 0 && i + delta < part.length
    }
    const bar = barOf(id)
    if (bar) {
      const at = cellOf(bar, id)
      return !!at && at.col + delta >= 0 && at.col + delta <= at.max
    }
    for (const list of [placement.top, placement.bottom, placement.side]) {
      const i = list.indexOf(id)
      if (i >= 0) return i + delta >= 0 && i + delta < list.length
    }
    // A sidebar row moves one row in the column, gaps included.
    return canShiftInSidebar(groups, id, delta)
  }
  const step = (id: string, delta: -1 | 1, label: string) => {
    if (phone) {
      const part = phoneParts.find(p => p.includes(id))
      if (part && phoneStep(part, id, delta)) announceLayout(i18nT(delta < 0 ? 'nav.layout_moved_up' : 'nav.layout_moved_down', { item: label }))
      return
    }
    const bar = barOf(id)
    if (bar) {
      if (shiftOnBar(bar, id, delta)) announceLayout(i18nT(delta < 0 ? 'nav.layout_moved_left' : 'nav.layout_moved_right', { item: label }))
      return
    }
    // Tool rows move within their own list; every other sidebar row moves
    // one row in the column, gaps included.
    const moved = moveWithinBar(id, delta) || shiftInSidebar(groups, id, delta)
    if (moved) announceLayout(i18nT(delta < 0 ? 'nav.layout_moved_up' : 'nav.layout_moved_down', { item: label }))
  }

  const where = (id: string): ShellZone | 'none' => {
    // On the phone every placed item is in its one column, unless hidden there.
    if (phone) return phoneColumn.includes(id) ? 'sidebar' : 'none'
    return zoneOf(id, placement, onSidebar.has(id)) ?? 'none'
  }

  const place = (id: string, to: ShellZone | 'none', label: string) => {
    if (to === where(id)) return
    // The phone changes the phone only; the desktop layout stays as it is.
    if (phone) {
      if (to === 'none') phoneHide(id)
      else phoneShow(id, zoneOf(id, placement, onSidebar.has(id)) !== null)
      announceLayout(to === 'none'
        ? i18nT('nav.layout_removed', { item: label })
        : i18nT('nav.layout_moved', { item: label, place: zoneLabel('sidebar') }))
      return
    }
    // One path for every item. An installed app's Library pin follows through
    // the sidebar-membership event that moveItem raises (RailGroups listens).
    if (isEntityPin(id) && to === 'sidebar') {
      removeFromBars(id)
      updateRail(l => insertPin(l, id, groups[0]?.id ?? '', null))
    } else if (isEntityPin(id) && to === 'none') {
      removeFromBars(id)
      updateRail(l => removePin(l, id))
    } else {
      moveItem(id, to === 'none' ? null : to)
    }
    if (to === 'none') noteRemoved(id)
    announceLayout(to === 'none'
      ? i18nT('nav.layout_removed', { item: label })
      : i18nT('nav.layout_moved', { item: label, place: zoneLabel(to) }))
  }

  /** The place sections (top bar, sidebar, bottom bar, not shown) for one
   *  list of items; `key` keeps their heading ids unique per column. */
  const sectionsFor = (list: Candidate[], key: string) => (
    <>
        {(phone ? PHONE_SECTIONS : SECTIONS).map(section => {
          const rows = list.filter(x => where(x.id) === section).sort((a, b) => orderOf(a.id, section) - orderOf(b.id, section))
          if (rows.length === 0) return null
          const headingId = `layout-section-${key}-${section}`
          const Heading = phone ? 'h3' : 'h4'
          // Gradual: what is not shown is one "Add an item" button opening a
          // searchable list, instead of a long section. A search in the
          // panel itself still lists every match in place.
          if (gradual && !q && section === 'none') return (
            <li key={section} className="mt-2">
              <HiddenItemPicker
                items={rows.map(x => ({ id: x.id, label: x.meta.label, icon: x.meta.icon, kind: categoryLabel(x.category), detail: x.detail && repeated.has(x.meta.label) ? x.detail : undefined }))}
                onAdd={(id, label) => place(id, 'sidebar', label)}
              />
            </li>
          )
          return (
          <li key={section} className="mt-1 first:mt-0">
            <Heading id={headingId} className="m-0 mt-2 mb-1 mx-2 text-[11px] font-medium uppercase tracking-wide text-muted">
              {placeLabel(section)} <span className="opacity-70 normal-case">{rows.length}</span>
            </Heading>
            <ul aria-labelledby={headingId} className="m-0 p-0 list-none">
        {rows.map(x => {
          const at = where(x.id)
          const inBar = at === 'top' || at === 'bottom'
          return (
            <li
              key={x.id}
              draggable
              onDragStart={e => startItemDrag(e, x.id)}
              className="group/row relative flex flex-col gap-1 pl-3 pr-1.5 py-1.5 rounded-lg hover:bg-bg-hover cursor-grab active:cursor-grabbing"
            >
              <div className="relative flex items-center gap-2">
              {/* The grip overlays the row's left padding on hover instead of
                  taking a column of its own, so the name gets that room.
                  Centred on the row's first line. */}
              <GripVertical size={12} className="absolute -left-2.5 top-1/2 -translate-y-1/2 text-muted opacity-0 group-hover/row:opacity-100" aria-hidden="true" />
              <span className="w-5 h-5 flex items-center justify-center shrink-0 text-muted">{x.meta.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-[13px] text-text" title={x.meta.label}>{x.meta.label}</span>
                <span className="block text-[11px] text-muted">
                  {categoryLabel(x.category)}{x.detail && repeated.has(x.meta.label) ? ` · ${x.detail}` : ''}
                </span>
              </span>
              {/* Gradual: the row's controls show on hover or keyboard focus,
                  so at rest a row is its icon and name. They stay in the tab
                  order, only faded out. */}
              <span className={`shrink-0 flex items-center gap-2 ${gradual ? 'opacity-0 transition-opacity duration-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 motion-reduce:transition-none' : ''}`}>
              {/* A placed item in a bar: icon and label (as dropped) or the icon
                  only, the user's choice, never a rule the bar applies. Same
                  two-icon toggle as search's. */}
              {inBar && !isTwoPlaceItem(x.id) && (
                <span role="group" aria-label={i18nT('nav.layout_show_as')} className="shrink-0 flex items-center p-0.5 rounded-md border border-border">
                  {(['label', 'icon'] as const).map(style => {
                    const name = i18nT(style === 'icon' ? 'nav.layout_search_icon' : 'nav.layout_style_label')
                    const on = styleOf(x.id) === style
                    return (
                      <button
                        key={style}
                        type="button"
                        aria-pressed={on}
                        aria-label={name}
                        title={name}
                        onClick={() => {
                          if (on) return
                          setItemStyle(x.id, style)
                          announceLayout(i18nT(style === 'icon' ? 'nav.layout_now_icon' : 'nav.layout_now_label', { item: x.meta.label }))
                        }}
                        className={`w-6 h-5 flex items-center justify-center rounded border-none cursor-pointer ${on ? 'bg-bg-hover text-text' : 'bg-transparent text-muted hover:text-text'}`}
                      >
                        {style === 'icon' ? <Square size={11} /> : <RectangleHorizontal size={13} />}
                      </button>
                    )
                  })}
                </span>
              )}
              {/* Search only: field or icon, as a two-icon toggle on the row
                  itself (no second line). Each half names itself for screen
                  readers and on hover; the pressed one is the current style. */}
              {x.id === SEARCH_ITEM && (
                <span role="group" aria-label={i18nT('nav.layout_show_as')} className="shrink-0 flex items-center p-0.5 rounded-md border border-border">
                  {(['field', 'icon'] as const).map(style => (
                    <button
                      key={style}
                      type="button"
                      aria-pressed={searchStyle === style}
                      aria-label={i18nT(style === 'icon' ? 'nav.layout_search_icon' : 'nav.layout_search_field')}
                      title={i18nT(style === 'icon' ? 'nav.layout_search_icon' : 'nav.layout_search_field')}
                      onClick={() => {
                        if (searchStyle === style) return
                        setSearchStyle(style)
                        announceLayout(i18nT(style === 'icon' ? 'nav.layout_search_now_icon' : 'nav.layout_search_now_field'))
                      }}
                      className={`w-6 h-5 flex items-center justify-center rounded border-none cursor-pointer ${searchStyle === style ? 'bg-bg-hover text-text' : 'bg-transparent text-muted hover:text-text'}`}
                    >
                      {style === 'icon' ? <Search size={12} /> : <RectangleHorizontal size={13} />}
                    </button>
                  ))}
                </span>
              )}
              {/* Move up / Move down in the sidebar, Move left / Move right in a
                  bar (one cell): reorder without dragging (WCAG 2.5.7). Not on
                  hidden items, which have no place. Nothing has a fixed spot:
                  widgets are ordinary rows in the sidebar too. */}
              {at !== 'none' && (
                <span className="shrink-0 flex items-center">
                  {([-1, 1] as const).map(d => {
                    const key = inBar
                      ? (d < 0 ? 'nav.layout_move_left' : 'nav.layout_move_right')
                      : (d < 0 ? 'nav.layout_move_up' : 'nav.layout_move_down')
                    const Icon = inBar ? (d < 0 ? ChevronLeft : ChevronRight) : (d < 0 ? ChevronUp : ChevronDown)
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={!canStep(x.id, d)}
                        onClick={() => step(x.id, d, x.meta.label)}
                        aria-label={i18nT(key, { item: x.meta.label })}
                        title={i18nT(key, { item: x.meta.label })}
                        className="w-6 h-6 flex items-center justify-center rounded-md bg-transparent border-none text-muted hover:text-text hover:bg-bg-hover cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <Icon size={14} />
                      </button>
                    )
                  })}
                </span>
              )}
              {/* Where it goes: a compact menu button, not a dropdown showing the
                  current place, because the section heading already says that.
                  The menu ticks the current place. */}
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={i18nT('nav.layout_show_in', { item: x.meta.label })}
                    title={i18nT('nav.layout_show_in', { item: x.meta.label })}
                    className="shrink-0 h-6 pl-1 pr-0.5 flex items-center gap-0.5 rounded-md border border-border bg-bg text-muted hover:text-text hover:bg-bg-hover cursor-pointer data-[state=open]:bg-bg-hover data-[state=open]:text-text"
                  >
                    {/* The current place as an icon, so the button shows what is
                        selected without repeating the section's name in words. */}
                    <PlaceIcon place={at} />
                    <ChevronDown size={11} aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[140px]">
                  <DropdownMenuRadioGroup value={at} onValueChange={v => place(x.id, v as ShellZone | 'none', x.meta.label)}>
                    {placesFor(x.id, phone).map(p => (
                      <DropdownMenuRadioItem key={p} value={p}>
                        <span className="inline-flex items-center gap-2"><PlaceIcon place={p} />{placeLabel(p)}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              </span>
              </div>
            </li>
          )
        })}
            </ul>
          </li>
          )
        })}
    </>
  )
  const lockedRows = (
    <>
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
    </>
  )
  const reset = () => {
    // On the phone, Reset clears the phone's own changes only.
    if (phone) resetPhoneLayout(); else { resetShellLayout(); clearBarCells(); clearSidebarRows() }
    announceLayout(i18nT('nav.layout_reset_done'))
  }

  // The pane's own overlay root, so the panel hides with this Crew when a
  // remote Crew is in front.
  const live = <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
  if (panelHidden && !phone) return (
    <OverlayPortal>
      {live}
      <div className="pointer-events-none fixed right-0 z-[60] flex justify-center px-4" style={{ left: railWidth, bottom: STATUS_BAR_EDIT_HEIGHT + 16 }}>
        <div
          ref={hiddenBarRef}
          tabIndex={-1}
          role="region"
          aria-label={i18nT('nav.rail_customize_title')}
          className="pointer-events-auto flex max-w-full items-center gap-3 rounded-xl border border-border bg-bg-elevated py-2 pl-4 pr-2 text-text shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
          data-testid="layout-panel-hidden-bar"
        >
          <span className="min-w-0 truncate text-[13px] text-muted" title={i18nT('nav.layout_panel_hidden')}>{i18nT('nav.layout_panel_hidden')}</span>
          <Btn onClick={() => setPanelHidden(false)}>{i18nT('nav.layout_show_panel')}</Btn>
          <Btn onClick={reset}>{i18nT('nav.rail_reset')}</Btn>
          <Btn primary onClick={() => setLayoutEditing(false)}>{i18nT('nav.rail_done')}</Btn>
        </div>
      </div>
    </OverlayPortal>
  )
  return (
    <OverlayPortal>
    {live}
    {/* Floats in the middle of the page area (right of the sidebar), over the
        dimmed page, so it reads as a tool laid over the layout rather than as
        one more part of it. The frame lets clicks through to the bars; only the
        panel itself takes them. */}
    {/* Sizing for every window (WCAG 1.4.10 Reflow, 1.4.4 Resize text): the
        margin around the panel shrinks with the window (64px at most, 12px at
        least), the panel is at most 360px wide and 560px tall and otherwise
        fills what is left, and only its list scrolls, so the header, search and
        Done always stay on screen, at 200% zoom too. */}
    <div
      className={`fixed inset-y-0 right-0 z-[60] flex items-center justify-center pointer-events-none ${phone ? 'p-safe' : 'px-[clamp(12px,5vw,64px)] py-[clamp(12px,6vh,64px)]'}`}
      style={{ left: phone ? 0 : railWidth }}
    >
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-label={i18nT('nav.rail_customize_title')}
      className={`pointer-events-auto min-h-0 flex flex-col bg-bg-elevated text-text outline-none overflow-hidden ${phone ? 'w-full h-full' : '@container w-[640px] max-w-full h-[min(560px,100%)] rounded-2xl border border-border shadow-2xl'}`}
      data-testid="layout-edit-panel"
    >
      <header className="flex items-start gap-2 px-4 pt-3 pb-2 border-b border-border">
        <div className="flex-1 min-w-0">
          <h2 className="m-0 text-[15px] font-semibold text-text">{i18nT('nav.rail_customize_title')}</h2>
          {/* One line: a longer translation shortens with "…" and the full
              hint stays in the tooltip. On the phone the line says instead
              that changes here stay on this phone. */}
          {phone
            ? <p className="mt-1 mb-0 text-[12px] text-muted flex items-start gap-1.5" data-testid="layout-phone-only">
                <Smartphone size={13} aria-hidden="true" className="shrink-0 mt-px" />
                <span>{i18nT('nav.layout_phone_only')}</span>
              </p>
            : <p className="mt-1 mb-0 text-[12px] text-muted truncate" title={i18nT('nav.layout_hint')}>{i18nT('nav.layout_hint')}</p>}
        </div>
        {/* Hide the panel and edit by dragging alone; a small bar brings it back. */}
        {!phone && (
          <button
            type="button"
            onClick={() => setPanelHidden(true)}
            aria-label={i18nT('nav.layout_hide_panel')}
            title={i18nT('nav.layout_hide_panel')}
            className="w-7 h-7 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer text-muted hover:text-text hover:bg-bg-hover"
          >
            <Minus size={15} />
          </button>
        )}
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

      {/* One row: the category filter as a compact dropdown, then search. The
          chips it replaces wrapped onto a second line and cost height. */}
      <div className="px-4 pt-3 flex items-center gap-2">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${i18nT('nav.layout_categories')}: ${categoryLabel(category)}`}
              className="shrink-0 h-[34px] flex items-center gap-1 pl-2.5 pr-1.5 rounded-lg border border-border bg-bg text-[13px] text-text hover:bg-bg-hover cursor-pointer data-[state=open]:bg-bg-hover"
            >
              {categoryLabel(category)}
              <ChevronDown size={13} aria-hidden="true" className="text-muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            <DropdownMenuRadioGroup value={category} onValueChange={v => setCategory(v as Category)}>
              {CATEGORIES.filter(c => c === 'all' || counts[c] > 0).map(c => (
                <DropdownMenuRadioItem key={c} value={c}>
                  <span className="flex-1">{categoryLabel(c)}</span>
                  <span className="ml-3 text-muted">{counts[c]}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <label className="flex-1 min-w-0 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-bg focus-within:border-accent">
          <Search size={14} className="text-muted shrink-0" aria-hidden="true" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={i18nT('nav.rail_palette_search')}
            aria-label={i18nT('nav.rail_palette_search')}
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] text-text placeholder:text-muted"
          />
        </label>
      </div>

      <ul className="m-0 mt-2 px-2 pb-2 list-none flex-1 min-h-0 overflow-y-auto">
        {shown.length === 0 && (
          <li className="px-2 py-8 text-center text-[13px] text-muted">{i18nT('nav.rail_palette_no_results', { query: query.trim() })}</li>
        )}
        {/* Grouped by where each item lives now, so the panel is a map of the
            layout: moving an item moves its row to another section instead of
            leaving what looks like a copy behind. Each section is a labelled
            list, so screen readers hear the place before its items. */}
        {phone
          ? <>{sectionsFor(shown, 'all')}{lockedRows}</>
          : (
            // Two columns side by side, one when the panel is narrow (a small
            // window or a large zoom). Each keeps the place sections inside it.
            <li className="grid grid-cols-1 @[560px]:grid-cols-2 gap-x-4 gap-y-3">
              {COLUMNS.map(col => {
                const list = shown.filter(x => columnOf(x) === col)
                const colId = `layout-col-${col}`
                return (
                  <section key={col} aria-labelledby={colId} className="min-w-0">
                    <h3 id={colId} className="m-0 mx-2 mt-1 text-[13px] font-semibold text-text">
                      {i18nT(COLUMN_KEY[col])} <span className="font-normal text-muted">{list.length}</span>
                    </h3>
                    {list.length === 0
                      ? <p className="mx-2 my-2 text-[12px] text-muted">{i18nT(col === 'yours' ? 'nav.layout_col_yours_empty' : 'nav.layout_col_builtin_empty')}</p>
                      : <ul className="m-0 p-0 list-none">{sectionsFor(list, col)}</ul>}
                    {col === 'builtin' && <ul className="m-0 p-0 list-none">{lockedRows}</ul>}
                  </section>
                )
              })}
            </li>
          )}
      </ul>

      <footer className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border">
        <Btn onClick={reset}>{i18nT('nav.rail_reset')}</Btn>
        <Btn primary onClick={() => setLayoutEditing(false)}>{i18nT('nav.rail_done')}</Btn>
      </footer>
    </aside>
    </div>
    </OverlayPortal>
  )
}
