/**
 * The sidebar's row grid (design exploration), the vertical twin of the bars'
 * cell grid (lib/barGrid.ts). The sidebar below the logo is a column of equal
 * rows. Every item (pages, apps, Mates, sessions, widgets, and the titles of
 * groups the user made) sits at a row and stays there, gaps included, so
 * "You" can sit at the very bottom with empty rows above it. Dropping onto a
 * taken row pushes the items there up or down, as far as they must.
 *
 * Group membership follows the column: a row belongs to the group whose title
 * is the nearest one above it (or the untitled first group). The rail layout
 * (lib/railLayout.ts) still records the groups and their order, so the phone,
 * which keeps its plain list, and every other reader see the same arrangement.
 */
import { useEffect, useState } from 'react'

import { safeGetItem, safeRemoveItem, safeSetItem } from '../utils/safeStorage'
import { normalize } from './barGrid'
import { FALLBACK_GROUP_ID, applyVisibleOrder, readRailLayout, writeRailLayout, type RailGroup } from './railLayout'
import { PROFILE_ITEM, STATUS_ITEM } from './shellLayout'

const KEY = 'mc-sidebar-rows'
const EVENT = 'mc:sidebar-rows-changed'

type Rows = Record<string, number>

export function readSidebarRows(): Rows {
  try {
    const v = JSON.parse(safeGetItem(KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(v).filter(([, r]) => typeof r === 'number' && Number.isFinite(r) && r >= 0)) as Rows
  } catch {
    return {}
  }
}

function writeSidebarRows(m: Rows): void {
  safeSetItem(KEY, JSON.stringify(m))
  window.dispatchEvent(new Event(EVENT))
}

export function useSidebarRows(): Rows {
  const [m, setM] = useState(readSidebarRows)
  useEffect(() => {
    const sync = () => setM(readSidebarRows())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return m
}

export function clearSidebarRows(): void {
  safeRemoveItem(KEY)
  window.dispatchEvent(new Event(EVENT))
}

/** How many rows fit, as last measured on screen. */
let rowCount = 16
export function setSidebarRowCount(n: number): void { rowCount = Math.max(1, n) }
export function readSidebarRowCount(): number { return rowCount }

/** Items with no stored row start at the bottom: status and "You", where the
 *  sidebar's account area always was. Everything else packs from the top. */
const FOOT = new Set<string>([STATUS_ITEM, PROFILE_ITEM])
const one = () => 1

/** The row each item is drawn at. `ids` in list order. */
export function resolveColumn(ids: readonly string[], rows: Rows, n: number): Rows {
  const want: Rows = {}
  let next = 0
  for (const id of ids) if (id in rows) next = Math.max(next, rows[id] + 1)
  for (const id of ids) {
    if (id in rows) want[id] = rows[id]
    else if (FOOT.has(id)) want[id] = Number.MAX_SAFE_INTEGER
    else want[id] = next++
  }
  return normalize(ids, want, one, Math.max(n, ids.length))
}

/** Put `id` at `row`, pushing the items there up or down. */
export function pushAsideInColumn(ids: readonly string[], rows: Rows, n: number, id: string, row: number): Rows {
  const others = ids.filter(x => x !== id)
  const size = Math.max(n, ids.length)
  const now = resolveColumn(others, rows, n)
  const r = Math.max(0, Math.min(row, size - 1))
  // Try with the row it lands on moving down; if the bottom is full and that
  // would shift the dropped item itself, move that row up instead.
  const attempt = (upToo: boolean) => {
    const up = others.filter(x => (upToo ? now[x] <= r : now[x] < r)).sort((a, b) => now[b] - now[a])
    const down = others.filter(x => !(upToo ? now[x] <= r : now[x] < r)).sort((a, b) => now[a] - now[b])
    const want: Rows = { [id]: r }
    let limit = r
    for (const x of up) { want[x] = Math.min(now[x], limit - 1); limit = want[x] }
    limit = r + 1
    for (const x of down) { want[x] = Math.max(now[x], limit); limit = want[x] + 1 }
    return normalize([...up.reverse(), id, ...down], want, one, size)
  }
  const first = attempt(false)
  return first[id] === r ? first : attempt(true)
}

/** Drop `id` at `row` and save every item's row, so the column stays as it looks. */
export function placeInSidebar(ids: readonly string[], id: string, row: number): Rows {
  const all = ids.includes(id) ? ids : [...ids, id]
  const out = { ...readSidebarRows(), ...pushAsideInColumn(all, readSidebarRows(), rowCount, id, row) }
  writeSidebarRows(out)
  return out
}

/** The ids in the order the column draws them, top to bottom. */
export function columnOrder(ids: readonly string[], rows: Rows = readSidebarRows(), n = rowCount): string[] {
  const at = resolveColumn(ids, rows, n)
  return [...ids].sort((a, b) => at[a] - at[b])
}

/* ── Groups, read off the column ── */

/** Column id of a group's title. Prefixed so it can never equal a nav id. */
export const HEADER_PREFIX = 'rail-group:'
export const headerId = (groupId: string) => HEADER_PREFIX + groupId
export const isHeaderId = (id: string) => id.startsWith(HEADER_PREFIX)

/** Whether a group shows a title row: the base list, untitled, has none. */
export const hasHeader = (g: RailGroup) => !(g.id === FALLBACK_GROUP_ID && !g.title)

/** Every id the column draws, in list order: each group's title, then its rows. */
export function columnIdsOf(groups: readonly RailGroup[]): string[] {
  return groups.flatMap(g => [...(hasHeader(g) ? [headerId(g.id)] : []), ...g.items])
}

/**
 * Rebuild groups from a flat top-to-bottom order: each title opens its group,
 * and a row above the first title joins the first group. Group order follows
 * the titles' order.
 */
export function regroupFlat(flat: readonly string[], groups: readonly RailGroup[]): RailGroup[] {
  const order = [...groups]
  const titled = flat.filter(isHeaderId).map(h => groups.find(g => headerId(g.id) === h)).filter((g): g is RailGroup => !!g)
  // Untitled groups keep their place at the front; titled ones follow their titles.
  const sorted = [...order.filter(g => !hasHeader(g)), ...titled, ...order.filter(g => hasHeader(g) && !titled.includes(g))]
  const out: RailGroup[] = sorted.map(g => ({ ...g, items: [] }))
  let current = -1
  const orphans: string[] = []
  for (const id of flat) {
    if (isHeaderId(id)) { current = out.findIndex(g => headerId(g.id) === id); continue }
    if (current < 0) orphans.push(id)
    else out[current].items.push(id)
  }
  if (out.length) out[0].items.unshift(...orphans)
  return out
}

/** Save the column's current order as the rail layout's groups. */
export function commitColumn(groups: readonly RailGroup[], ids: readonly string[], rows: Rows = readSidebarRows()): void {
  writeRailLayout(applyVisibleOrder(readRailLayout(), regroupFlat(columnOrder(ids, rows), groups)))
}

/** Move a column row one step up (-1) or down (+1), pushing a neighbour aside.
 *  The keyboard path for the column (WCAG 2.5.7). */
export function shiftInSidebar(groups: readonly RailGroup[], id: string, delta: -1 | 1): boolean {
  const ids = columnIdsOf(groups)
  if (!ids.includes(id)) return false
  const at = resolveColumn(ids, readSidebarRows(), rowCount)[id]
  const row = at + delta
  if (row < 0 || row >= Math.max(rowCount, ids.length)) return false
  commitColumn(groups, ids, placeInSidebar(ids, id, row))
  return true
}

/** Whether a column row can move one step. */
export function canShiftInSidebar(groups: readonly RailGroup[], id: string, delta: -1 | 1): boolean {
  const ids = columnIdsOf(groups)
  if (!ids.includes(id)) return false
  const row = resolveColumn(ids, readSidebarRows(), rowCount)[id] + delta
  return row >= 0 && row < Math.max(rowCount, ids.length)
}
