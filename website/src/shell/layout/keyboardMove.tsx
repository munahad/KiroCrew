/**
 * Keyboard and menu paths for moving shell items while editing the layout
 * (design exploration). Every move a drag can make has one here too, so no
 * move needs a pointer (WCAG 2.1.1 Keyboard, 2.5.7 Dragging Movements).
 *
 * Pick up and move, the pattern of GitHub's project boards and dnd-kit:
 *  - Tab reaches each item in the top bar, the sidebar and the bottom bar.
 *  - Space or Enter picks it up; arrow keys move it one cell (bars) or one
 *    row (sidebar). Past an area's edge it moves into the next area: Down
 *    from the top bar or Up from the bottom bar into the sidebar; Up from the
 *    sidebar's first row into the top bar, Down from its last into the
 *    bottom bar.
 *  - Space or Enter drops it; Escape puts everything back as it was.
 *  - Delete or Backspace removes it (Not shown).
 * Every step is read out (4.1.3), and focus follows the item across areas.
 *
 * The item menu (right-click, Shift+F10 or the Menu key) offers the same
 * moves by name, plus Icon only / Icon and label in a bar, and Remove. In
 * option 1 (on the window) each item also shows step arrows and a "⋯" More
 * button on hover or keyboard focus; the "⋯" opens the same menu.
 *
 * Option 2 (edit panel) edits only in its list: there the window is locked,
 * so none of this applies to items on the window (`useCanvasEditing`).
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, MoreHorizontal } from 'lucide-react'

import { OverlayPortal } from '../../components/overlayRoot'
import { useIsMobile } from '../../hooks/useIsMobile'
import { i18nT } from '../../i18n/t'
import { useEditOption } from '../../lib/editOption'
import { cellOf, placeOnBar, setItemStyle, shiftOnBar, useItemStyle } from '../../lib/barGrid'
import { insertPin, type RailGroup, updateRail } from '../../lib/railLayout'
import {
  LOGO_ITEM, SEARCH_ITEM, announceLayout, canRemove, isWidgetItem, isWindowToggle, moveItem, moveWithinBar, readShellPlacement, removeFromBars,
  setSearchStyle, setSidebarMembership, useLayoutEditing, useSearchStyle, zoneOf, type ShellZone,
} from '../../lib/shellLayout'
import { canShiftInSidebar, columnIdsOf, commitColumn, isHeaderId, placeInSidebar, readSidebarRowCount, readSidebarRows, resolveColumn, shiftInSidebar } from '../../lib/sidebarGrid'
import { zoneLabel } from './barItems'
import { offersStyle } from './barStyleChooser'
import { hideFromCanvas, restoreLayout, snapshotLayout, type LayoutSnapshot } from './dragOnlyEdit'

/* ── The sidebar's groups, as last drawn (the column registers them) ── */

let sidebarGroups: readonly RailGroup[] = []
export function registerSidebarGroups(groups: readonly RailGroup[]): void { sidebarGroups = groups }
export function readSidebarGroups(): readonly RailGroup[] { return sidebarGroups }

/** True while items on the window can be edited: edit mode is on, and the
 *  option shown is not 2 (edit panel), whose window is locked behind its list. */
export function useCanvasEditing(): boolean {
  const editing = useLayoutEditing()
  const option = useEditOption()
  return editing && option !== 'panel'
}

/* ── The held item ── */

interface Held { id: string; label: string; before: LayoutSnapshot }
const HELD_EVENT = 'mc:layout-held-changed'
let held: Held | null = null

function setHeld(h: Held | null): void {
  held = h
  window.dispatchEvent(new Event(HELD_EVENT))
}
export function readHeldItem(): string | null { return held?.id ?? null }
export function useHeldItem(): string | null {
  const [id, setId] = useState(readHeldItem)
  useEffect(() => {
    const sync = () => setId(readHeldItem())
    window.addEventListener(HELD_EVENT, sync)
    return () => window.removeEventListener(HELD_EVENT, sync)
  }, [])
  return id
}

/** Keep keyboard focus on an item after it moved, wherever it is drawn now. */
function refocus(id: string): void {
  const find = () => document.querySelector<HTMLElement>(`[data-layout-item="${CSS.escape(id)}"]`)
  requestAnimationFrame(() => requestAnimationFrame(() => find()?.focus()))
}

/* ── Moves ── */

/** Move `id` into `zone`, at its start, its end, or a given cell or row. */
export function moveInto(id: string, zone: ShellZone, at: 'start' | 'end' | number): void {
  if (zone === 'top' || zone === 'bottom') {
    placeOnBar(zone, id, at === 'start' ? 0 : at === 'end' ? Number.MAX_SAFE_INTEGER : at)
    return
  }
  // The logo is drawn in the sidebar's header, not as a row.
  if (id === LOGO_ITEM) { moveItem(id, 'sidebar'); return }
  if (isWindowToggle(id) || isWidgetItem(id)) moveItem(id, 'sidebar')
  else {
    removeFromBars(id)
    updateRail(l => insertPin(l, id, sidebarGroups[0]?.id ?? l.groups[0]?.id ?? '', null))
    setSidebarMembership(id, true)
  }
  const ids = columnIdsOf(sidebarGroups)
  const all = ids.includes(id) ? ids : [...ids, id]
  if (isWindowToggle(id)) return
  const row = at === 'start' ? 0 : at === 'end' ? readSidebarRowCount() - 1 : at
  commitColumn(sidebarGroups, all, placeInSidebar(all, id, row))
}

/** Where an item is now: its area, and its cell (bars) or row (sidebar). */
export interface ItemSpot { zone: ShellZone; pos: number }
export function spotOf(id: string): ItemSpot | null {
  const onSidebar = columnIdsOf(sidebarGroups).includes(id)
  const zone = zoneOf(id, readShellPlacement(), onSidebar)
  if (!zone) return null
  if (zone === 'top' || zone === 'bottom') return { zone, pos: cellOf(zone, id)?.col ?? 0 }
  const ids = columnIdsOf(sidebarGroups)
  return { zone, pos: ids.includes(id) ? resolveColumn(ids, readSidebarRows(), readSidebarRowCount())[id] ?? 0 : 0 }
}

/** Put one item back where it was, leaving every other change as it is. */
export function putBack(id: string, spot: ItemSpot): void {
  moveInto(id, spot.zone, spot.pos)
}

/** One step in a direction from `zone`; returns the zone it ended in, or null. */
export function stepItem(id: string, zone: ShellZone, key: string): ShellZone | null {
  if (zone === 'top' || zone === 'bottom') {
    if (key === 'ArrowLeft' || key === 'ArrowRight') return shiftOnBar(zone, id, key === 'ArrowLeft' ? -1 : 1) ? zone : null
    if ((zone === 'top' && key === 'ArrowDown') || (zone === 'bottom' && key === 'ArrowUp')) {
      moveInto(id, 'sidebar', zone === 'top' ? 'start' : 'end')
      return 'sidebar'
    }
    return null
  }
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return null
  const delta = key === 'ArrowUp' ? -1 : 1
  // Tool rows (window toggles) move within their own list; other rows in the column.
  if (readShellPlacement().side.includes(id)) {
    if (moveWithinBar(id, delta)) return 'sidebar'
  } else if (canShiftInSidebar(sidebarGroups, id, delta)) {
    shiftInSidebar(sidebarGroups, id, delta)
    return 'sidebar'
  }
  // Past the column's edge: into the bar on that side.
  if (isHeaderId(id)) return null
  const bar = delta < 0 ? 'top' : 'bottom'
  moveInto(id, bar, delta < 0 ? 'end' : 'start')
  return bar
}

export const announceStep = (label: string, from: ShellZone, to: ShellZone, key: string) => {
  if (from !== to) { announceLayout(i18nT('nav.layout_moved', { item: label, place: zoneLabel(to) })); return }
  const k = { ArrowLeft: 'nav.layout_moved_left', ArrowRight: 'nav.layout_moved_right', ArrowUp: 'nav.layout_moved_up', ArrowDown: 'nav.layout_moved_down' }[key]
  if (k) announceLayout(i18nT(k, { item: label }))
}

/* ── The item menu ── */

/** `steps`: list Move up/down (left/right) in the menu. Off when opened from
 *  the ⋯ button, whose arrows sit beside it. */
interface MenuAt { id: string; label: string; zone: ShellZone; x: number; y: number; steps?: boolean }
const MENU_EVENT = 'mc:layout-item-menu'
let menuAt: MenuAt | null = null
function setMenu(m: MenuAt | null): void {
  menuAt = m
  window.dispatchEvent(new Event(MENU_EVENT))
}

/** Open the item menu under (or, in the bottom bar, above) an element. */
function openItemMenu(id: string, label: string, zone: ShellZone, el: HTMLElement): void {
  const r = el.getBoundingClientRect()
  setMenu({ id, label, zone, x: r.left, y: zone === 'bottom' ? r.top : r.bottom, steps: false })
}

/** Whether a placed item can move one step in its area (never past an edge). */
function canStepItem(id: string, zone: ShellZone, d: -1 | 1): boolean {
  if (zone === 'top' || zone === 'bottom') {
    const at = cellOf(zone, id)
    return !!at && (d < 0 ? at.col > 0 : at.col < at.max)
  }
  const side = readShellPlacement().side
  if (side.includes(id)) { const i = side.indexOf(id); return i + d >= 0 && i + d < side.length }
  return canShiftInSidebar(sidebarGroups, id, d)
}

/**
 * An item's own controls in option 1 (on the window, desktop): step arrows
 * (˄˅ in the sidebar, ‹› in a bar) and a "⋯" More button that opens the item
 * menu (Move to, Icon only, Remove). They show on hover or keyboard focus of
 * the item, and are in the Tab order right after it, each with its own name.
 * Render them BESIDE the item element (a sibling inside the same `group/edit`
 * wrapper), never inside it: a button inside the item's button would be read
 * as part of it.
 *
 * Bare icons, no pill (Munahad's minimal controls), in their own space so
 * they never touch the item's icon: just outside a bar cell (below the top
 * bar's, above the bottom bar's); inside a sidebar row on its right; in a
 * collapsed sidebar, the arrows stacked on the row's left edge and "⋯" on its
 * right, either side of the centred icon.
 */
export function ItemMoreButton({ id, zone, label, narrow = false }: { id: string; zone: ShellZone; label: string; narrow?: boolean }) {
  const editing = useLayoutEditing()
  const option = useEditOption()
  const phone = useIsMobile()
  const heldId = useHeldItem()
  if (!editing || option !== 'drag' || phone || isHeaderId(id)) return null
  const inBar = zone === 'top' || zone === 'bottom'
  const keys = inBar ? (['ArrowLeft', 'ArrowRight'] as const) : (['ArrowUp', 'ArrowDown'] as const)
  const icons = inBar ? [ChevronLeft, ChevronRight] : [ChevronUp, ChevronDown]
  const names = inBar ? ['nav.layout_move_left', 'nav.layout_move_right'] : ['nav.layout_move_up', 'nav.layout_move_down']
  const stop = {
    onPointerDown: (e: { stopPropagation: () => void }) => { e.stopPropagation() },
    onMouseDown: (e: { stopPropagation: () => void }) => { e.stopPropagation() },
    onDragStart: (e: { preventDefault: () => void; stopPropagation: () => void }) => { e.preventDefault(); e.stopPropagation() },
  }
  const size = narrow ? 'h-[13px] w-[14px]' : 'h-[18px] w-[18px]'
  const btn = `flex ${size} items-center justify-center rounded-md border-none bg-transparent p-0 text-muted hover:bg-text/10 hover:text-text !cursor-pointer disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`
  // Shown on hover or while focus is on the item or one of these; hidden
  // while the item is held for a keyboard move (the arrow keys move it then).
  const show = heldId === id ? 'opacity-0' : 'opacity-0 group-hover/edit:opacity-100 group-focus-within/edit:opacity-100'
  const fade = `absolute z-20 flex ${show} transition-opacity duration-100 motion-reduce:transition-none [&_*]:!cursor-pointer`
  const arrows = keys.map((k, i) => {
    const d = (i === 0 ? -1 : 1) as -1 | 1
    const Icon = icons[i]
    return (
      <button
        key={k}
        type="button"
        draggable={false}
        disabled={!canStepItem(id, zone, d)}
        aria-label={i18nT(names[i], { item: label })}
        title={i18nT(names[i], { item: label })}
        data-testid={`layout-item-step-${d < 0 ? 'earlier' : 'later'}`}
        {...stop}
        onClick={e => {
          e.preventDefault(); e.stopPropagation()
          const to = stepItem(id, zone, k)
          if (to) announceStep(label, zone, to, k)
          // At the new end the pressed arrow turns off and would drop focus: keep it on the item.
          if (to && !canStepItem(id, to, d)) refocus(id)
        }}
        className={btn}
      >
        <Icon size={narrow ? 11 : 12} aria-hidden="true" />
      </button>
    )
  })
  const more = (
    <button
      type="button"
      draggable={false}
      aria-haspopup="menu"
      aria-label={i18nT('nav.layout_kbd_menu', { item: label })}
      title={i18nT('nav.layout_item_more')}
      data-testid="layout-item-more"
      {...stop}
      onClick={e => { e.preventDefault(); e.stopPropagation(); openItemMenu(id, label, zone, e.currentTarget) }}
      className={btn}
    >
      <MoreHorizontal size={12} aria-hidden="true" />
    </button>
  )
  if (narrow) return (
    <>
      <span className={`${fade} left-0.5 top-1/2 -translate-y-1/2 flex-col`}>{arrows}</span>
      <span className={`${fade} right-0.5 top-1/2 -translate-y-1/2`}>{more}</span>
    </>
  )
  // Bars: just outside the cell, so a one-cell icon keeps its neighbours
  // clear. The sidebar: inside the row on its right, in the hovered row's
  // own colour, so it covers a trailing glyph (the chevron, say) cleanly.
  const place = inBar ? (zone === 'top' ? 'right-0 top-full pt-1' : 'right-0 bottom-full pb-1') : 'right-1 top-1/2 -translate-y-1/2 rounded-md bg-bg-hover pl-1'
  return <span className={`${fade} ${place} items-center gap-0.5`}>{arrows}{more}</span>
}

/**
 * Attributes that make one placed item movable by keyboard and menu. Spread
 * on the element that holds the item in its area (a bar cell, a sidebar row).
 */
export function useLayoutItemProps(id: string, zone: ShellZone, label: string) {
  const editing = useCanvasEditing()
  const heldId = useHeldItem()
  if (!editing) return {}
  const isHeld = heldId === id

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return
    const k = e.key
    if (k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) {
      e.preventDefault()
      const r = e.currentTarget.getBoundingClientRect()
      setMenu({ id, label, zone, x: r.left, y: zone === 'bottom' ? r.top : r.bottom })
      return
    }
    if (k === ' ' || k === 'Enter') {
      e.preventDefault()
      if (isHeld) { setHeld(null); announceLayout(i18nT('nav.layout_kbd_dropped', { item: label })) }
      else if (!isHeaderId(id)) { setHeld({ id, label, before: snapshotLayout() }); announceLayout(i18nT('nav.layout_kbd_picked_up', { item: label })) }
      return
    }
    if (k === 'Escape' && isHeld) {
      e.preventDefault()
      restoreLayout(held!.before)
      setHeld(null)
      announceLayout(i18nT('nav.layout_kbd_cancelled', { item: label }))
      refocus(id)
      return
    }
    if ((k === 'Delete' || k === 'Backspace') && !isHeaderId(id)) {
      e.preventDefault()
      setHeld(null)
      hideFromCanvas(id, label)
      return
    }
    if (isHeld && k.startsWith('Arrow')) {
      e.preventDefault()
      const to = stepItem(id, zone, k)
      if (to) { announceStep(label, zone, to, k); refocus(id) }
    }
  }
  const onContextMenu = (e: MouseEvent<HTMLElement>) => {
    // Takes the press before the sidebar's own right-click menu sees it.
    e.preventDefault()
    e.stopPropagation()
    setMenu({ id, label, zone, x: e.clientX, y: e.clientY })
  }
  return {
    tabIndex: 0,
    role: 'button' as const,
    'aria-label': label,
    'aria-roledescription': i18nT('nav.layout_kbd_item_role'),
    'aria-describedby': 'layout-kbd-item-hint',
    'aria-pressed': isHeld,
    'data-layout-item': id,
    'data-held': isHeld ? '' : undefined,
    onKeyDown,
    onContextMenu,
  }
}

/** Drop a held item whose focus left it (a click elsewhere, Tab away). */
export function useDropHeldOnBlur(): void {
  useEffect(() => {
    const out = (e: FocusEvent) => {
      if (!held) return
      const to = e.relatedTarget as Element | null
      // Moving between areas re-mounts the item; keep holding through that.
      if (!to) return
      if (to.closest(`[data-layout-item="${CSS.escape(held.id)}"]`)) return
      setHeld(null)
    }
    window.addEventListener('focusout', out)
    return () => window.removeEventListener('focusout', out)
  }, [])
}

/** The hint every item points to, and the item menu. Render once while editing. */
export function LayoutItemKeyboard() {
  const editing = useLayoutEditing()
  useDropHeldOnBlur()
  useEffect(() => { if (!editing) { setHeld(null); setMenu(null) } }, [editing])
  if (!editing) return null
  return (
    <>
      <span id="layout-kbd-item-hint" className="sr-only">{i18nT('nav.layout_kbd_item_hint')}</span>
      <LayoutItemMenu />
    </>
  )
}

function LayoutItemMenu() {
  const [m, setM] = useState(menuAt)
  useEffect(() => {
    const sync = () => setM(menuAt)
    window.addEventListener(MENU_EVENT, sync)
    return () => window.removeEventListener(MENU_EVENT, sync)
  }, [])
  const styleOf = useItemStyle()
  const searchStyle = useSearchStyle()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!m) { setPos(null); return }
    const r = ref.current?.getBoundingClientRect()
    const w = r?.width ?? 220
    const h = r?.height ?? 240
    setPos({ left: Math.min(m.x, window.innerWidth - w - 8), top: Math.max(8, Math.min(m.y, window.innerHeight - h - 8)) })
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus())
  }, [m])
  if (!m) return null

  const close = (back = true) => { setMenu(null); if (back) refocus(m.id) }
  const inBar = m.zone === 'top' || m.zone === 'bottom'
  const items: { key: string; label: string; run: () => void; icon?: JSX.Element }[] = []
  const ARROW = { ArrowLeft: <ArrowLeft size={13} aria-hidden="true" />, ArrowRight: <ArrowRight size={13} aria-hidden="true" />, ArrowUp: <ArrowUp size={13} aria-hidden="true" />, ArrowDown: <ArrowDown size={13} aria-hidden="true" /> }
  const dirKey = { ArrowLeft: 'nav.layout_move_left', ArrowRight: 'nav.layout_move_right', ArrowUp: 'nav.layout_move_up', ArrowDown: 'nav.layout_move_down' } as const
  const horizontal = (d: string) => d === 'ArrowLeft' || d === 'ArrowRight'
  const dirs = (Object.keys(dirKey) as (keyof typeof dirKey)[]).filter(d => horizontal(d) === inBar)
  for (const d of m.steps === false ? [] : dirs) {
    const can = inBar
      ? (() => { const at = cellOf(m.zone as 'top' | 'bottom', m.id); return !!at && (d === 'ArrowLeft' ? at.col > 0 : at.col < at.max) })()
      : readShellPlacement().side.includes(m.id) || canShiftInSidebar(sidebarGroups, m.id, d === 'ArrowUp' ? -1 : 1)
    if (!can) continue
    items.push({ key: d, icon: ARROW[d], label: i18nT(dirKey[d], { item: m.label }), run: () => {
      const to = stepItem(m.id, m.zone, d)
      if (to) announceStep(m.label, m.zone, to, d)
    } })
  }
  for (const z of ['top', 'sidebar', 'bottom'] as const) {
    if (z === m.zone || isHeaderId(m.id)) continue
    items.push({ key: `to-${z}`, label: i18nT('nav.layout_kbd_move_to', { place: zoneLabel(z) }), run: () => {
      moveInto(m.id, z, 'end')
      announceLayout(i18nT('nav.layout_moved', { item: m.label, place: zoneLabel(z) }))
    } })
  }
  if (inBar && offersStyle(m.id)) {
    const iconOnly = m.id === SEARCH_ITEM ? searchStyle === 'icon' : styleOf(m.id) === 'icon'
    items.push({ key: 'style', label: i18nT(iconOnly ? (m.id === SEARCH_ITEM ? 'nav.layout_search_field' : 'nav.layout_style_label') : 'nav.layout_search_icon'), run: () => {
      if (m.id === SEARCH_ITEM) {
        setSearchStyle(iconOnly ? 'field' : 'icon')
        announceLayout(i18nT(iconOnly ? 'nav.layout_search_now_field' : 'nav.layout_search_now_icon'))
      } else {
        setItemStyle(m.id, iconOnly ? 'label' : 'icon')
        announceLayout(i18nT(iconOnly ? 'nav.layout_now_label' : 'nav.layout_now_icon', { item: m.label }))
      }
    } })
  }
  if (!isHeaderId(m.id) && canRemove(m.id)) items.push({ key: 'hide', label: i18nT('nav.layout_kbd_remove'), run: () => hideFromCanvas(m.id, m.label) })

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const i = list.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      list[e.key === 'Home' ? 0 : list.length - 1]?.focus()
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }
  return (
    <OverlayPortal>
      {/* A click outside closes the menu. */}
      <div className="fixed inset-0 z-[84]" aria-hidden="true" onPointerDown={() => close(false)} />
      <div
        ref={ref}
        role="menu"
        tabIndex={-1}
        aria-label={i18nT('nav.layout_kbd_menu', { item: m.label })}
        onKeyDown={onKey}
        className="fixed z-[85] min-w-[200px] max-w-[280px] rounded-lg border border-border bg-bg-elevated p-1 text-text shadow-xl"
        style={pos ?? { left: m.x, top: m.y, visibility: 'hidden' }}
        data-testid="layout-item-menu"
      >
        {items.map(x => (
          <button
            key={x.key}
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => { x.run(); close() }}
            className="block w-full rounded-md border-none bg-transparent px-2.5 py-1.5 text-left text-[13px] text-text cursor-pointer hover:bg-bg-hover focus-visible:bg-bg-hover outline-none"
          >
            <span className="inline-flex items-center gap-2">{x.icon}{x.label}</span>
          </button>
        ))}
      </div>
    </OverlayPortal>
  )
}
