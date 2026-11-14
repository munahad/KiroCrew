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
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, ChevronUp, EyeOff } from 'lucide-react'

import { Btn } from '../../components/ui'
import { OverlayPortal } from '../../components/overlayRoot'
import { i18nT } from '../../i18n/t'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useRailWidth } from '../../hooks/useRailWidth'
import { noteRemoved, useEditOption } from '../../lib/editOption'
import {
  MATE_PIN_PREFIX, RAIL_LAYOUT_CHANGED_EVENT, RAIL_LAYOUT_KEY, SESSION_PIN_PREFIX, isEntityPin, removePin, updateRail,
} from '../../lib/railLayout'
import {
  HISTORY_ITEM, PROFILE_ITEM, REMOTE_ITEM, SEARCH_ITEM, SHELL_ITEM_MIME, STATUS_ITEM, announceLayout, moveItem, readChromeDrag, removeFromBars, resetShellLayout,
  setLayoutEditing, useChromeDrag, useLayoutAnnouncement, useLayoutEditing,
} from '../../lib/shellLayout'
import { clearBarCells } from '../../lib/barGrid'
import { clearSidebarRows } from '../../lib/sidebarGrid'
import { safeGetItem, safeRemoveItem, safeSetItem } from '../../utils/safeStorage'
import { shellItemMeta } from './shellItems'
import { STATUS_BAR_EDIT_HEIGHT } from '../statusbar/shellStatusBar'
import { putBack, readHeldItem, spotOf, useHeldItem, type ItemSpot } from './keyboardMove'

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
  ['mc-bar-item-style', 'mc:bar-item-style-changed'],
  ['mc-search-style', 'mc:search-style-changed'],
]

/** The whole layout as stored now, to put back exactly (Undo, a cancelled
 *  keyboard move). */
export type LayoutSnapshot = (string | null)[]
export function snapshotLayout(): LayoutSnapshot {
  return STORES.map(([key]) => safeGetItem(key))
}
export function restoreLayout(snapshot: LayoutSnapshot): void {
  STORES.forEach(([key], i) => {
    const v = snapshot[i]
    if (v === null) safeRemoveItem(key)
    else safeSetItem(key, v)
  })
  for (const event of new Set(STORES.map(([, e]) => e))) window.dispatchEvent(new Event(event))
}

interface Hidden { id: string; label: string; spot: ItemSpot | null; at: number }

// Every hide in this edit session, newest last. Undo (the message's button or
// Cmd/Ctrl+Z) puts back the newest one, in its old place, and leaves every
// other change alone, so several hides can each be undone in turn.
const UNDO_EVENT = 'mc:drag-only-hidden'
let hiddenStack: Hidden[] = []

function setHiddenStack(next: Hidden[]): void {
  hiddenStack = next
  window.dispatchEvent(new Event(UNDO_EVENT))
}

function useHiddenStack(): Hidden[] {
  const [h, setH] = useState(hiddenStack)
  useEffect(() => {
    const sync = () => setH(hiddenStack)
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
export function layoutItemLabel(id: string): string {
  const key = WIDGET_LABEL_KEY[id]
  if (key) return i18nT(key)
  const m = shellItemMeta(id)
  if (m) return m.label
  for (const prefix of [MATE_PIN_PREFIX, SESSION_PIN_PREFIX]) if (id.startsWith(prefix)) return id.slice(prefix.length)
  return id
}

/** Hide one item from the canvas, and offer Undo. `label`: its name as shown. */
export function hideFromCanvas(id: string, label = layoutItemLabel(id)): void {
  const spot = spotOf(id)
  if (isEntityPin(id)) {
    removeFromBars(id)
    updateRail(l => removePin(l, id))
  } else {
    moveItem(id, null)
  }
  setHiddenStack([...hiddenStack.filter(h => h.id !== id), { id, label, spot, at: Date.now() }])
  noteRemoved(id)
  announceLayout(i18nT('nav.layout_removed', { item: label }))
}

/** Put back one hidden item (the newest when none is named), in its old place. */
function undoHide(id?: string): void {
  const h = id ? hiddenStack.find(x => x.id === id) : hiddenStack[hiddenStack.length - 1]
  if (!h) return
  if (h.spot) putBack(h.id, h.spot)
  setHiddenStack(hiddenStack.filter(x => x !== h))
  announceLayout(i18nT('nav.layout_restored', { item: h.label }))
}
const undoLastHide = () => undoHide()

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
  const dragOnly = useDragOnlyEditing()
  // Option 2 too: drop an item on the page to hide it, from the layout itself
  // rather than only from the panel's menu. There the page stays visible (faded)
  // and the drop target shows only while something is dragged, under the panel.
  const editing = useLayoutEditing()
  const option = useEditOption()
  const phone = useIsMobile()
  const panelMode = editing && option === 'panel' && !phone
  const on = dragOnly || panelMode
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
  // A plain area stands in for the page while editing: nothing of the page
  // shows. While an item is dragged it says "Drop here to hide".
  return (
    <div
      aria-hidden="true"
      data-layout-outline="page"
      style={{ gridArea: 'content', zIndex: panelMode ? 55 : 65, pointerEvents: dragging ? 'auto' : 'none' }}
      className={`relative m-3 flex items-center justify-center rounded-2xl transition-[background-color,opacity] duration-150 motion-reduce:transition-none ${
        panelMode && !dragging ? 'opacity-0' : 'opacity-100'} ${over ? 'bg-text/10' : panelMode ? 'bg-text/[0.03]' : 'bg-text/5'}`}
      onDragOver={onDragOver}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setNativeOver(false) }}
      onDrop={onDrop}
    >
      {dragging
        ? (
          <span className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium ${over ? 'bg-text text-bg' : 'bg-bg-elevated text-text border border-border'}`}>
            <EyeOff size={15} aria-hidden="true" />
            {i18nT('nav.layout_drop_to_hide')}
          </span>
        )
        : panelMode ? null : <span className="text-[13px] text-muted">{i18nT('nav.layout_preview_page')}</span>}
    </div>
  )
}

/* ── Done, Reset and Undo ── */

/** Long enough to reach by keyboard or switch; paused while pointed at or focused. */
const UNDO_MS = 10_000

/** A small floating bar over the page: what to do, Reset and Done, and the
 *  Undo message after a hide. The only controls option 1 adds.
 *
 *  Accessibility: focus moves here when edit mode opens and goes back to
 *  where it was on Done (WCAG 2.4.3 Focus Order); every move, hide, Undo and
 *  Reset is read out through a live region (4.1.3 Status Messages); Undo
 *  pauses while the pointer or focus is on it, and Cmd/Ctrl+Z undoes the
 *  last hide (2.2.1 Timing Adjustable). */
export function DragOnlyBar() {
  const on = useDragOnlyEditing()
  const stack = useHiddenStack()
  const hidden = stack[stack.length - 1] ?? null
  // The message shows after each hide and fades after a while; Cmd/Ctrl+Z
  // keeps working through the whole stack until Done.
  const [shownAt, setShownAt] = useState<number | null>(null)
  useEffect(() => { setShownAt(hidden ? hidden.at : null) }, [hidden])
  const railWidth = useRailWidth()
  const reduce = useReducedMotion()
  const announcement = useLayoutAnnouncement()
  const held = useHeldItem()
  const barRef = useRef<HTMLDivElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const [paused, setPaused] = useState(false)
  // The full list of hidden items, opened from "+N more". Open, it stays.
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { if (stack.length < 2) setExpanded(false) }, [stack.length])

  // Focus the editor on open; give it back on close.
  useEffect(() => {
    if (!on) return
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    barRef.current?.focus()
    return () => {
      const back = returnTo.current
      if (back?.isConnected) back.focus()
    }
  }, [on])
  // Escape leaves edit mode, unless it is cancelling a keyboard move.
  // Cmd/Ctrl+Z undoes the last hide.
  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !readHeldItem() && !e.defaultPrevented) setLayoutEditing(false)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && hiddenStack.length) {
        e.preventDefault()
        undoLastHide()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on])
  // Undo is offered for a while, paused while in use, and never outlives edit mode.
  useEffect(() => {
    if (shownAt === null || paused || expanded) return
    const t = window.setTimeout(() => setShownAt(null), UNDO_MS)
    return () => window.clearTimeout(t)
  }, [shownAt, paused, expanded])
  useEffect(() => { if (!on) setHiddenStack([]) }, [on])

  if (!on) return null
  const reset = () => {
    resetShellLayout(); clearBarCells(); clearSidebarRows()
    setHiddenStack([])
    announceLayout(i18nT('nav.layout_reset_done'))
  }
  const pause = { onPointerEnter: () => setPaused(true), onPointerLeave: () => setPaused(false), onFocus: () => setPaused(true), onBlur: () => setPaused(false) }
  return (
    <OverlayPortal>
      {/* Read out every change (no panel, so this is option 1's own). */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
      <div
        className="pointer-events-none fixed right-0 z-[60] flex flex-col items-center gap-2 px-4"
        // Above the bottom bar (drawn while editing, 42px), never over it.
        style={{ left: railWidth, bottom: STATUS_BAR_EDIT_HEIGHT + 16 }}
      >
        <AnimatePresence>
          {hidden && shownAt !== null && (
            <motion.div
              key="undo"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-auto flex max-w-full flex-col rounded-xl border border-border bg-bg-elevated px-3 py-2 text-[13px] text-text shadow-xl"
              data-testid="drag-only-undo"
              {...pause}
            >
              {/* Newest first. With more than one, "+N more" opens the
                  whole list, so any item can be put back on its own. */}
              {expanded && stack.length > 1 && (
                <ul id="drag-only-hidden-list" className="m-0 mb-1 flex list-none flex-col gap-0.5 border-b border-border p-0 pb-1.5" aria-label={i18nT('nav.layout_hidden_list')}>
                  {[...stack].reverse().map(h => (
                    <li key={h.id} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate">{h.label}</span>
                      <Btn onClick={() => undoHide(h.id)} aria-label={i18nT('nav.layout_put_back_item', { item: h.label })}>{i18nT('nav.layout_put_back')}</Btn>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-3">
                <span className="min-w-0 truncate">{i18nT('nav.layout_hidden_item', { item: hidden.label })}</span>
                {stack.length > 1 && (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls="drag-only-hidden-list"
                    onClick={() => setExpanded(v => !v)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border-none bg-transparent px-1.5 py-1 text-[13px] text-muted hover:bg-bg-hover hover:text-text cursor-pointer"
                  >
                    {i18nT('nav.layout_hidden_more', { count: stack.length - 1 })}
                    {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronUp size={14} aria-hidden="true" />}
                  </button>
                )}
                {!expanded && <Btn onClick={undoLastHide}>{i18nT('nav.layout_undo')}</Btn>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div
          ref={barRef}
          tabIndex={-1}
          role="region"
          aria-label={i18nT('nav.rail_customize_title')}
          aria-describedby="drag-only-kbd-hint"
          className="pointer-events-auto flex max-w-full items-center gap-3 rounded-xl border border-border bg-bg-elevated py-2 pl-4 pr-2 text-text shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
          data-testid="drag-only-bar"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] text-muted" title={i18nT('nav.layout_drag_hint')}>{i18nT('nav.layout_drag_hint')}</span>
            {/* The keyboard path, said where keyboard users land. While an
                item is held, it says how to finish the move. */}
            <span id="drag-only-kbd-hint" className="truncate text-[12px] text-muted" title={i18nT(held ? 'nav.layout_kbd_held' : 'nav.layout_kbd_hint')}>
              {i18nT(held ? 'nav.layout_kbd_held' : 'nav.layout_kbd_hint')}
            </span>
          </span>
          <Btn onClick={reset}>{i18nT('nav.rail_reset')}</Btn>
          <Btn primary onClick={() => setLayoutEditing(false)}>{i18nT('nav.rail_done')}</Btn>
        </div>
      </div>
    </OverlayPortal>
  )
}
