/**
 * The bars' cell grid (design exploration).
 *
 * Each bar is a row of equal cells, about CELL px wide. Every item in a bar
 * (pages, apps, Mates, sessions, the window toggles and the widgets: search,
 * status, remote Crews, Back/Forward and "You") sits at a start cell and takes
 * as many cells as it is wide. It stays where it was dropped, gaps included.
 *
 * Dropping onto cells that are taken pushes the items there aside: those whose
 * middle is left of the drop move left, the rest move right, as far as they
 * must. When a window is too narrow for everything, items keep their order and
 * pack against the edges instead of overlapping.
 *
 * Start cells are stored per bar. An item with none (moved in from the panel's
 * menu) joins the right end of the top bar, or after the last item of the
 * bottom bar, where each bar always added items.
 */
import { useEffect, useState } from 'react'

import { safeGetItem, safeRemoveItem, safeSetItem } from '../utils/safeStorage'
import {
  HISTORY_ITEM, PROFILE_ITEM, REMOTE_ITEM, SEARCH_ITEM, STATUS_ITEM, WIDGET_ITEMS, moveItem, readPlace,
  readSearchStyle, readShellPlacement, setSearchStyle, type BarZone,
} from './shellLayout'

/** Target cell width, in px. The real width is the bar's width split evenly. */
export const CELL = 40

const KEY: Record<BarZone, string> = { top: 'mc-bar-cells-top', bottom: 'mc-bar-cells-bottom' }
const EVENT = 'mc:bar-cells-changed'

export function readCells(zone: BarZone): Record<string, number> {
  try {
    const v = JSON.parse(safeGetItem(KEY[zone]) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(v).filter(([, c]) => typeof c === 'number' && Number.isFinite(c) && c >= 0)) as Record<string, number>
  } catch {
    return {}
  }
}

function writeCells(zone: BarZone, m: Record<string, number>): void {
  safeSetItem(KEY[zone], JSON.stringify(m))
  window.dispatchEvent(new Event(EVENT))
}

export function useBarCells(zone: BarZone): Record<string, number> {
  const [m, setM] = useState(() => readCells(zone))
  useEffect(() => {
    const sync = () => setM(readCells(zone))
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [zone])
  return m
}

/** Every bar back to no stored cells and every item to icon and label (Reset). */
export function clearBarCells(): void {
  safeRemoveItem(KEY.top)
  safeRemoveItem(KEY.bottom)
  safeRemoveItem(STYLE_KEY)
  safeRemoveItem(BAR_STYLE_KEY)
  window.dispatchEvent(new Event(EVENT))
  window.dispatchEvent(new Event(STYLE_EVENT))
}

/* ── How an item shows in a bar ──
   Every item keeps its icon and label wherever it is dropped, so a move never
   changes how it looks. The user can switch one to its icon only, per item,
   from the edit panel. Search and the other widgets have their own forms. */

export type ItemStyle = 'label' | 'icon'
const STYLE_KEY = 'mc-bar-item-style'
const STYLE_EVENT = 'mc:bar-item-style-changed'
// Each bar's own Show setting (design exploration, the Tiles panel): an item
// with no choice of its own follows its bar. The bars start as icon only.
const BAR_STYLE_KEY = 'mc-bar-style'
const BAR_STYLE_DEFAULT: Record<BarZone, ItemStyle> = { top: 'icon', bottom: 'icon' }

function readStyles(): Record<string, ItemStyle> {
  try {
    const v = JSON.parse(safeGetItem(STYLE_KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(v).filter(([, s]) => s === 'icon' || s === 'label')) as Record<string, ItemStyle>
  } catch {
    return {}
  }
}

/** Arriving in a bar, an item drops any old choice of its own and follows
 *  that bar's Show setting; search, which keeps its own field-or-icon style,
 *  takes the bar's setting too. */
export function arriveInBar(zone: BarZone, id: string): void {
  const m = readStyles()
  if (id in m) { delete m[id]; safeSetItem(STYLE_KEY, JSON.stringify(m)); window.dispatchEvent(new Event(STYLE_EVENT)) }
  if (id === SEARCH_ITEM) setSearchStyle(readBarStyle(zone) === 'icon' ? 'icon' : 'field')
}

/** How an item will look in a bar: its own choice, else the bar's setting. */
export function styleInBar(zone: BarZone, id: string): ItemStyle {
  if (barIds(zone).includes(id)) return readStyles()[id] ?? readBarStyle(zone)
  return readBarStyle(zone)
}

export function readBarStyle(zone: BarZone): ItemStyle {
  try {
    const v = (JSON.parse(safeGetItem(BAR_STYLE_KEY) ?? '{}') as Record<string, unknown>)[zone]
    return v === 'icon' || v === 'label' ? v : BAR_STYLE_DEFAULT[zone]
  } catch {
    return BAR_STYLE_DEFAULT[zone]
  }
}

/** Set a whole bar's Show setting: its items drop their own choice and follow it. */
export function setBarStyle(zone: BarZone, style: ItemStyle): void {
  let all: Record<string, unknown> = {}
  try { all = JSON.parse(safeGetItem(BAR_STYLE_KEY) ?? '{}') as Record<string, unknown> } catch { all = {} }
  all[zone] = style
  safeSetItem(BAR_STYLE_KEY, JSON.stringify(all))
  const m = readStyles()
  for (const id of barIds(zone)) delete m[id]
  safeSetItem(STYLE_KEY, JSON.stringify(m))
  window.dispatchEvent(new Event(STYLE_EVENT))
}

/** The bar an item sits in, if any. */
function barOf(id: string): BarZone | null {
  if (barIds('top').includes(id)) return 'top'
  if (barIds('bottom').includes(id)) return 'bottom'
  return null
}

export function setItemStyle(id: string, style: ItemStyle): void {
  const m = readStyles()
  const bar = barOf(id)
  // Matching its bar's setting means no choice of its own.
  if (bar && style === readBarStyle(bar)) delete m[id]
  else m[id] = style
  safeSetItem(STYLE_KEY, JSON.stringify(m))
  window.dispatchEvent(new Event(STYLE_EVENT))
}

/** Each item's style, kept current. Unset means icon and label. */
export function useItemStyle(): (id: string) => ItemStyle {
  const [m, setM] = useState(readStyles)
  useEffect(() => {
    const sync = () => setM(readStyles())
    window.addEventListener(STYLE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(STYLE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  // An item without its own choice follows its bar's setting.
  return (id: string) => {
    if (m[id]) return m[id]
    const bar = barOf(id)
    return bar ? readBarStyle(bar) : 'label'
  }
}

/** A bar's Show setting, kept current. */
export function useBarStyle(zone: BarZone): ItemStyle {
  const [v, setV] = useState(() => readBarStyle(zone))
  useEffect(() => {
    const sync = () => setV(readBarStyle(zone))
    window.addEventListener(STYLE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(STYLE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [zone])
  return v
}

/* ── Columns and spans, as last measured on screen ── */

const columns: Record<BarZone, number> = { top: 30, bottom: 30 }
const spans: Record<BarZone, Record<string, number>> = { top: {}, bottom: {} }

export function setBarColumns(zone: BarZone, n: number): void { columns[zone] = Math.max(1, n) }
export function readBarColumns(zone: BarZone): number { return columns[zone] }
export function setItemSpan(zone: BarZone, id: string, n: number): void { spans[zone][id] = Math.max(1, n) }

/** Cells an item takes before it has been measured in this bar. */
function guessSpan(zone: BarZone, id: string): number {
  if (id === SEARCH_ITEM) return readSearchStyle() === 'icon' ? 1 : 6
  if (id === HISTORY_ITEM) return 2
  if (id === REMOTE_ITEM) return 3
  if (id === STATUS_ITEM) return zone === 'top' ? 6 : 4
  if (id === PROFILE_ITEM) return 1
  // Its own choice, else its bar's Show setting (icon only to start).
  return (readStyles()[id] ?? readBarStyle(zone)) === 'icon' ? 1 : 3
}

export function spanOf(zone: BarZone, id: string): number {
  return spans[zone][id] ?? guessSpan(zone, id)
}

/** Every item in a bar: its widgets, then its placed items. */
export function barIds(zone: BarZone): string[] {
  return [...WIDGET_ITEMS.filter(id => readPlace(id) === zone), ...readShellPlacement()[zone]]
}

/* ── Layout ── */

type Cols = Record<string, number>

/** Order by start cell, then make every item fit: no overlaps, inside 0..n.
 *  Too many items for the bar: they keep their order and run past the end. */
export function normalize(ids: readonly string[], want: Cols, span: (id: string) => number, n: number): Cols {
  const order = ids.map((id, i) => ({ id, i })).sort((a, b) => want[a.id] - want[b.id] || a.i - b.i).map(x => x.id)
  const out: Cols = {}
  let end = 0
  for (const id of order) { out[id] = Math.max(want[id], end, 0); end = out[id] + span(id) }
  let start = n
  for (const id of [...order].reverse()) { out[id] = Math.min(out[id], start - span(id)); start = out[id] }
  end = 0
  for (const id of order) { out[id] = Math.max(out[id], end, 0); end = out[id] + span(id) }
  return out
}

/** Where each item in a bar is drawn. */
export function resolveBar(zone: BarZone, ids: readonly string[], cells: Cols, span: (id: string) => number, n: number): Cols {
  const want: Cols = {}
  let lastEnd = 0
  for (const id of ids) if (id in cells) lastEnd = Math.max(lastEnd, cells[id] + span(id))
  for (const id of ids) {
    if (id in cells) want[id] = cells[id]
    // No stored cell: the top bar's right end, or after the bottom bar's last item.
    else if (zone === 'top') want[id] = Number.MAX_SAFE_INTEGER
    else { want[id] = lastEnd; lastEnd += span(id) }
  }
  return normalize(ids, want, span, n)
}

/** Put `id` at `col`, pushing the items there aside. */
export function pushAside(zone: BarZone, ids: readonly string[], cells: Cols, span: (id: string) => number, n: number, id: string, col: number): Cols {
  const others = ids.filter(x => x !== id)
  const now = resolveBar(zone, others, cells, span, n)
  const c = Math.max(0, Math.min(col, n - span(id)))
  const mid = c + span(id) / 2
  const left = others.filter(x => now[x] + span(x) / 2 < mid).sort((a, b) => now[b] - now[a])
  const right = others.filter(x => now[x] + span(x) / 2 >= mid).sort((a, b) => now[a] - now[b])
  const want: Cols = { [id]: c }
  let limit = c
  for (const x of left) { want[x] = Math.min(now[x], limit - span(x)); limit = want[x] }
  limit = c + span(id)
  for (const x of right) { want[x] = Math.max(now[x], limit); limit = want[x] + span(x) }
  return normalize([...left.reverse(), id, ...right], want, span, n)
}

/** Drop `id` on `zone` at start cell `col`: it joins the bar if it was not in
 *  it, and whatever sat there moves aside. Every item's cell is saved, so the
 *  bar stays as it looks now. */
export function placeOnBar(zone: BarZone, id: string, col: number): void {
  if (!barIds(zone).includes(id)) {
    arriveInBar(zone, id)
    moveItem(id, zone)
  }
  const span = (x: string) => spanOf(zone, x)
  const ids = barIds(zone)
  writeCells(zone, { ...readCells(zone), ...pushAside(zone, ids, readCells(zone), span, readBarColumns(zone), id, col) })
}

/** Where `id` is drawn in its bar now, and the cells it can start at. */
export function cellOf(zone: BarZone, id: string): { col: number; max: number } | null {
  const ids = barIds(zone)
  if (!ids.includes(id)) return null
  const span = (x: string) => spanOf(zone, x)
  const n = readBarColumns(zone)
  return { col: resolveBar(zone, ids, readCells(zone), span, n)[id], max: n - span(id) }
}

/** Shift `id` one cell left (-1) or right (+1), pushing a neighbour aside.
 *  The keyboard path for the grid (WCAG 2.5.7). Returns whether it moved. */
export function shiftOnBar(zone: BarZone, id: string, delta: -1 | 1): boolean {
  const at = cellOf(zone, id)
  if (!at) return false
  const col = at.col + delta
  if (col < 0 || col > at.max) return false
  placeOnBar(zone, id, col)
  return true
}

/** The bar's items in the order they are drawn, left to right. */
export function barOrder(zone: BarZone): string[] {
  const ids = barIds(zone)
  const cols = resolveBar(zone, ids, readCells(zone), x => spanOf(zone, x), readBarColumns(zone))
  return [...ids].sort((a, b) => cols[a] - cols[b])
}

/** The start cell a drop at client-x `x` means for `id`: the item is centred
 *  under the pointer. `null` when the bar's grid is not on screen. */
export function cellAt(zone: BarZone, x: number, id: string | null): number | null {
  const el = document.querySelector<HTMLElement>(`[data-bar-grid="${zone}"]`)
  const r = el?.getBoundingClientRect()
  if (!r || r.width === 0) return null
  const n = readBarColumns(zone)
  const w = r.width / n
  const span = id ? spanOf(zone, id) : 1
  return Math.max(0, Math.min(n - span, Math.round((x - r.left) / w - span / 2)))
}
