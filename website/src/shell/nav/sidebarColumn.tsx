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
import { GripVertical } from 'lucide-react'

import { i18nT } from '../../i18n/t'
import { RAIL_PIN_MIME, insertPin, updateRail, type RailGroup } from '../../lib/railLayout'
import {
  announceLayout, isWidgetItem, isWindowToggle, moveItem, readChromeDrag, removeFromBars, setSidebarMembership, useLayoutEditing,
} from '../../lib/shellLayout'
import {
  columnIdsOf, commitColumn, isHeaderId, placeInSidebar, pushAsideInColumn, resolveColumn, setSidebarRowCount, useSidebarRows,
} from '../../lib/sidebarGrid'
import { CHIPLESS, GRID_EDGE, GRID_FILL, GRID_LINE, useGridVarsClass } from '../layout/barGridView'
import { useDragOnlyEditing } from '../layout/dragOnlyEdit'
import { useGridStyle } from '../../lib/editOption'
import { registerSidebarGroups, useLayoutItemProps } from '../layout/keyboardMove'
import { startItemDrag, zoneLabel } from '../layout/barItems'

/** Row pitch before a row has been measured: a nav row plus the gap. */
const DEFAULT_PITCH = 34

/** One row of the column. While editing it is draggable, focusable and
 *  movable by keyboard and its menu (keyboardMove.tsx); its own content is
 *  inert, so Tab stops once per row and Enter picks it up instead of opening it. */
function ColumnRow({ id, label, editing, chip, faded, top, height, onDragStart, children }: {
  id: string; label: string; editing: boolean; chip: boolean; faded: boolean; top: number; height: number
  onDragStart: (e: DragEvent) => void; children: ReactNode
}) {
  const kbd = useLayoutItemProps(id, 'sidebar', label)
  return (
    // While editing `kbd` makes this a focusable button with its keyboard path
    // (Space, arrows, Delete, Shift+F10); lint cannot see the spread role.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      {...kbd}
      data-column-row={id}
      draggable={editing}
      onDragStart={editing ? onDragStart : undefined}
      className={`absolute inset-x-0 flex items-center outline-none transition-[top] duration-150 motion-reduce:transition-none ${
        chip ? 'rounded-md border border-border bg-bg' : ''} ${
        faded ? 'opacity-40' : ''
      } ${editing ? 'group/edit rounded-lg cursor-grab active:cursor-grabbing [&_*]:cursor-grab hover:bg-bg-hover focus-visible:ring-2 focus-visible:ring-accent data-[held]:ring-2 data-[held]:ring-accent data-[held]:bg-accent-subtle' : ''}`}
      style={{ top, height }}
    >
      {editing && <GripVertical size={13} aria-hidden="true" className="absolute left-0 top-1/2 -translate-y-1/2 z-10 text-muted opacity-0 group-hover/edit:opacity-100 pointer-events-none" />}
      <div data-column-row-content className={`w-full ${editing ? '[&_*]:pointer-events-none' : ''}`} {...(editing ? { inert: '' } : {})}>
        {children}
      </div>
    </div>
  )
}

export function SidebarColumn({ groups, renderRow, renderHeader, collapsed, labelOf, groupTitle }: {
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
}) {
  const ref = useRef<HTMLDivElement>(null)
  const editing = useLayoutEditing()
  const gridVars = useGridVarsClass()
  const dragOnly = useDragOnlyEditing()
  const minimal = useGridStyle() === 'minimal'
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
      const content = el.querySelector<HTMLElement>('[data-column-row] > [data-column-row-content]')
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
  const last = Math.max(n - 1, ...ids.map(id => at[id] ?? 0))
  const height = (last + 1) * pitch

  const rowAt = (y: number) => {
    const r = ref.current?.getBoundingClientRect()
    return r ? Math.max(0, Math.floor((y - r.top) / pitch)) : 0
  }
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(RAIL_PIN_MIME)
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
          style={{ top: (hover.id ? at[hover.id] : hover.row) * pitch, height: pitch, background: GRID_FILL, boxShadow: minimal ? `inset 0 2px 0 ${GRID_EDGE}` : `inset 0 0 0 1px ${GRID_EDGE}` }}
        />
      )}
      {ordered.map(g => (
        <div key={g.id} role="group" aria-label={groupTitle(g)} data-rail-group={g.id} className="contents">
          {[...columnIdsOf([g])].sort((a, b) => at[a] - at[b]).map(row)}
        </div>
      ))}
    </div>
  )
}
