/**
 * The phone's own layout (design exploration).
 *
 * The phone has no top or bottom bar, so it shows every placed item in one
 * sidebar column: top-bar items first, then the sidebar's groups, then
 * bottom-bar items (the shell review's decision). Its fixed controls (search,
 * Customize, Settings) stay where the phone drawer puts them.
 *
 * Reordering or hiding on the phone changes the phone only. Those changes are
 * kept here, on top of the desktop layout, so the desktop never moves:
 * - `order`: the phone's own order, applied within each part of the column.
 * - `hidden`: items hidden on the phone but still placed on the desktop.
 * - `extra`: items not on the desktop layout that the phone shows anyway, at
 *   the end of the column.
 */
import { useEffect, useState } from 'react'

import { safeGetItem, safeRemoveItem, safeSetItem } from '../utils/safeStorage'
import { PHONE_ITEM, TERMINAL_ITEM, isWidgetItem } from './shellLayout'

export interface PhoneLayout { order: string[]; hidden: string[]; extra: string[] }

const KEY = 'mc-phone-layout'
const EVENT = 'mc:phone-layout-changed'
const EMPTY: PhoneLayout = { order: [], hidden: [], extra: [] }

export function readPhoneLayout(): PhoneLayout {
  try {
    const raw = safeGetItem(KEY)
    if (!raw) return EMPTY
    const v = JSON.parse(raw) as Partial<PhoneLayout>
    const ids = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [])
    return { order: ids(v.order), hidden: ids(v.hidden), extra: ids(v.extra) }
  } catch {
    return EMPTY
  }
}

function write(p: PhoneLayout): void {
  safeSetItem(KEY, JSON.stringify(p))
  window.dispatchEvent(new Event(EVENT))
}

export function usePhoneLayout(): PhoneLayout {
  const [p, setP] = useState(readPhoneLayout)
  useEffect(() => {
    const sync = () => setP(readPhoneLayout())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return p
}

/** Bar items the phone column shows: pages, apps, Mates, sessions and
 *  feedback. Widgets keep the phone's fixed spots, and the terminal and phone
 *  rows are already fixed rows of the phone drawer. */
export function phoneBarIds(ids: readonly string[]): string[] {
  return ids.filter(id => !isWidgetItem(id) && id !== TERMINAL_ITEM && id !== PHONE_ITEM)
}

/** `ids` in the phone's order, phone-hidden ones dropped. Ids the phone has no
 *  order for keep their desktop order, after the ordered ones. */
export function forPhone(ids: readonly string[], p: PhoneLayout): string[] {
  const hidden = new Set(p.hidden)
  const rank = (id: string) => { const i = p.order.indexOf(id); return i < 0 ? Number.MAX_SAFE_INTEGER : i }
  return ids
    .filter(id => !hidden.has(id))
    .map((id, i) => ({ id, i }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i)
    .map(x => x.id)
}

/** Move `id` one step within `part` (already in phone order). */
export function phoneStep(part: readonly string[], id: string, delta: -1 | 1): boolean {
  const i = part.indexOf(id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= part.length) return false
  const next = [...part]
  ;[next[i], next[j]] = [next[j], next[i]]
  const p = readPhoneLayout()
  const moved = new Set(next)
  write({ ...p, order: [...p.order.filter(x => !moved.has(x)), ...next] })
  return true
}

/** Hide `id` on the phone only. */
export function phoneHide(id: string): void {
  const p = readPhoneLayout()
  write({ ...p, hidden: [...p.hidden.filter(x => x !== id), id], extra: p.extra.filter(x => x !== id) })
}

/** Show `id` on the phone. `onDesktop`: the desktop layout places it, so
 *  un-hiding is enough; otherwise it joins the end of the phone column. */
export function phoneShow(id: string, onDesktop: boolean): void {
  const p = readPhoneLayout()
  const extra = p.extra.filter(x => x !== id)
  write({ ...p, hidden: p.hidden.filter(x => x !== id), extra: onDesktop ? extra : [...extra, id] })
}

/** Back to following the desktop layout. */
export function resetPhoneLayout(): void {
  safeRemoveItem(KEY)
  window.dispatchEvent(new Event(EVENT))
}
