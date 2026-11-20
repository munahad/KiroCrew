/**
 * Whole-canvas layout (design exploration): which items the user moved into
 * the TOP BAR and BOTTOM BAR, plus the in-place "Edit layout" mode.
 *
 * The sidebar keeps its own model (`railLayout.ts`); this file adds the two
 * other chrome areas so one item can live in exactly one of the three places.
 * Moving an item into a bar hides it in the sidebar (the rail's `hidden` set,
 * so a shipped default does not reappear); moving it back pins it again.
 *
 * The bottom bar ships EMPTY, and an empty bottom bar is not drawn: dropping
 * something into it is how a user turns it on (the shell review's decision).
 * While editing, the bar is drawn anyway as a drop target.
 *
 * Every item can go anywhere (top bar, sidebar, bottom bar) or nowhere,
 * except the logo and sidebar toggle, which stay at the head of the sidebar.
 */
import { useEffect, useState } from 'react'

import { safeGetItem, safeRemoveItem, safeSetItem } from '../utils/safeStorage'
import { insertPin, defaultGroupOf, readRailLayout, updateRail, resetRailLayout, useRailLayout } from './railLayout'

export type ShellZone = 'sidebar' | 'top' | 'bottom'
export type BarZone = Exclude<ShellZone, 'sidebar'>

/** `side`: window toggles (terminal, phone, feedback) placed in the sidebar.
 *  They are actions, not pages, so they sit in their own row at the foot of
 *  the sidebar instead of in its groups. */
export interface ShellPlacement { top: string[]; bottom: string[]; side: string[] }

/** Window toggles: not sidebar destinations, so they live in a bar or nowhere. */
export const TERMINAL_ITEM = 'shell:terminal'
export const PHONE_ITEM = 'shell:phone'
/** "Send feedback": starts a feature-request chat. Optional and pinnable: it
 *  lives in the profile menu, and a user can also put it in a bar. */
export const FEEDBACK_ITEM = 'shell:feedback'
/** Focus mode: hides the chrome. A toggle like the terminal, so it can sit in
 *  either bar, the sidebar's tool rows, or nowhere (its key chord still works). */
export const FOCUS_ITEM = 'shell:focus'
export const isWindowToggle = (id: string) => id === TERMINAL_ITEM || id === PHONE_ITEM || id === FEEDBACK_ITEM || id === FOCUS_ITEM

/** Shell widgets: controls with their own rendering in each place, rather
 *  than a page link. Each lives in exactly one place (top bar, sidebar, bottom
 *  bar) or nowhere, stored on its own key:
 *  - search, the status cluster (connection, usage, notifications) and the
 *    remote Crews switcher;
 *  - Back/Forward and the profile menu ("You").
 *  All but "You" default to the top bar, as production Crew draws them. */
export const SEARCH_ITEM = 'shell:search'
export const STATUS_ITEM = 'shell:status'
export const REMOTE_ITEM = 'shell:remote'
export const HISTORY_ITEM = 'shell:history'
export const PROFILE_ITEM = 'shell:profile'
/** Notifications (the bell): its own movable widget, split out of the status
 *  cluster, which keeps the connection light and the credits reading. */
export const NOTIFY_ITEM = 'shell:notifications'
/** The Crew's logo. Starts at the head of the sidebar; it can move to the top
 *  bar (never the bottom bar) or be removed (checkpoint 56). The sidebar's
 *  collapse button is separate and stays in the sidebar, so moving or removing
 *  the logo never removes the way to expand a collapsed sidebar. */
export const LOGO_ITEM = 'shell:logo'
export type SearchPlace = ShellZone | 'none'
export type WidgetPlace = SearchPlace
export type WidgetItem = typeof SEARCH_ITEM | typeof STATUS_ITEM | typeof NOTIFY_ITEM | typeof REMOTE_ITEM | typeof HISTORY_ITEM | typeof PROFILE_ITEM
export type TwoPlaceItem = WidgetItem
/** The movable widgets. The local/remote Crews switcher starts in the top bar
 *  (checkpoint 54) and moves like the others, but can't be removed (55). */
export const WIDGET_ITEMS: readonly WidgetItem[] = [SEARCH_ITEM, STATUS_ITEM, NOTIFY_ITEM, REMOTE_ITEM, HISTORY_ITEM, PROFILE_ITEM]
export const isWidgetItem = (id: string): id is WidgetItem => (WIDGET_ITEMS as readonly string[]).includes(id)
/** Made-up items for the "+" lists and Not shown (prototype only, checkpoint
 *  56): two apps that are not pinned, and one placeholder tool that opens
 *  nothing. They start Not shown. Task Runner is the real one. */
export const SAMPLE_EXTRA_APPS = ['demo-app:design-critique', 'demo-app:dev-fleet'] as const
export const FEATURE2_ITEM = 'demo-tool:feature-2'
export const SAMPLE_EXTRA_IDS: readonly string[] = [...SAMPLE_EXTRA_APPS, FEATURE2_ITEM]
export const isSampleExtra = (id: string) => SAMPLE_EXTRA_IDS.includes(id)
/** Items that are already in the You menu, so no list offers them (no
 *  duplicated features): Connect your phone and Send feedback. */
export const IN_YOU_MENU: readonly string[] = [PHONE_ITEM, FEEDBACK_ITEM]
/** Whether an editor may offer Remove (Not shown) for an item. "You" (it holds
 *  Settings and Edit layout) and the Crews switcher (checkpoint 55) can move
 *  between areas but are never removed. */
export const canRemove = (id: string) => id !== PROFILE_ITEM && id !== REMOTE_ITEM
/** The places an editor may offer for an item, in menu order. */
export function placesOf(id: string): (ShellZone | 'none')[] {
  if (id === LOGO_ITEM) return ['sidebar', 'top', 'none']
  return canRemove(id) ? ['sidebar', 'top', 'bottom', 'none'] : ['sidebar', 'top', 'bottom']
}
/** Older name, kept for existing call sites: now covers every widget. */
export const isTwoPlaceItem = isWidgetItem
const PLACE_KEY: Record<WidgetItem, string> = {
  [SEARCH_ITEM]: 'mc-search-place',
  [STATUS_ITEM]: 'mc-status-place',
  [NOTIFY_ITEM]: 'mc-notify-place',
  [REMOTE_ITEM]: 'mc-remote-place',
  [HISTORY_ITEM]: 'mc-history-place',
  [PROFILE_ITEM]: 'mc-profile-place',
}
const PLACE_EVENT = 'mc:two-place-changed'

/** Where widgets start (checkpoint 54): production Crew's top bar, with
 *  Back/Forward, the Crews switcher, search, status and the bell in it, and
 *  "You" at the sidebar's foot. */
const IN_TEST = import.meta.env?.MODE === 'test'
const DEFAULT_PLACE: Record<WidgetItem, WidgetPlace> = {
  [SEARCH_ITEM]: 'top',
  [STATUS_ITEM]: 'top',
  [NOTIFY_ITEM]: 'top',
  [REMOTE_ITEM]: 'top',
  [HISTORY_ITEM]: 'top',
  [PROFILE_ITEM]: 'sidebar',
}

/** Fixed sample badge counts, as in production screenshots (prototype only;
 *  real counts under the test runner). */
export const SAMPLE_BADGES: Readonly<Record<string, number>> | null = IN_TEST ? null : { members: 1, apps: 1, bell: 66 }

export function readPlace(id: WidgetItem): WidgetPlace {
  const v = safeGetItem(PLACE_KEY[id])
  // "You" and the Crews switcher are never Not shown: an older stored 'none'
  // reads as the default place.
  if (v === 'none' && !canRemove(id)) return DEFAULT_PLACE[id]
  return v === 'top' || v === 'sidebar' || v === 'bottom' || v === 'none' ? v : DEFAULT_PLACE[id]
}
export const readSearchPlace = () => readPlace(SEARCH_ITEM)

function writePlace(id: WidgetItem, place: WidgetPlace): void {
  safeSetItem(PLACE_KEY[id], place)
  window.dispatchEvent(new Event(PLACE_EVENT))
}

export function usePlace(id: WidgetItem): WidgetPlace {
  const [p, setP] = useState(() => readPlace(id))
  useEffect(() => {
    const sync = () => setP(readPlace(id))
    window.addEventListener(PLACE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(PLACE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [id])
  return p
}
export const useSearchPlace = () => usePlace(SEARCH_ITEM)
export const useStatusPlace = () => usePlace(STATUS_ITEM)
export const useRemotePlace = () => usePlace(REMOTE_ITEM)
export const useHistoryPlace = () => usePlace(HISTORY_ITEM)
export const useProfilePlace = () => usePlace(PROFILE_ITEM)
export const useNotifyPlace = () => usePlace(NOTIFY_ITEM)

/* ── The optional logo: the sidebar's head, the top bar, or not shown ── */
// One key: absent is the sidebar, '1' (as older builds stored it) not shown, 'top' the top bar.
const LOGO_KEY = 'mc-logo-hidden'
const LOGO_EVENT = 'mc:logo-changed'
export type LogoPlace = 'sidebar' | 'top' | 'none'
export function readLogoPlace(): LogoPlace {
  const v = safeGetItem(LOGO_KEY)
  return v === '1' ? 'none' : v === 'top' ? 'top' : 'sidebar'
}
export function setLogoPlace(place: LogoPlace): void {
  if (place === 'sidebar') safeRemoveItem(LOGO_KEY)
  else safeSetItem(LOGO_KEY, place === 'none' ? '1' : 'top')
  window.dispatchEvent(new Event(LOGO_EVENT))
}
/** Whether the logo is at the sidebar's head. */
export const readLogoShown = () => readLogoPlace() === 'sidebar'
export function setLogoShown(on: boolean): void { setLogoPlace(on ? 'sidebar' : 'none') }
export function useLogoPlace(): LogoPlace {
  const [p, setP] = useState(readLogoPlace)
  useEffect(() => {
    const sync = () => setP(readLogoPlace())
    window.addEventListener(LOGO_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(LOGO_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return p
}
export const useLogoShown = () => useLogoPlace() === 'sidebar'

/* ── Window lock (for option 2's panel) ──
   While an editor wants the window behind it blurred and unclickable, it
   turns this on; App.tsx then puts the `data-layout-locked` attribute on the
   shell root (data-testid="dashboard-shell"), for a `[data-layout-locked]`
   style rule.
   Shared only: no option turns it on yet, and no style is attached. */
const LOCK_EVENT = 'mc:layout-window-locked'
let windowLocked = false
export const isLayoutWindowLocked = () => windowLocked
export function setLayoutWindowLocked(on: boolean): void {
  if (windowLocked === on) return
  windowLocked = on
  window.dispatchEvent(new Event(LOCK_EVENT))
}
export function useLayoutWindowLocked(): boolean {
  const [on, setOn] = useState(windowLocked)
  useEffect(() => {
    const sync = () => setOn(windowLocked)
    window.addEventListener(LOCK_EVENT, sync)
    sync()
    return () => window.removeEventListener(LOCK_EVENT, sync)
  }, [])
  return on
}

/** How search is drawn: the full field (default) or only its magnifier icon.
 *  Set from the search row in Edit layout; applies wherever search lives. In
 *  the expanded sidebar the icon joins the header row, beside Back/Forward. */
export type SearchStyle = 'field' | 'icon'
const SEARCH_STYLE_KEY = 'mc-search-style'
const SEARCH_STYLE_EVENT = 'mc:search-style-changed'

export function readSearchStyle(): SearchStyle {
  return safeGetItem(SEARCH_STYLE_KEY) === 'icon' ? 'icon' : 'field'
}

export function setSearchStyle(style: SearchStyle): void {
  if (style === 'field') safeRemoveItem(SEARCH_STYLE_KEY)
  else safeSetItem(SEARCH_STYLE_KEY, style)
  window.dispatchEvent(new Event(SEARCH_STYLE_EVENT))
}

export function useSearchStyle(): SearchStyle {
  const [s, setS] = useState(readSearchStyle)
  useEffect(() => {
    const sync = () => setS(readSearchStyle())
    window.addEventListener(SEARCH_STYLE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(SEARCH_STYLE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return s
}

/** Whether the desktop top bar has anything in it. Empty, it is not drawn. */
export function useTopBarHasContent(): boolean {
  return useBarHasContent('top')
}

/** Whether a bar has anything in it: placed items or any widget. */
export function useBarHasContent(zone: BarZone): boolean {
  const placement = useShellPlacement()
  const logo = useLogoPlace()
  return useWidgetsIn(zone).length > 0 || placement[zone].length > 0 || logo === zone
}

/** Whether an area holds anything (checkpoint 56): an empty area is not drawn
 *  outside edit mode, in all three options. The sidebar's collapse button
 *  alone does not count; it goes with the sidebar. "You" can't be removed, so
 *  the area holding it always shows, and Edit layout stays reachable from its
 *  menu and that area's right-click. */
export function useAreaHasContent(zone: ShellZone): boolean {
  const placement = useShellPlacement()
  const logo = useLogoPlace()
  const widgets = useWidgetsIn(zone)
  const rail = useRailLayout()
  if (zone === 'sidebar') return logo === 'sidebar' || widgets.length > 0 || placement.side.length > 0 || rail.groups.some(g => g.items.length > 0)
  return widgets.length > 0 || placement[zone].length > 0 || logo === zone
}

/** Every widget's place, kept current. */
function useWidgetPlaces(): Record<WidgetItem, WidgetPlace> {
  const read = () => Object.fromEntries(WIDGET_ITEMS.map(id => [id, readPlace(id)])) as Record<WidgetItem, WidgetPlace>
  const [p, setP] = useState(read)
  useEffect(() => {
    const sync = () => setP(read())
    window.addEventListener(PLACE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(PLACE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return p
}

/** The widgets placed in a zone, in their fixed order. */
export function useWidgetsIn(zone: ShellZone): WidgetItem[] {
  const places = useWidgetPlaces()
  return WIDGET_ITEMS.filter(id => places[id] === zone)
}

/** Window event the profile menu raises to start a feedback request. */
export const SEND_FEEDBACK_EVENT = 'mc:send-feedback'
export const sendFeedback = () => window.dispatchEvent(new Event(SEND_FEEDBACK_EVENT))

/** Native-drag MIME for an item moving between the palette and the bars. */
export const SHELL_ITEM_MIME = 'application/x-kirocrew-shell-item'

const PLACEMENT_KEY = 'mc-shell-placement'
const PLACEMENT_EVENT = 'mc:shell-placement-changed'
const EDITING_EVENT = 'mc:layout-editing-changed'

const EMPTY: ShellPlacement = { top: [], bottom: [], side: [] }
/** Production Crew: focus mode (the capture icon) in the top bar, the
 *  terminal at the sidebar's foot, the bottom bar empty. */
const DEFAULT_PLACEMENT: ShellPlacement = { top: [FOCUS_ITEM], bottom: [], side: [TERMINAL_ITEM] }

export function readShellPlacement(): ShellPlacement {
  try {
    const raw = safeGetItem(PLACEMENT_KEY)
    if (!raw) return DEFAULT_PLACEMENT
    const v = JSON.parse(raw) as Partial<ShellPlacement>
    const ids = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [])
    return { top: ids(v.top), bottom: ids(v.bottom), side: ids(v.side) }
  } catch {
    return EMPTY
  }
}

function writeShellPlacement(p: ShellPlacement): void {
  safeSetItem(PLACEMENT_KEY, JSON.stringify(p))
  window.dispatchEvent(new Event(PLACEMENT_EVENT))
}

export function useShellPlacement(): ShellPlacement {
  const [p, setP] = useState(readShellPlacement)
  useEffect(() => {
    const sync = () => setP(readShellPlacement())
    window.addEventListener(PLACEMENT_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(PLACEMENT_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return p
}

/** Where an item lives now. `null`: nowhere (a hidden page, an unplaced toggle). */
export function zoneOf(id: string, placement: ShellPlacement, onSidebar: boolean): ShellZone | null {
  if (id === LOGO_ITEM) { const p = readLogoPlace(); return p === 'none' ? null : p }
  if (isWidgetItem(id)) { const p = readPlace(id); return p === 'none' ? null : p }
  if (placement.top.includes(id)) return 'top'
  if (placement.bottom.includes(id)) return 'bottom'
  if (placement.side.includes(id)) return 'sidebar'
  return onSidebar ? 'sidebar' : null
}

/**
 * Move an item one step earlier (-1) or later (+1) within the bar list it is
 * in (top bar, bottom bar, or the sidebar's tool rows). The keyboard path for
 * reordering (WCAG 2.5.7): the Edit layout panel's Move up and Move down.
 * Returns whether it moved. Sidebar group rows reorder in the panel itself,
 * against the visible groups.
 */
export function moveWithinBar(id: string, delta: -1 | 1): boolean {
  const p = readShellPlacement()
  for (const key of ['top', 'bottom', 'side'] as const) {
    const i = p[key].indexOf(id)
    if (i < 0) continue
    const j = i + delta
    if (j < 0 || j >= p[key].length) return false
    const next = [...p[key]]
    ;[next[i], next[j]] = [next[j], next[i]]
    writeShellPlacement({ ...p, [key]: next })
    return true
  }
  return false
}

/** Take `id` out of both bars. Returns whether it was in one. */
export function removeFromBars(id: string): boolean {
  const p = readShellPlacement()
  if (!p.top.includes(id) && !p.bottom.includes(id) && !p.side.includes(id)) return false
  writeShellPlacement({ top: p.top.filter(x => x !== id), bottom: p.bottom.filter(x => x !== id), side: p.side.filter(x => x !== id) })
  return true
}

/** Hide `id` in the sidebar: out of every group, and remembered as unpinned. */
function hideInSidebar(id: string): void {
  updateRail(l => ({
    ...l,
    groups: l.groups.map(g => ({ ...g, items: g.items.filter(x => x !== id) })),
    hidden: l.hidden.includes(id) ? l.hidden : [...l.hidden, id].sort(),
  }))
}

/**
 * Move one item to a zone (or `null`: off the canvas). `index` places it
 * within a bar; omitted, it goes at the end.
 */
export function moveItem(id: string, zone: ShellZone | null, index?: number): void {
  // Refuse what the item may not do: remove "You" or put the logo in a bar.
  if (!placesOf(id).includes(zone ?? 'none')) return
  if (id === LOGO_ITEM) { setLogoPlace(zone === 'sidebar' || zone === 'top' ? zone : 'none'); return }
  if (isWidgetItem(id)) {
    writePlace(id, zone ?? 'none')
    return
  }
  const p = readShellPlacement()
  const top = p.top.filter(x => x !== id)
  const bottom = p.bottom.filter(x => x !== id)
  const side = p.side.filter(x => x !== id)
  const toggleInSidebar = isWindowToggle(id) && zone === 'sidebar'
  if (zone === 'top' || zone === 'bottom' || toggleInSidebar) {
    const list = zone === 'top' ? top : zone === 'bottom' ? bottom : side
    const at = index == null || index < 0 || index > list.length ? list.length : index
    list.splice(at, 0, id)
  }
  writeShellPlacement({ top, bottom, side })
  if (isWindowToggle(id)) return
  setSidebarMembership(id, zone === 'sidebar')
  if (zone === 'sidebar') {
    const layout = readRailLayout()
    const group = layout.groups.some(g => g.id === defaultGroupOf(id)) ? defaultGroupOf(id) : layout.groups[0]?.id ?? ''
    updateRail(l => insertPin(l, id, group, null))
  } else {
    hideInSidebar(id)
  }
}

/* ── Sidebar membership ──
   Installed apps keep their "pinned to the sidebar" state in the Library, which
   this module cannot reach. Every move tells the sidebar (RailGroups, which owns
   the Library setter) whether the item is now in the sidebar, so an app moved
   into a bar leaves the sidebar, and one moved back returns. */
export const SIDEBAR_MEMBERSHIP_EVENT = 'mc:sidebar-membership'
export interface SidebarMembership { id: string; inSidebar: boolean }
export function setSidebarMembership(id: string, inSidebar: boolean): void {
  window.dispatchEvent(new CustomEvent<SidebarMembership>(SIDEBAR_MEMBERSHIP_EVENT, { detail: { id, inSidebar } }))
}

/* ── Default layout version ──
   Checkpoint 54 changed the shipped layout to production Crew's. A layout
   stored by an earlier build is dropped once, so a fresh load shows the new
   default. Bump DEFAULT_LAYOUT_VERSION when the default changes again. */
const DEFAULT_LAYOUT_VERSION = '54'
const DEFAULT_LAYOUT_VERSION_KEY = 'mc-layout-default-version'
// Keys owned by railLayout.ts, barGrid.ts and sidebarGrid.ts (named here, not
// imported, since those modules import this one).
const OTHER_LAYOUT_KEYS = ['mc-rail-layout', 'mc-bar-cells-top', 'mc-bar-cells-bottom', 'mc-bar-item-style', 'mc-bar-style', 'mc-sidebar-rows']
export function adoptDefaultLayout(): void {
  if (safeGetItem(DEFAULT_LAYOUT_VERSION_KEY) === DEFAULT_LAYOUT_VERSION) return
  for (const k of [PLACEMENT_KEY, ...Object.values(PLACE_KEY), SEARCH_STYLE_KEY, LOGO_KEY, ...OTHER_LAYOUT_KEYS]) safeRemoveItem(k)
  safeSetItem(DEFAULT_LAYOUT_VERSION_KEY, DEFAULT_LAYOUT_VERSION)
}
if (!IN_TEST && typeof window !== 'undefined') adoptDefaultLayout()

/** Every customization back to the shipped canvas: default sidebar, empty bars. */
export function resetShellLayout(): void {
  safeRemoveItem(PLACEMENT_KEY)
  for (const id of WIDGET_ITEMS) safeRemoveItem(PLACE_KEY[id])
  safeRemoveItem(SEARCH_STYLE_KEY)
  safeRemoveItem(LOGO_KEY)
  window.dispatchEvent(new Event(LOGO_EVENT))
  window.dispatchEvent(new Event(PLACE_EVENT))
  window.dispatchEvent(new Event(SEARCH_STYLE_EVENT))
  window.dispatchEvent(new Event(PLACEMENT_EVENT))
  resetRailLayout()
}

/* ── In-place edit mode ── */

let editing = false

export function isLayoutEditing(): boolean { return editing }

export function setLayoutEditing(on: boolean): void {
  if (editing === on) return
  editing = on
  window.dispatchEvent(new Event(EDITING_EVENT))
}

export function useLayoutEditing(): boolean {
  const [on, setOn] = useState(editing)
  useEffect(() => {
    const sync = () => setOn(editing)
    window.addEventListener(EDITING_EVENT, sync)
    sync()
    return () => window.removeEventListener(EDITING_EVENT, sync)
  }, [])
  return on
}

/* ── Sidebar drags (dnd-kit) reaching the bars ──
   The sidebar reorders with dnd-kit, a pointer-based drag, so the bars'
   native drop handlers never see it. The sidebar reports its drag here
   instead: whether one is in flight, and which bar the pointer is over. */

/** The item being dragged on the canvas (any drag system), the bar under the
 *  pointer, and where in that bar it would land: `cell`, the start cell in the
 *  bar's grid (lib/barGrid.ts), and `lineX`, kept for the sidebar's drop line.
 *  `id` is null while no layout item is being dragged. */
export interface ChromeDrag { id: string | null; over: BarZone | null; lineX: number | null; cell?: number | null }
const NO_DRAG: ChromeDrag = { id: null, over: null, lineX: null, cell: null }
let chromeDrag: ChromeDrag = NO_DRAG
const CHROME_DRAG_EVENT = 'mc:chrome-drag-changed'

export function readChromeDrag(): ChromeDrag { return chromeDrag }

export function setChromeDrag(next: Partial<ChromeDrag> | null): void {
  const v = next === null ? NO_DRAG : { ...chromeDrag, ...next }
  if (v.id === chromeDrag.id && v.over === chromeDrag.over && v.lineX === chromeDrag.lineX && v.cell === chromeDrag.cell) return
  chromeDrag = v
  window.dispatchEvent(new Event(CHROME_DRAG_EVENT))
}

export function useChromeDrag(): ChromeDrag {
  const [d, setD] = useState(chromeDrag)
  useEffect(() => {
    const sync = () => setD(chromeDrag)
    window.addEventListener(CHROME_DRAG_EVENT, sync)
    return () => window.removeEventListener(CHROME_DRAG_EVENT, sync)
  }, [])
  return d
}

/** Which bar outline (top or bottom) contains a screen point, if any. */
export function barZoneAt(x: number, y: number): BarZone | null {
  for (const zone of ['top', 'bottom'] as const) {
    const el = document.querySelector<HTMLElement>(`[data-layout-outline="${zone}"]`)
    const r = el?.getBoundingClientRect()
    if (r && r.width > 0 && r.height > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return zone
  }
  return null
}

/* ── Screen-reader announcements for moves (WCAG 4.1.3) ── */

const ANNOUNCE_EVENT = 'mc:layout-announce'

export function announceLayout(message: string): void {
  window.dispatchEvent(new CustomEvent(ANNOUNCE_EVENT, { detail: message }))
}

export function useLayoutAnnouncement(): string {
  const [msg, setMsg] = useState('')
  useEffect(() => {
    const on = (e: Event) => setMsg((e as CustomEvent<string>).detail)
    window.addEventListener(ANNOUNCE_EVENT, on)
    return () => window.removeEventListener(ANNOUNCE_EVENT, on)
  }, [])
  return msg
}
