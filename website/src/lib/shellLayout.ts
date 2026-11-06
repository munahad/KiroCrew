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
export const isWindowToggle = (id: string) => id === TERMINAL_ITEM || id === PHONE_ITEM

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
