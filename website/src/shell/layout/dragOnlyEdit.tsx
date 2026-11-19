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
import { useEffect, useRef } from 'react'

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
  HISTORY_ITEM, NOTIFY_ITEM, PROFILE_ITEM, REMOTE_ITEM, SEARCH_ITEM, STATUS_ITEM, canRemove, announceLayout, moveItem, removeFromBars, resetShellLayout,
  setLayoutEditing, useLayoutAnnouncement, useLayoutEditing,
} from '../../lib/shellLayout'
import { clearBarCells } from '../../lib/barGrid'
import { clearSidebarRows } from '../../lib/sidebarGrid'
import { safeGetItem, safeRemoveItem, safeSetItem } from '../../utils/safeStorage'
import { shellItemMeta } from './shellItems'
import { STATUS_BAR_EDIT_HEIGHT } from '../statusbar/shellStatusBar'
import { readHeldItem, useHeldItem } from './keyboardMove'

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

/** Remove one item from the window (Not shown). `label`: its name as shown.
 *  The area's "+" brings it back. */
export function hideFromCanvas(id: string, label = layoutItemLabel(id)): void {
  // "You" and the fixed items are never removed (round 1, lib/shellLayout.ts).
  if (!canRemove(id)) return
  if (isEntityPin(id)) {
    removeFromBars(id)
    updateRail(l => removePin(l, id))
  } else {
    moveItem(id, null)
  }
  noteRemoved(id)
  announceLayout(i18nT('nav.layout_removed', { item: label }))
}

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
  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !readHeldItem() && !e.defaultPrevented) setLayoutEditing(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [on])

  if (!on) return null
  const reset = () => {
    resetShellLayout(); clearBarCells(); clearSidebarRows()
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
