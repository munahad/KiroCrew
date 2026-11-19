/**
 * The desktop sidebar drawn as a column of rows (design exploration; the rules
 * are in lib/sidebarGrid.ts). Every row stays where it was dropped, gaps
 * included, like the bars' cells: "You" can sit at the very bottom with empty
 * rows above it. While an item is dragged in "Edit layout", the rows show as
 * a neutral grid, the row it would land on lights up, and the rows in the way
 * slide up or down to show where they will end up.
 *
 * Drags are native, the same as the bars', so a row can go straight onto a bar
 * (layoutZones.tsx catches that drop) and a bar item can come back to any row.
 */
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'

import { OverlayPortal } from '../../components/overlayRoot'
import { NavToggle } from './appRail'
import { GripVertical } from 'lucide-react'

import { i18nT } from '../../i18n/t'
import { RAIL_PIN_MIME, insertPin, updateRail, type RailGroup } from '../../lib/railLayout'
import {
  announceLayout, isWidgetItem, isWindowToggle, moveItem, readChromeDrag, removeFromBars, setSidebarMembership, useLayoutEditing,
} from '../../lib/shellLayout'
import {
  columnIdsOf, commitColumn, isFootItem, isHeaderId, placeInSidebar, pushAsideInColumn, resolveColumn, setSidebarRowCount, useSidebarRows,
} from '../../lib/sidebarGrid'
import { CHIPLESS, GRID_EDGE, GRID_FILL, GRID_LINE, useGridVarsClass } from '../layout/barGridView'
import { useDragOnlyEditing } from '../layout/dragOnlyEdit'
import { useGridStyle, useTilesPanel } from '../../lib/editOption'
import { ItemMoreButton, moveInto, registerSidebarGroups, useCanvasEditing, useLayoutItemProps } from '../layout/keyboardMove'
import { AreaAddButton } from '../layout/areaAdd'
import { startItemDrag, zoneLabel } from '../layout/barItems'

/** Row pitch before a row has been measured: a nav row plus the gap. */
const DEFAULT_PITCH = 34

/** One row of the column. While editing it is draggable, focusable and
 *  movable by keyboard and its menu (keyboardMove.tsx); its own content is
 *  inert, so Tab stops once per row and Enter picks it up instead of opening it.
 *  The row's own controls (option 1) sit beside the item element, not inside
 *  it, so each is its own Tab stop. `live`: edit mode is on, even where the
 *  rows cannot be edited (option 2's locked window): the content stays inert. */
function ColumnRow({ id, label, editing, live, collapsed, chip, faded, top, height, onDragStart, children }: {
  id: string; label: string; editing: boolean; live: boolean; collapsed: boolean; chip: boolean; faded: boolean; top: number; height: number
  onDragStart: (e: DragEvent) => void; children: ReactNode
}) {
  const kbd = useLayoutItemProps(id, 'sidebar', label)
  return (
    <div
      data-column-row={id}
      className={`absolute inset-x-0 transition-[top] duration-150 motion-reduce:transition-none ${editing ? 'group/edit' : ''}`}
      style={{ top, height }}
    >
      {/* While editing `kbd` makes this a focusable button with its keyboard
          path (Space, arrows, Delete, Shift+F10); lint cannot see the spread role. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        {...kbd}
        draggable={editing}
        onDragStart={editing ? onDragStart : undefined}
        className={`absolute inset-0 flex items-center outline-none ${
          chip ? 'rounded-md border border-border bg-bg' : ''} ${
          faded ? 'opacity-40' : ''
        } ${editing ? 'rounded-lg cursor-grab active:cursor-grabbing [&_*]:cursor-grab hover:bg-bg-hover focus-visible:ring-2 focus-visible:ring-accent data-[held]:ring-2 data-[held]:ring-accent data-[held]:bg-accent-subtle' : ''}`}
      >
        {/* Collapsed, the row's arrows take its left edge, so no grip there. */}
        {editing && !collapsed && <GripVertical size={13} aria-hidden="true" className="absolute left-0 top-1/2 -translate-y-1/2 z-10 text-muted opacity-0 group-hover/edit:opacity-100 pointer-events-none" />}
        {/* While editing, the content moves right of the drag grip, so the grip
            never touches the row's icon (the controls matter in edit mode). */}
        <div data-column-row-content className={`w-full ${editing && !collapsed ? 'pl-3' : ''} ${live ? '[&_*]:pointer-events-none' : ''}`} {...(live ? { inert: '' } : {})}>
          {children}
        </div>
      </div>
      {editing && <ItemMoreButton id={id} zone="sidebar" label={label} narrow={collapsed} />}
    </div>
  )
}

export function SidebarColumn({ groups, renderRow, renderHeader, collapsed, labelOf, groupTitle, renderOverflowRow = renderRow }: {
  groups: readonly RailGroup[]
  /** One page, app, Mate, session or widget row. */
  renderRow: (id: string) => ReactNode
  /** A group's title row. */
  renderHeader: (group: RailGroup) => ReactNode
  collapsed: boolean
  /** Names for announcements. */
  labelOf: (id: string) => string
  /** A group's name for assistive tech (the untitled first group has one too). */
  groupTitle: (group: RailGroup) => string
  /** One row as the More panel lists it (with its label, even when the
   *  sidebar is collapsed). Defaults to `renderRow`. */
  renderOverflowRow?: (id: string) => ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Edit mode is on (`live`), and the rows can be edited (`editing`): not in
  // option 2, whose window is locked behind its list.
  const live = useLayoutEditing()
  const editing = useCanvasEditing()
  const gridVars = useGridVarsClass()
  const dragOnly = useDragOnlyEditing()
  const minimal = useGridStyle() === 'minimal'
  const tilesLine = useTilesPanel()
  const rows = useSidebarRows()
  const ids = columnIdsOf(groups)
  registerSidebarGroups(groups)

  // How many rows fit in the sidebar's scroll frame, and how tall one is.
  const [pitch, setPitch] = useState(DEFAULT_PITCH)
  const [frame, setFrame] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.closest<HTMLElement>('[data-sidebar-scroll]')
    if (!el || !parent) return
    const measure = () => {
      setFrame(parent.clientHeight)
      // Measure the TALLEST row's content, never the drag grip that edit mode
      // adds as each row's first child (13px). The first row is often a short
      // widget (Back/Forward), and spacing every row by it leaves the taller
      // ones (the Crews chip, search, pages) touching.
      const heights = [...el.querySelectorAll<HTMLElement>('[data-column-row] [data-rail-item]')]
        .map(r => r.getBoundingClientRect().height)
      const content = el.querySelector<HTMLElement>('[data-column-row] [data-column-row-content]')
      const h = heights.length ? Math.max(...heights) : content?.getBoundingClientRect().height
      if (h && h > 0) setPitch(Math.round(h) + 2)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [collapsed])
  const n = frame > 0 ? Math.max(1, Math.floor(frame / pitch)) : Math.max(16, ids.length)
  useEffect(() => { setSidebarRowCount(n) }, [n])

  // The drag hovering this column: the row it would land on, and its id
  // (null for a drag from elsewhere, such as a Mate from the Mates page).
  const [hover, setHover] = useState<{ id: string | null; row: number } | null>(null)
  useEffect(() => {
    const clear = () => setHover(null)
    window.addEventListener('dragend', clear)
    window.addEventListener('drop', clear)
    return () => { window.removeEventListener('dragend', clear); window.removeEventListener('drop', clear) }
  }, [])

  const at = hover?.id
    ? pushAsideInColumn(ids.includes(hover.id) ? ids : [...ids, hover.id], rows, n, hover.id, hover.row)
    : resolveColumn(ids, rows, n)
  // Round 1 (Slack's narrow bar): outside edit mode, rows that do not fit the
  // sidebar's height go into a "More" control at the end of the column, which
  // opens a panel beside the sidebar. The foot rows (status, the bell, "You")
  // stay on screen below it. While editing, every row is drawn (the frame
  // scrolls) so each one can still be dragged.
  // The rows that fit below the drop host's 24px bottom padding.
  const fit = Math.max(1, Math.floor((frame - 24) / pitch))
  const overflow = !live && frame > 0 && ids.some(id => (at[id] ?? 0) >= fit)
  const more: string[] = []
  let moreRow = -1
  if (overflow) {
    const order = [...ids].sort((a, b) => at[a] - at[b])
    const foot = order.filter(isFootItem)
    moreRow = Math.max(0, fit - 1 - foot.length)
    for (const id of order) if (!isFootItem(id) && at[id] >= moreRow) more.push(id)
    foot.forEach((id, i) => { at[id] = moreRow + 1 + i })
  }
  const shown = (id: string) => !more.includes(id)
  const last = overflow ? fit - 1 : Math.max(n - 1, ...ids.map(id => at[id] ?? 0))
  const height = (last + 1) * pitch

  const rowAt = (y: number) => {
    const r = ref.current?.getBoundingClientRect()
    return r ? Math.max(0, Math.floor((y - r.top) / pitch)) : 0
  }
  // Option 2's locked window takes no drops; outside edit mode the column
  // still takes a Mate or session dragged from its page.
  const accepts = (e: DragEvent) => (editing || !live) && e.dataTransfer.types.includes(RAIL_PIN_MIME)
  const onDragOver = (e: DragEvent) => {
    if (!accepts(e)) return
    e.preventDefault()
    // The column handles this drop; the sidebar's older drop handlers must not too.
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    const id = readChromeDrag().id ?? draggingHeader.current
    const row = rowAt(e.clientY)
    if (hover?.row !== row || hover?.id !== id) setHover({ id, row })
  }
  const onDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(null)
  }
  const onDrop = (e: DragEvent) => {
    if (!accepts(e)) return
    e.preventDefault()
    e.stopPropagation()
    setHover(null)
    const id = e.dataTransfer.getData(RAIL_PIN_MIME)
    if (!id) return
    // Window toggles have their own tool rows at the sidebar's foot.
    if (isWindowToggle(id)) { moveItem(id, 'sidebar'); return }
    const row = rowAt(e.clientY)
    if (!ids.includes(id) && !isHeaderId(id)) {
      // Coming in from a bar, the panel or another page.
      if (isWidgetItem(id)) moveItem(id, 'sidebar')
      else {
        removeFromBars(id)
        updateRail(l => insertPin(l, id, groups[0]?.id ?? '', null))
        setSidebarMembership(id, true)
      }
    }
    const all = ids.includes(id) ? ids : [...ids, id]
    commitColumn(groups, all, placeInSidebar(all, id, row))
    announceLayout(i18nT('nav.layout_moved', { item: labelOf(id), place: zoneLabel('sidebar') }))
  }

  // A group title drags within the sidebar only, so it is not offered to the bars.
  const draggingHeader = useRef<string | null>(null)
  const startHeaderDrag = (e: DragEvent, id: string) => {
    e.dataTransfer.setData(RAIL_PIN_MIME, id)
    e.dataTransfer.effectAllowed = 'move'
    draggingHeader.current = id
    const clear = () => { draggingHeader.current = null; window.removeEventListener('dragend', clear, true) }
    window.addEventListener('dragend', clear, true)
  }

  // Option 1: the "+" sits in the first free row after the column's last
  // row (the foot rows, such as "You", aside), where an added item goes.
  let addRow = -1
  if (dragOnly && !hover) {
    const taken = new Set(ids.map(id => at[id]))
    addRow = ids.filter(id => !isFootItem(id)).reduce((m, id) => Math.max(m, (at[id] ?? -1) + 1), 0)
    while (taken.has(addRow)) addRow++
  }

  const groupOfHeader = (id: string) => groups.find(g => `rail-group:${g.id}` === id)
  // Rows grouped for assistive tech: each group is a named group, holding its
  // title row and its rows. A group's rows always sit together in the column
  // (membership follows the column), so the groups are listed top to bottom.
  const topOf = (g: RailGroup) => Math.min(...columnIdsOf([g]).map(id => at[id] ?? Number.MAX_SAFE_INTEGER))
  const ordered = [...groups].sort((a, b) => topOf(a) - topOf(b))

  const row = (id: string) => {
    if (hover?.id === id && !ids.includes(id)) return null
    const header = isHeaderId(id) ? groupOfHeader(id) : undefined
    return (
      <ColumnRow
        key={id}
        id={id}
        label={header ? groupTitle(header) : labelOf(id)}
        editing={editing}
        live={live}
        collapsed={collapsed}
        // Option 1: each row an outlined chip, like option 3's drawing.
        chip={dragOnly && !header && !CHIPLESS.has(id)}
        faded={hover?.id === id}
        top={at[id] * pitch}
        height={pitch - 2}
        onDragStart={e => (header ? startHeaderDrag(e, id) : startItemDrag(e, id))}
      >
        {header ? renderHeader(header) : renderRow(id)}
      </ColumnRow>
    )
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- a drop target; every move also has the panel's menu and Move up / Move down (WCAG 2.5.7)
    <div
      ref={ref}
      data-sidebar-column
      className={`relative ${gridVars}`}
      style={{ height }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* The rows, only while something is being dragged: the same neutral
          drafting grid the bars show. */}
      {editing && hover && (
        <div
          aria-hidden="true"
          data-testid="sidebar-grid-rows"
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: minimal ? undefined : `linear-gradient(to bottom, ${GRID_LINE} 1px, transparent 1px)`, backgroundSize: `100% ${pitch}px`, boxShadow: `inset 1px 0 0 ${GRID_LINE}, inset -1px 0 0 ${GRID_LINE}, inset 0 -1px 0 ${GRID_LINE}` }}
        />
      )}
      {editing && hover && (
        <span
          aria-hidden="true"
          data-testid="sidebar-grid-target"
          className="absolute inset-x-0 pointer-events-none transition-[top] duration-100 motion-reduce:transition-none"
          style={{ top: (hover.id ? at[hover.id] : hover.row) * pitch, height: pitch, background: GRID_FILL, boxShadow: tilesLine ? `inset 0 0 0 1px ${GRID_EDGE}, inset 0 2px 0 var(--accent)` : minimal ? `inset 0 2px 0 ${GRID_EDGE}` : `inset 0 0 0 1px ${GRID_EDGE}` }}
        />
      )}
      {ordered.map(g => (
        <div key={g.id} role="group" aria-label={groupTitle(g)} data-rail-group={g.id} className="contents">
          {[...columnIdsOf([g])].filter(shown).sort((a, b) => at[a] - at[b]).map(row)}
        </div>
      ))}
      {addRow >= 0 && (
        <div className={`absolute inset-x-0 flex items-center ${collapsed ? 'justify-center' : 'pl-3'}`} style={{ top: addRow * pitch, height: pitch - 2 }}>
          <AreaAddButton zone="sidebar" onAdd={id => moveInto(id, 'sidebar', addRow)} />
        </div>
      )}
      {more.length > 0 && (
        <SidebarMore ids={more} top={moreRow * pitch} height={pitch - 2} collapsed={collapsed} renderRow={renderOverflowRow} />
      )}
    </div>
  )
}

/**
 * The sidebar's "More" control (round 1) and the panel it opens: a second
 * column beside the sidebar listing the rows that did not fit, as Slack's
 * narrow bar does. A panel, not a dropdown: it is as tall as the sidebar and
 * stays open until a row is opened, Escape, or a press outside. The control
 * is the Apps list's own "N more" toggle (appRail.tsx).
 */
function SidebarMore({ ids, top, height, collapsed, renderRow }: {
  ids: readonly string[]; top: number; height: number; collapsed: boolean; renderRow: (id: string) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<{ left: number; top: number; bottom: number } | null>(null)
  const anchor = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const toggle = () => {
    if (open) { setOpen(false); return }
    // Beside the whole sidebar (its <nav>), else beside the control itself.
    const nav = (anchor.current?.closest('nav') ?? anchor.current)?.getBoundingClientRect()
    if (nav) setBox({ left: nav.right + 8, top: Math.max(8, nav.top), bottom: Math.max(8, window.innerHeight - nav.bottom) })
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('a, button, [tabindex="0"]')?.focus())
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); anchor.current?.querySelector('button')?.focus() } }
    const shut = () => setOpen(false)
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', esc)
    window.addEventListener('resize', shut)
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc); window.removeEventListener('resize', shut) }
  }, [open])
  return (
    <div ref={anchor} data-testid="sidebar-more" className="absolute inset-x-0 flex items-center" style={{ top, height }}>
      <NavToggle collapsed={collapsed} expanded={open} hiddenCount={ids.length} onClick={toggle} />
      {open && box && (
        <OverlayPortal>
          {/* The click handler only closes the panel after a row's own link or
              button ran; Enter on those fires the same click, so keyboard use
              is covered. */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
          <div
            ref={panel}
            role="dialog"
            aria-label={i18nT('nav.sidebar_more_title')}
            data-testid="sidebar-more-panel"
            className="fixed z-[60] w-[240px] flex flex-col rounded-xl border border-border bg-bg-elevated shadow-lg overflow-hidden"
            style={{ left: box.left, top: box.top, bottom: box.bottom }}
            // Opening a row closes the panel (after the row has handled the click).
            onClick={e => { if ((e.target as Element).closest('a, button')) setTimeout(() => setOpen(false)) }}
          >
            <div className="shrink-0 px-3 pt-3 pb-2 text-[13px] font-semibold text-text">{i18nT('nav.sidebar_more_title')}</div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 grid content-start gap-0.5">
              {ids.map(id => <div key={id} data-more-row={id}>{renderRow(id)}</div>)}
            </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  )
}
