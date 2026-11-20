/**
 * Edit layout, option 1: on the window only (design exploration).
 *
 * No Edit layout panel: people edit the real window directly. Drag an item to
 * move it between the top bar, the sidebar and the bottom bar; each item also
 * shows step arrows and a "⋯" menu (Move to, Remove) on hover or keyboard
 * focus (keyboardMove.tsx), and each area has a "+" that adds an item not
 * shown (areaAdd.tsx). Dropping an item on the page does nothing: the item
 * goes back. Reset to default brings the shipped layout back.
 *
 * Desktop only: the phone has no layout editing (round 1).
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'

import { Btn } from '../../components/ui'
import { OverlayPortal } from '../../components/overlayRoot'
import { i18nT } from '../../i18n/t'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useRailWidth } from '../../hooks/useRailWidth'
import { IS_MAC } from '../../hooks/useKeyboardShortcuts'
import { noteRemoved, useEditOption } from '../../lib/editOption'
import {
  MATE_PIN_PREFIX, RAIL_LAYOUT_CHANGED_EVENT, RAIL_LAYOUT_KEY, SESSION_PIN_PREFIX, isEntityPin, removePin, updateRail,
} from '../../lib/railLayout'
import {
  HISTORY_ITEM, LOGO_ITEM, NOTIFY_ITEM, PROFILE_ITEM, REMOTE_ITEM, SEARCH_ITEM, STATUS_ITEM, canRemove, announceLayout, isLayoutEditing, moveItem, removeFromBars, resetShellLayout,
  setLayoutEditing, useLayoutAnnouncement, useLayoutEditing,
} from '../../lib/shellLayout'
import { clearBarCells } from '../../lib/barGrid'
import { clearSidebarRows } from '../../lib/sidebarGrid'
import { safeGetItem, safeRemoveItem, safeSetItem } from '../../utils/safeStorage'
import { shellItemMeta } from './shellItems'
import { STATUS_BAR_EDIT_HEIGHT } from '../statusbar/shellStatusBar'
import { putBack, readHeldItem, spotOf, useHeldItem, type ItemSpot } from './keyboardMove'

/** True while Edit layout is on and option 1 (on the window) is the one shown. */
export function useDragOnlyEditing(): boolean {
  const editing = useLayoutEditing()
  const option = useEditOption()
  const phone = useIsMobile()
  return editing && option === 'drag' && !phone
}

/** True while the page is replaced by a plain "Page" area: options 1 (on the
 *  window) and 2 (edit panel) on desktop. Nothing of the page shows behind the
 *  editor, so page parts such as the chat's Sessions list do not read as
 *  areas that can be edited. Option 3 covers the page with its own backdrop. */
export function usePageStandIn(): boolean {
  const editing = useLayoutEditing()
  const option = useEditOption()
  const phone = useIsMobile()
  return editing && (option === 'drag' || option === 'panel') && !phone
}

/* ── A snapshot of every layout store (a cancelled keyboard move) ── */

const STORES: readonly [key: string, event: string][] = [
  ['mc-shell-placement', 'mc:shell-placement-changed'],
  ['mc-search-place', 'mc:two-place-changed'],
  ['mc-status-place', 'mc:two-place-changed'],
  ['mc-remote-place', 'mc:two-place-changed'],
  ['mc-history-place', 'mc:two-place-changed'],
  ['mc-profile-place', 'mc:two-place-changed'],
  ['mc-notify-place', 'mc:two-place-changed'],
  ['mc-logo-hidden', 'mc:logo-changed'],
  [RAIL_LAYOUT_KEY, RAIL_LAYOUT_CHANGED_EVENT],
  ['mc-sidebar-rows', 'mc:sidebar-rows-changed'],
  ['mc-bar-cells-top', 'mc:bar-cells-changed'],
  ['mc-bar-cells-bottom', 'mc:bar-cells-changed'],
  ['mc-bar-item-style', 'mc:bar-item-style-changed'],
  ['mc-search-style', 'mc:search-style-changed'],
]

/** The whole layout as stored now, to put back exactly (Escape during a
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

const WIDGET_LABEL_KEY: Record<string, string> = {
  [SEARCH_ITEM]: 'nav.layout_locked_search',
  [REMOTE_ITEM]: 'components.instanceTabBar.instances',
  [HISTORY_ITEM]: 'nav.layout_locked_back_forward',
  [PROFILE_ITEM]: 'nav.profile_menu_name',
  [STATUS_ITEM]: 'nav.layout_status_item',
  [NOTIFY_ITEM]: 'nav.layout_notifications_item',
  [LOGO_ITEM]: 'nav.layout_locked_logo',
}

/** A name for an announcement when the caller has none to hand. */
export function layoutItemLabel(id: string): string {
  const key = WIDGET_LABEL_KEY[id]
  if (key) return i18nT(key)
  const m = shellItemMeta(id)
  if (m) return m.label
  for (const prefix of [MATE_PIN_PREFIX, SESSION_PIN_PREFIX]) if (id.startsWith(prefix)) return id.slice(prefix.length)
  return id
}

/* ── Undo (option 1, checkpoints 56 and 57) ──
   Every removal in this edit session, newest last. Undo (the message's button
   or Cmd/Ctrl+Z) puts back the newest one, in its old spot (or the nearest
   free one in the same area), and leaves every other change alone, so
   removals are undone one at a time. After two or more, the message's "▾"
   lists them all, newest first, each with its own Restore, so one in the
   middle comes back without undoing the later ones (the "+N more" list from
   before round 1). Cleared on Done. */
interface Removed { id: string; label: string; spot: ItemSpot | null; at: number }
const UNDO_EVENT = 'mc:layout-removed-stack'
let removedStack: Removed[] = []
function setRemovedStack(next: Removed[]): void {
  removedStack = next
  window.dispatchEvent(new Event(UNDO_EVENT))
}
export const readRemovedStack = (): readonly Removed[] => removedStack
function useRemovedStack(): Removed[] {
  const [h, setH] = useState(removedStack)
  useEffect(() => {
    const sync = () => setH(removedStack)
    window.addEventListener(UNDO_EVENT, sync)
    return () => window.removeEventListener(UNDO_EVENT, sync)
  }, [])
  return h
}
export function clearRemovedStack(): void { if (removedStack.length) setRemovedStack([]) }

/** Remove one item from the window (Not shown). `label`: its name as shown.
 *  The area's "+" brings it back; in edit mode Undo does too. */
export function hideFromCanvas(id: string, label = layoutItemLabel(id)): void {
  // "You" and the fixed items are never removed (round 1, lib/shellLayout.ts).
  if (!canRemove(id)) return
  const spot = spotOf(id)
  if (isEntityPin(id)) {
    removeFromBars(id)
    updateRail(l => removePin(l, id))
  } else {
    moveItem(id, null)
  }
  noteRemoved(id)
  if (isLayoutEditing()) setRemovedStack([...removedStack.filter(h => h.id !== id), { id, label, spot, at: Date.now() }])
  announceLayout(i18nT('nav.layout_removed', { item: label }))
}

/** Put back one removal (the newest when none is named), in its old spot.
 *  Returns whether one was. */
export function restoreRemoved(id?: string): boolean {
  const h = id ? removedStack.find(x => x.id === id) : removedStack[removedStack.length - 1]
  if (!h) return false
  setRemovedStack(removedStack.filter(x => x !== h))
  if (h.spot) putBack(h.id, h.spot)
  announceLayout(i18nT('nav.layout_restored', { item: h.label }))
  return true
}
export const undoRemove = (): boolean => restoreRemoved()

/* ── The page ── */

/** Kept for the sidebar's phone drag path (railGroups.tsx), which asks
 *  whether a drop lands on the page's hide area. There is no such area any
 *  more: a drop on the page never hides an item. */
export function setPageHideOver(_on: boolean): void {}
export function pageHideZoneAt(_x: number, _y: number): boolean {
  return false
}

/** A plain "Page" area that stands in for the page while editing (options 1
 *  and 2). Not a drop target: an item dropped there goes back to where it
 *  was. Place inside the desktop shell grid, beside the zone outlines. */
export function PageHideZone() {
  const on = usePageStandIn()
  const option = useEditOption()
  if (!on) return null
  return (
    <div
      aria-hidden="true"
      data-layout-outline="page"
      style={{ gridArea: 'content', zIndex: option === 'panel' ? 55 : 65, pointerEvents: 'none' }}
      className="relative m-3 flex items-center justify-center rounded-2xl bg-text/5"
    >
      <span className="text-[13px] text-muted">{i18nT('nav.layout_preview_page')}</span>
    </div>
  )
}

/* ── Done and Reset ── */

/** Long enough to reach by keyboard or switch; paused while pointed at or focused. */
const UNDO_MS = 10_000

/** A small floating bar over the page: what to do, Reset and Done. The only
 *  control option 1 adds besides each item's own and each area's "+".
 *
 *  Accessibility: focus moves here when edit mode opens and goes back to
 *  where it was on Done (WCAG 2.4.3 Focus Order); every move, removal, add and
 *  Reset is read out through a live region (4.1.3 Status Messages). */
export function DragOnlyBar() {
  const on = useDragOnlyEditing()
  const railWidth = useRailWidth()
  const announcement = useLayoutAnnouncement()
  const held = useHeldItem()
  const barRef = useRef<HTMLDivElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)

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
  // Escape leaves edit mode, unless it is cancelling a keyboard move or a
  // control (an open menu or add list) handled it first.
  // Cmd/Ctrl+Z puts back the newest removal.
  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !readHeldItem() && !e.defaultPrevented) setLayoutEditing(false)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z' && removedStack.length) {
        const t = e.target
        if (t instanceof Element && t.closest('input, textarea, [contenteditable="true"]')) return
        e.preventDefault()
        undoRemove()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on])
  // Undo never outlives edit mode.
  useEffect(() => { if (!on) clearRemovedStack() }, [on])
  // The message names the newest removal; it fades after a while (paused
  // while pointed at or focused), and Cmd/Ctrl+Z keeps working until Done.
  const stack = useRemovedStack()
  const last = stack[stack.length - 1] ?? null
  const [shownAt, setShownAt] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  useEffect(() => { setShownAt(last ? Date.now() : null) }, [last])
  useEffect(() => {
    if (shownAt === null || paused) return
    const t = window.setTimeout(() => setShownAt(null), UNDO_MS)
    return () => window.clearTimeout(t)
  }, [shownAt, paused])

  if (!on) return null
  const reset = () => {
    resetShellLayout(); clearBarCells(); clearSidebarRows()
    clearRemovedStack()
    announceLayout(i18nT('nav.layout_reset_done'))
  }
  return (
    <OverlayPortal>
      {/* Read out every change (no panel, so this is option 1's own). */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
      <div
        className="pointer-events-none fixed right-0 z-[60] flex flex-col items-center gap-2 px-4"
        // Above the bottom bar (drawn while editing, 42px), with room between for
        // the bottom-bar items' arrows and "⋯", which show just above them.
        style={{ left: railWidth, bottom: STATUS_BAR_EDIT_HEIGHT + 36 }}
      >
        {last && shownAt !== null && <UndoMessage stack={stack} onPause={setPaused} />}
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
            <span className="truncate text-[13px] text-muted" title={i18nT('nav.layout_window_hint')}>{i18nT('nav.layout_window_hint')}</span>
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

/** The removal message: "<Item> removed · Undo", or after two or more,
 *  "<N> removed · Undo ▾". The "▾" opens a menu of every removal this edit
 *  session, newest first, each a Restore (WAI-ARIA menu button: Up, Down,
 *  Home and End move, Escape or Tab closes and returns focus to "▾"). It opens
 *  upward, as the message sits above the bottom bar. */
function UndoMessage({ stack, onPause }: { stack: readonly Removed[]; onPause: (on: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const last = stack[stack.length - 1]
  const many = stack.length > 1
  useEffect(() => { if (!many) setOpen(false) }, [many])
  useEffect(() => { onPause(open) }, [open, onPause])
  useEffect(() => { if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus() }, [open])
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !toggleRef.current?.contains(t)) setOpen(false)
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [open])
  const close = () => { setOpen(false); toggleRef.current?.focus() }
  const restore = (id: string, i: number) => {
    restoreRemoved(id)
    // Stay in the list for the next one, if more than one is left.
    requestAnimationFrame(() => {
      const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
      ;(items[Math.min(i, items.length - 1)] ?? toggleRef.current)?.focus()
    })
  }
  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus()
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      // Marked handled so edit mode stays on.
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }
  return (
    // Pausing the fade on hover and focus (WCAG 2.2.1); the removal itself is read out by the live region.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      data-testid="drag-only-undo"
      onPointerEnter={() => onPause(true)}
      onPointerLeave={() => { if (!open) onPause(false) }}
      onFocus={() => onPause(true)}
      onBlur={() => { if (!open) onPause(false) }}
      className="pointer-events-auto relative flex max-w-full items-center gap-2 rounded-xl border border-border bg-bg-elevated py-1.5 pl-3 pr-1.5 text-[13px] text-text shadow-xl"
    >
      <span className="min-w-0 truncate">{many ? i18nT('nav.layout_removed_count', { count: stack.length }) : i18nT('nav.layout_removed_short', { item: last.label })}</span>
      <span aria-hidden="true" className="text-muted">·</span>
      <span className="flex items-center gap-0.5">
        <Btn onClick={() => undoRemove()} aria-keyshortcuts={IS_MAC ? 'Meta+Z' : 'Control+Z'}>{i18nT('nav.layout_undo')}</Btn>
        {many && (
          <button
            ref={toggleRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? 'drag-only-removed-list' : undefined}
            aria-label={i18nT('nav.layout_removed_list')}
            title={i18nT('nav.layout_removed_list')}
            data-testid="drag-only-undo-list"
            onClick={() => setOpen(o => !o)}
            className="flex h-[26px] w-[22px] items-center justify-center rounded-md border-none bg-transparent p-0 text-muted hover:bg-text/10 hover:text-text aria-expanded:bg-text/10 aria-expanded:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
          >
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        )}
      </span>
      {open && (
        <div
          ref={menuRef}
          id="drag-only-removed-list"
          role="menu"
          tabIndex={-1}
          aria-label={i18nT('nav.layout_removed_list')}
          onKeyDown={onMenuKey}
          data-testid="drag-only-removed-list"
          className="absolute bottom-full right-0 mb-2 flex max-h-[280px] w-[260px] flex-col overflow-y-auto rounded-xl border border-border bg-bg-elevated p-1 text-text shadow-2xl"
        >
          {[...stack].reverse().map((h, i) => (
            <button
              key={h.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-label={i18nT('nav.layout_restore_item', { item: h.label })}
              onClick={() => restore(h.id, i)}
              className="group/restore flex w-full items-center gap-3 rounded-md border-none bg-transparent px-2.5 py-1.5 text-left text-[13px] text-text cursor-pointer hover:bg-bg-hover focus-visible:bg-bg-hover outline-none"
            >
              <span className="min-w-0 flex-1 truncate">{h.label}</span>
              <span className="shrink-0 text-muted group-hover/restore:text-text group-focus-visible/restore:text-text">{i18nT('nav.layout_restore')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
