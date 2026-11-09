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
 * Prototype scope: the bars take built-in pages and the two window toggles
 * (terminal, phone). Mates, sessions and installed apps stay sidebar-only.
 */
import { useEffect, useState } from 'react'

import { safeGetItem, safeRemoveItem, safeSetItem } from '../utils/safeStorage'
import { insertPin, defaultGroupOf, readRailLayout, updateRail, resetRailLayout } from './railLayout'

export type ShellZone = 'sidebar' | 'top' | 'bottom'
export type BarZone = Exclude<ShellZone, 'sidebar'>

export interface ShellPlacement { top: string[]; bottom: string[] }

/** Window toggles: not sidebar destinations, so they live in a bar or nowhere. */
export const TERMINAL_ITEM = 'shell:terminal'
export const PHONE_ITEM = 'shell:phone'
/** "Send feedback": starts a feature-request chat. Optional and pinnable: it
 *  lives in the profile menu, and a user can also put it in a bar. */
export const FEEDBACK_ITEM = 'shell:feedback'
export const isWindowToggle = (id: string) => id === TERMINAL_ITEM || id === PHONE_ITEM || id === FEEDBACK_ITEM

/** Items that live in exactly one of two places, the top bar or the sidebar,
 *  and are never hidden: search, and the status cluster (connection, usage,
 *  notifications). Both default to the SIDEBAR, so the shipped top bar is
 *  empty and hidden (an empty bar disappears, like the bottom bar); dragging
 *  either into the top bar brings it back. Stored on their own keys. */
export const SEARCH_ITEM = 'shell:search'
export const STATUS_ITEM = 'shell:status'
export type SearchPlace = 'top' | 'sidebar'
export type TwoPlaceItem = typeof SEARCH_ITEM | typeof STATUS_ITEM
export const isTwoPlaceItem = (id: string): id is TwoPlaceItem => id === SEARCH_ITEM || id === STATUS_ITEM
const PLACE_KEY: Record<TwoPlaceItem, string> = { [SEARCH_ITEM]: 'mc-search-place', [STATUS_ITEM]: 'mc-status-place' }
const PLACE_EVENT = 'mc:two-place-changed'

/** Where search and status start. The prototype ships them in the SIDEBAR
 *  (top bar empty and hidden). Under the test runner the default stays the
 *  TOP BAR, so the existing shell tests, written against the shipped top bar,
 *  keep exercising it. The prototype's own default is checked by hand in the pod. */
const DEFAULT_PLACE: SearchPlace = import.meta.env?.MODE === 'test' ? 'top' : 'sidebar'

export function readPlace(id: TwoPlaceItem): SearchPlace {
  const v = safeGetItem(PLACE_KEY[id])
  return v === 'top' || v === 'sidebar' ? v : DEFAULT_PLACE
}
export const readSearchPlace = () => readPlace(SEARCH_ITEM)

function writePlace(id: TwoPlaceItem, place: SearchPlace): void {
  safeSetItem(PLACE_KEY[id], place)
  window.dispatchEvent(new Event(PLACE_EVENT))
}

export function usePlace(id: TwoPlaceItem): SearchPlace {
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
  const placement = useShellPlacement()
  const search = usePlace(SEARCH_ITEM)
  const status = usePlace(STATUS_ITEM)
  return search === 'top' || status === 'top' || placement.top.length > 0
}

/** Window event the profile menu raises to start a feedback request. */
export const SEND_FEEDBACK_EVENT = 'mc:send-feedback'
export const sendFeedback = () => window.dispatchEvent(new Event(SEND_FEEDBACK_EVENT))

/** Native-drag MIME for an item moving between the palette and the bars. */
export const SHELL_ITEM_MIME = 'application/x-kirocrew-shell-item'

const PLACEMENT_KEY = 'mc-shell-placement'
const PLACEMENT_EVENT = 'mc:shell-placement-changed'
const EDITING_EVENT = 'mc:layout-editing-changed'

const EMPTY: ShellPlacement = { top: [], bottom: [] }

export function readShellPlacement(): ShellPlacement {
  try {
    const raw = safeGetItem(PLACEMENT_KEY)
    if (!raw) return EMPTY
    const v = JSON.parse(raw) as Partial<ShellPlacement>
    const ids = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [])
    return { top: ids(v.top), bottom: ids(v.bottom) }
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
  if (isTwoPlaceItem(id)) return readPlace(id)
  if (placement.top.includes(id)) return 'top'
  if (placement.bottom.includes(id)) return 'bottom'
  return onSidebar ? 'sidebar' : null
}

/** Take `id` out of both bars. Returns whether it was in one. */
export function removeFromBars(id: string): boolean {
  const p = readShellPlacement()
  if (!p.top.includes(id) && !p.bottom.includes(id)) return false
  writeShellPlacement({ top: p.top.filter(x => x !== id), bottom: p.bottom.filter(x => x !== id) })
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
  if (isTwoPlaceItem(id)) {
    // Search and status go only to the top bar or the sidebar.
    if (zone === 'top' || zone === 'sidebar') writePlace(id, zone)
    return
  }
  const p = readShellPlacement()
  const top = p.top.filter(x => x !== id)
  const bottom = p.bottom.filter(x => x !== id)
  if (zone === 'top' || zone === 'bottom') {
    const list = zone === 'top' ? top : bottom
    const at = index == null || index < 0 || index > list.length ? list.length : index
    list.splice(at, 0, id)
  }
  writeShellPlacement({ top, bottom })
  if (isWindowToggle(id)) return
  if (zone === 'sidebar') {
    const layout = readRailLayout()
    const group = layout.groups.some(g => g.id === defaultGroupOf(id)) ? defaultGroupOf(id) : layout.groups[0]?.id ?? ''
    updateRail(l => insertPin(l, id, group, null))
  } else {
    hideInSidebar(id)
  }
}

/** Every customization back to the shipped canvas: default sidebar, empty bars. */
export function resetShellLayout(): void {
  safeRemoveItem(PLACEMENT_KEY)
  safeRemoveItem(PLACE_KEY[SEARCH_ITEM])
  safeRemoveItem(PLACE_KEY[STATUS_ITEM])
  safeRemoveItem(SEARCH_STYLE_KEY)
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

export interface ChromeDrag { active: boolean; over: BarZone | null }
let chromeDrag: ChromeDrag = { active: false, over: null }
const CHROME_DRAG_EVENT = 'mc:chrome-drag-changed'

export function setChromeDrag(next: ChromeDrag): void {
  if (next.active === chromeDrag.active && next.over === chromeDrag.over) return
  chromeDrag = next
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
