/**
 * Edit layout, option 1: drag only (design exploration).
 *
 * The most minimal of the three approaches compared from the Nov 11 review:
 * no Edit layout panel. People change only what they can see: drag an item to
 * move it between the top bar, the sidebar and the bottom bar, or drop it on
 * the faded page to hide it. Nothing new can be added here; Reset to default
 * brings the shipped layout back.
 *
 * Because Reset is the only way back for a hidden item, every hide offers
 * Undo for a few seconds. Undo restores the layout exactly as it was before
 * that hide (every layout store is snapshotted first), so it never touches
 * other changes.
 *
 * Desktop only: the phone keeps the panel, which is its only editor.
 */
import { useEffect, useState, type DragEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { EyeOff } from 'lucide-react'

import { Btn } from '../../components/ui'
import { OverlayPortal } from '../../components/overlayRoot'
import { i18nT } from '../../i18n/t'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useRailWidth } from '../../hooks/useRailWidth'
import { useEditOption } from '../../lib/editOption'
import {
  MATE_PIN_PREFIX, RAIL_LAYOUT_CHANGED_EVENT, RAIL_LAYOUT_KEY, SESSION_PIN_PREFIX, isEntityPin, readRailLayout, removePin, updateRail,
} from '../../lib/railLayout'
import {
  HISTORY_ITEM, PROFILE_ITEM, REMOTE_ITEM, SEARCH_ITEM, SHELL_ITEM_MIME, STATUS_ITEM, announceLayout, moveItem, readChromeDrag, readShellPlacement, removeFromBars, resetShellLayout,
  setLayoutEditing, setSidebarMembership, useChromeDrag, useLayoutEditing, zoneOf,
} from '../../lib/shellLayout'
import { clearBarCells } from '../../lib/barGrid'
import { clearSidebarRows } from '../../lib/sidebarGrid'
import { safeGetItem, safeRemoveItem, safeSetItem } from '../../utils/safeStorage'
import { shellItemMeta } from './shellItems'

/** True while Edit layout is on and option 1 (drag only) is the one shown. */
export function useDragOnlyEditing(): boolean {
  const editing = useLayoutEditing()
  const option = useEditOption()
  const phone = useIsMobile()
  return editing && option === 'drag' && !phone
}

/* ── Undo ── */

// Every store a hide can write, with the event each one's readers listen to.
const STORES: readonly [key: string, event: string][] = [
  ['mc-shell-placement', 'mc:shell-placement-changed'],
  ['mc-search-place', 'mc:two-place-changed'],
  ['mc-status-place', 'mc:two-place-changed'],
  ['mc-remote-place', 'mc:two-place-changed'],
  ['mc-history-place', 'mc:two-place-changed'],
  ['mc-profile-place', 'mc:two-place-changed'],
  [RAIL_LAYOUT_KEY, RAIL_LAYOUT_CHANGED_EVENT],
  ['mc-sidebar-rows', 'mc:sidebar-rows-changed'],
  ['mc-bar-cells-top', 'mc:bar-cells-changed'],
  ['mc-bar-cells-bottom', 'mc:bar-cells-changed'],
]

interface Hidden { id: string; label: string; snapshot: (string | null)[]; wasInSidebar: boolean; at: number }

const UNDO_EVENT = 'mc:drag-only-hidden'
let lastHidden: Hidden | null = null

function setLastHidden(h: Hidden | null): void {
  lastHidden = h
  window.dispatchEvent(new Event(UNDO_EVENT))
}

function useLastHidden(): Hidden | null {
  const [h, setH] = useState(lastHidden)
  useEffect(() => {
    const sync = () => setH(lastHidden)
    window.addEventListener(UNDO_EVENT, sync)
    return () => window.removeEventListener(UNDO_EVENT, sync)
  }, [])
  return h
}

const WIDGET_LABEL_KEY: Record<string, string> = {
  [SEARCH_ITEM]: 'nav.layout_locked_search',
  [REMOTE_ITEM]: 'components.instanceTabBar.instances',
  [HISTORY_ITEM]: 'nav.layout_locked_back_forward',
  [PROFILE_ITEM]: 'nav.profile_menu_name',
  [STATUS_ITEM]: 'nav.layout_status_item',
}

/** A name for the Undo message when the caller has none to hand. */
function fallbackLabel(id: string): string {
  const key = WIDGET_LABEL_KEY[id]
  if (key) return i18nT(key)
  const m = shellItemMeta(id)
  if (m) return m.label
  for (const prefix of [MATE_PIN_PREFIX, SESSION_PIN_PREFIX]) if (id.startsWith(prefix)) return id.slice(prefix.length)
  return id
}

/** Hide one item from the canvas, and offer Undo. `label`: its name as shown. */
export function hideFromCanvas(id: string, label = fallbackLabel(id)): void {
  const onSidebar = readRailLayout().groups.some(g => g.items.includes(id))
  const wasInSidebar = zoneOf(id, readShellPlacement(), onSidebar) === 'sidebar'
  const snapshot = STORES.map(([key]) => safeGetItem(key))
  if (isEntityPin(id)) {
    removeFromBars(id)
    updateRail(l => removePin(l, id))
  } else {
    moveItem(id, null)
  }
  setLastHidden({ id, label, snapshot, wasInSidebar, at: Date.now() })
  announceLayout(i18nT('nav.layout_removed', { item: label }))
}

function undoHide(h: Hidden): void {
  STORES.forEach(([key], i) => {
    const v = h.snapshot[i]
    if (v === null) safeRemoveItem(key)
    else safeSetItem(key, v)
  })
  for (const event of new Set(STORES.map(([, e]) => e))) window.dispatchEvent(new Event(event))
  // An installed app keeps its sidebar pin in the Library; tell it too.
  if (h.wasInSidebar) setSidebarMembership(h.id, true)
  setLastHidden(null)
  announceLayout(i18nT('nav.layout_restored', { item: h.label }))
}

/* ── Hovering the page during a sidebar drag ── */

// dnd-kit drags (sidebar rows) are pointer-based, so the page's native drop
// handlers never see them; the rail reports when the pointer is over the page.
const PAGE_OVER_EVENT = 'mc:drag-only-page-over'
let pageOver = false

export function setPageHideOver(on: boolean): void {
  if (pageOver === on) return
  pageOver = on
  window.dispatchEvent(new Event(PAGE_OVER_EVENT))
}

function usePageHideOver(): boolean {
  const [on, setOn] = useState(pageOver)
  useEffect(() => {
    const sync = () => setOn(pageOver)
    window.addEventListener(PAGE_OVER_EVENT, sync)
    return () => window.removeEventListener(PAGE_OVER_EVENT, sync)
  }, [])
  return on
}

/** Whether a screen point is over the page's hide area. */
export function pageHideZoneAt(x: number, y: number): boolean {
  const r = document.querySelector<HTMLElement>('[data-layout-outline="page"]')?.getBoundingClientRect()
  return !!r && r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

/* ── The page as a drop target ── */

/** The faded page becomes "drop here to hide" while an item is dragged.
 *  Place inside the desktop shell grid, beside the zone outlines. */
export function PageHideZone() {
  const on = useDragOnlyEditing()
  const drag = useChromeDrag()
  const sidebarOver = usePageHideOver()
  const [nativeOver, setNativeOver] = useState(false)
  if (!on) return null
  const dragging = drag.id !== null
  const over = nativeOver || sidebarOver

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(SHELL_ITEM_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setNativeOver(true)
  }
  const onDrop = (e: DragEvent) => {
    setNativeOver(false)
    if (!e.dataTransfer.types.includes(SHELL_ITEM_MIME)) return
    e.preventDefault()
    const id = e.dataTransfer.getData(SHELL_ITEM_MIME) || readChromeDrag().id
    if (id) hideFromCanvas(id)
  }
  return (
    <div
      aria-hidden="true"
      data-layout-outline="page"
      style={{ gridArea: 'content', zIndex: 65, pointerEvents: dragging ? 'auto' : 'none' }}
      className={`relative m-3 flex items-center justify-center rounded-2xl border-2 border-dashed transition-[opacity,border-color,background-color] duration-150 motion-reduce:transition-none ${
        dragging ? 'opacity-100' : 'opacity-0'} ${over ? 'border-text/70 bg-text/10' : 'border-text/30 bg-transparent'}`}
      onDragOver={onDragOver}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setNativeOver(false) }}
      onDrop={onDrop}
    >
      <span className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium ${over ? 'bg-text text-bg' : 'bg-bg-elevated text-text border border-border'}`}>
        <EyeOff size={15} aria-hidden="true" />
        {i18nT('nav.layout_drop_to_hide')}
      </span>
    </div>
  )
}

/* ── Done, Reset and Undo ── */

const UNDO_MS = 6000

/** A small floating bar over the page: what to do, Reset and Done, and the
 *  Undo message after a hide. The only controls option 1 adds. */
export function DragOnlyBar() {
  const on = useDragOnlyEditing()
  const hidden = useLastHidden()
  const railWidth = useRailWidth()
  const reduce = useReducedMotion()

  // Escape leaves edit mode, as in the panel.
  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLayoutEditing(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on])
  // Undo is offered for a few seconds, and never outlives edit mode.
  useEffect(() => {
    if (!hidden) return
    const t = window.setTimeout(() => setLastHidden(null), Math.max(0, hidden.at + UNDO_MS - Date.now()))
    return () => window.clearTimeout(t)
  }, [hidden])
  useEffect(() => { if (!on) setLastHidden(null) }, [on])

  if (!on) return null
  const reset = () => {
    resetShellLayout(); clearBarCells(); clearSidebarRows()
    setLastHidden(null)
    announceLayout(i18nT('nav.layout_reset_done'))
  }
  return (
    <OverlayPortal>
      <div
        className="pointer-events-none fixed bottom-6 right-0 z-[60] flex flex-col items-center gap-2 px-4"
        style={{ left: railWidth }}
      >
        <AnimatePresence>
          {hidden && (
            <motion.div
              key={hidden.at}
              role="status"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-auto flex max-w-full items-center gap-3 rounded-xl border border-border bg-bg-elevated px-3 py-2 text-[13px] text-text shadow-xl"
              data-testid="drag-only-undo"
            >
              <span className="min-w-0 truncate">{i18nT('nav.layout_hidden_item', { item: hidden.label })}</span>
              <Btn onClick={() => undoHide(hidden)}>{i18nT('nav.layout_undo')}</Btn>
            </motion.div>
          )}
        </AnimatePresence>
        <div
          role="region"
          aria-label={i18nT('nav.rail_customize_title')}
          className="pointer-events-auto flex max-w-full items-center gap-3 rounded-xl border border-border bg-bg-elevated py-2 pl-4 pr-2 text-text shadow-2xl"
          data-testid="drag-only-bar"
        >
          <span className="min-w-0 truncate text-[13px] text-muted" title={i18nT('nav.layout_drag_hint')}>{i18nT('nav.layout_drag_hint')}</span>
          <Btn onClick={reset}>{i18nT('nav.rail_reset')}</Btn>
          <Btn primary onClick={() => setLayoutEditing(false)}>{i18nT('nav.rail_done')}</Btn>
        </div>
      </div>
    </OverlayPortal>
  )
}
