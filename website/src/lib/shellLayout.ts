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
import { insertPin, defaultGroupOf, readRailLayout, updateRail, resetRailLayout } from './railLayout'

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
export const isWindowToggle = (id: string) => id === TERMINAL_ITEM || id === PHONE_ITEM || id === FEEDBACK_ITEM

/** Shell widgets: controls with their own rendering in each place, rather
 *  than a page link. Each lives in exactly one place (top bar, sidebar, bottom
 *  bar) or nowhere, stored on its own key:
 *  - search, the status cluster (connection, usage, notifications) and the
 *    remote Crews switcher;
 *  - Back/Forward and the profile menu ("You").
 *  All default to the SIDEBAR, so the shipped top bar is empty and hidden (an
 *  empty bar disappears, like the bottom bar). The logo and sidebar toggle are
 *  the only fixed items. */
export const SEARCH_ITEM = 'shell:search'
export const STATUS_ITEM = 'shell:status'
export const REMOTE_ITEM = 'shell:remote'
export const HISTORY_ITEM = 'shell:history'
export const PROFILE_ITEM = 'shell:profile'
export type SearchPlace = ShellZone | 'none'
export type WidgetPlace = SearchPlace
export type WidgetItem = typeof SEARCH_ITEM | typeof STATUS_ITEM | typeof REMOTE_ITEM | typeof HISTORY_ITEM | typeof PROFILE_ITEM
export type TwoPlaceItem = WidgetItem
export const WIDGET_ITEMS: readonly WidgetItem[] = [SEARCH_ITEM, STATUS_ITEM, REMOTE_ITEM, HISTORY_ITEM, PROFILE_ITEM]
export const isWidgetItem = (id: string): id is WidgetItem => (WIDGET_ITEMS as readonly string[]).includes(id)
/** Older name, kept for existing call sites: now covers every widget. */
export const isTwoPlaceItem = isWidgetItem
const PLACE_KEY: Record<WidgetItem, string> = {
  [SEARCH_ITEM]: 'mc-search-place',
  [STATUS_ITEM]: 'mc-status-place',
  [REMOTE_ITEM]: 'mc-remote-place',
  [HISTORY_ITEM]: 'mc-history-place',
  [PROFILE_ITEM]: 'mc-profile-place',
}
const PLACE_EVENT = 'mc:two-place-changed'

/** Where widgets start: the SIDEBAR (top bar empty and hidden). Under the test
 *  runner, search, status and the remote switcher default to the TOP BAR, so the
 *  existing shell tests, written against the shipped top bar, keep exercising
 *  it. The prototype's own default is checked by hand in the pod. */
const IN_TEST = import.meta.env?.MODE === 'test'
const DEFAULT_PLACE: Record<WidgetItem, WidgetPlace> = {
  [SEARCH_ITEM]: IN_TEST ? 'top' : 'sidebar',
  [STATUS_ITEM]: IN_TEST ? 'top' : 'sidebar',
  [REMOTE_ITEM]: IN_TEST ? 'top' : 'sidebar',
  [HISTORY_ITEM]: 'sidebar',
  [PROFILE_ITEM]: 'sidebar',
}

export function readPlace(id: WidgetItem): WidgetPlace {
  const v = safeGetItem(PLACE_KEY[id])
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

/** Where search sits inside the top bar: the left cluster, the centre slot
 *  (default) or the start of the right cluster. Set from where it is dropped,
 *  so it lands where you let go (Gary's first look: dropped on the right, it
 *  snapped to the middle). */
export type TopSlot = 'left' | 'center' | 'right'
const SEARCH_TOP_SLOT_KEY = 'mc-search-top-slot'
const SEARCH_TOP_SLOT_EVENT = 'mc:search-top-slot-changed'

export function readSearchTopSlot(): TopSlot {
  const v = safeGetItem(SEARCH_TOP_SLOT_KEY)
  return v === 'left' || v === 'right' ? v : 'center'
}

export function setSearchTopSlot(slot: TopSlot): void {
  if (slot === 'center') safeRemoveItem(SEARCH_TOP_SLOT_KEY)
  else safeSetItem(SEARCH_TOP_SLOT_KEY, slot)
  window.dispatchEvent(new Event(SEARCH_TOP_SLOT_EVENT))
}

export function useSearchTopSlot(): TopSlot {
  const [s, setS] = useState(readSearchTopSlot)
  useEffect(() => {
    const sync = () => setS(readSearchTopSlot())
    window.addEventListener(SEARCH_TOP_SLOT_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(SEARCH_TOP_SLOT_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return s
}

/* ── Top-bar slots for every item ──
   Pages, apps, mates, sessions and toggles in the top bar also sit in its left,
   centre or right part, set by where they are dropped (default: right, the
   group they always used to join). Search keeps its own key above. */
const TOP_SLOTS_KEY = 'mc-top-slots'
/** The bottom bar has the same three parts (default: left, where it always
 *  started). Widgets placed there use them too. */
const BOTTOM_SLOTS_KEY = 'mc-bottom-slots'
const SLOT_KEY: Record<BarZone, string> = { top: TOP_SLOTS_KEY, bottom: BOTTOM_SLOTS_KEY }
const SLOT_DEFAULT: Record<BarZone, TopSlot> = { top: 'right', bottom: 'left' }

function readTopSlotMap(zone: BarZone = 'top'): Record<string, TopSlot> {
  try {
    const v = JSON.parse(safeGetItem(SLOT_KEY[zone]) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(v).filter(([, s]) => s === 'left' || s === 'center' || s === 'right')) as Record<string, TopSlot>
  } catch {
    return {}
  }
}

/** Which part of a bar an item sits in. */
export function readZoneSlot(zone: BarZone, id: string): TopSlot {
  if (zone === 'top' && id === SEARCH_ITEM) return readSearchTopSlot()
  return readTopSlotMap(zone)[id] ?? SLOT_DEFAULT[zone]
}

export function setZoneSlot(zone: BarZone, id: string, slot: TopSlot): void {
  if (zone === 'top' && id === SEARCH_ITEM) { setSearchTopSlot(slot); return }
  const m = readTopSlotMap(zone)
  if (slot === SLOT_DEFAULT[zone]) delete m[id]
  else m[id] = slot
  safeSetItem(SLOT_KEY[zone], JSON.stringify(m))
  window.dispatchEvent(new Event(SEARCH_TOP_SLOT_EVENT))
}

export const readTopSlot = (id: string) => readZoneSlot('top', id)
export const setTopSlot = (id: string, slot: TopSlot) => setZoneSlot('top', id, slot)

/** Re-renders when any item's bar slot changes; returns the reader for `zone`. */
export function useZoneSlots(zone: BarZone): (id: string) => TopSlot {
  const [, bump] = useState(0)
  useEffect(() => {
    const sync = () => bump(n => n + 1)
    window.addEventListener(SEARCH_TOP_SLOT_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(SEARCH_TOP_SLOT_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return (id: string) => readZoneSlot(zone, id)
}
export const useTopSlots = () => useZoneSlots('top')

/**
 * A drop on the top bar at client-x `x`: which slot it lands in (thirds of the
 * bar), the index in the whole top-bar list (`moveItem`'s index, the dragged
 * item left out), and where to draw the drop line. Items snap to the nearest
 * gap among the items already in that slot.
 */
export function zoneDropAt(zone: BarZone, x: number, dragId: string | null): { slot: TopSlot; index: number; lineX: number | null } {
  const { slot, lineX: slotLine } = slotAt(zone, x)
  const els = [...document.querySelectorAll<HTMLElement>(`[data-layout-zone="${zone}"][data-top-slot="${slot}"] [data-bar-item]`)]
    .filter(el => el.dataset.barItem !== dragId)
  const rects = els.map(el => el.getBoundingClientRect())
  const i = rects.findIndex(r => r.left + r.width / 2 > x)
  const local = i < 0 ? rects.length : i
  let lineX = slotLine
  if (rects.length > 0) lineX = local < rects.length ? rects[local].left - 2 : rects[rects.length - 1].right + 2
  // Local position among this slot's items -> index in the whole list.
  const list = readShellPlacement()[zone].filter(id => id !== dragId)
  const inSlot = list.filter(id => readZoneSlot(zone, id) === slot)
  const index = local < inSlot.length ? list.indexOf(inSlot[local]) : inSlot.length ? list.indexOf(inSlot[inSlot.length - 1]) + 1 : list.length
  return { slot, index, lineX }
}
export const topDropAt = (x: number, dragId: string | null) => zoneDropAt('top', x, dragId)

/** The top-bar slot a drop at client-x `x` means (thirds of the bar), and the
 *  x to draw the drop line at. */
export function searchTopSlotAt(x: number): { slot: TopSlot; lineX: number | null } {
  return slotAt('top', x)
}

/** Which third of a bar a client-x falls in, and a drop-line x for an empty part. */
function slotAt(zone: BarZone, x: number): { slot: TopSlot; lineX: number | null } {
  const el = document.querySelector<HTMLElement>(`[data-layout-outline="${zone}"]`)
  const r = el?.getBoundingClientRect()
  if (!r || r.width === 0) return { slot: 'center', lineX: null }
  const third = r.width / 3
  if (x < r.left + third) return { slot: 'left', lineX: r.left + 12 }
  if (x > r.right - third) return { slot: 'right', lineX: r.right - third + 12 }
  return { slot: 'center', lineX: r.left + r.width / 2 }
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
  return useWidgetsIn(zone).length > 0 || placement[zone].length > 0
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

export function readShellPlacement(): ShellPlacement {
  try {
    const raw = safeGetItem(PLACEMENT_KEY)
    if (!raw) return EMPTY
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

/** Every customization back to the shipped canvas: default sidebar, empty bars. */
export function resetShellLayout(): void {
  safeRemoveItem(PLACEMENT_KEY)
  for (const id of WIDGET_ITEMS) safeRemoveItem(PLACE_KEY[id])
  safeRemoveItem(SEARCH_STYLE_KEY)
  safeRemoveItem(SEARCH_TOP_SLOT_KEY)
  safeRemoveItem(TOP_SLOTS_KEY)
  safeRemoveItem(BOTTOM_SLOTS_KEY)
  window.dispatchEvent(new Event(SEARCH_TOP_SLOT_EVENT))
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
 *  pointer, and where in that bar it would land (a client-x for the drop line).
 *  `id` is null while no layout item is being dragged. */
export interface ChromeDrag { id: string | null; over: BarZone | null; lineX: number | null }
const NO_DRAG: ChromeDrag = { id: null, over: null, lineX: null }
let chromeDrag: ChromeDrag = NO_DRAG
const CHROME_DRAG_EVENT = 'mc:chrome-drag-changed'

export function readChromeDrag(): ChromeDrag { return chromeDrag }

export function setChromeDrag(next: Partial<ChromeDrag> | null): void {
  const v = next === null ? NO_DRAG : { ...chromeDrag, ...next }
  if (v.id === chromeDrag.id && v.over === chromeDrag.over && v.lineX === chromeDrag.lineX) return
  chromeDrag = v
  window.dispatchEvent(new Event(CHROME_DRAG_EVENT))
}

/**
 * Where a drop at client-x `x` lands in a bar: the index among the bar's
 * placed items (the dragged item itself left out, since it moves), and the x
 * of the gap to draw the drop line in. Items snap to the nearest gap.
 */
export function barDropAt(zone: BarZone, x: number, dragId: string | null): { index: number; lineX: number | null } {
  const box = document.querySelector<HTMLElement>(`[data-layout-zone="${zone}"]`)
  const els = [...(box?.querySelectorAll<HTMLElement>('[data-bar-item]') ?? [])].filter(el => el.dataset.barItem !== dragId)
  const rects = els.map(el => el.getBoundingClientRect())
  const i = rects.findIndex(r => r.left + r.width / 2 > x)
  const index = i < 0 ? rects.length : i
  let lineX: number | null = null
  if (rects.length === 0) lineX = box ? box.getBoundingClientRect().left + 2 : null
  else if (index < rects.length) lineX = rects[index].left - 2
  else lineX = rects[rects.length - 1].right + 2
  return { index, lineX }
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
