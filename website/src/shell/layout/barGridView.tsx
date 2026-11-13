/**
 * A bar drawn as a row of cells (design exploration; the rules are in
 * lib/barGrid.ts). Each item sits at its start cell and takes as many cells
 * as it is wide, so it stays where it was dropped, gaps included.
 *
 * While an item is dragged in "Edit layout", the cells show as a faint grid,
 * the ones the item would take light up under the pointer, and the items
 * there slide aside to show where they will end up. The drop itself is caught
 * by the bar's outline (layoutZones.tsx) or the sidebar's drag (railGroups).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { GripVertical } from 'lucide-react'

import { NavHistoryArrows } from '../../components/NavHistoryArrows'
import { i18nT } from '../../i18n/t'
import { CELL, pushAside, resolveBar, setBarColumns, setItemSpan, spanOf, useBarCells } from '../../lib/barGrid'
import {
  HISTORY_ITEM, PROFILE_ITEM, REMOTE_ITEM, SEARCH_ITEM, STATUS_ITEM, useChromeDrag, useLayoutEditing, useShellPlacement, useWidgetsIn,
  type BarZone,
} from '../../lib/shellLayout'
import { ShellProfileMenu } from '../nav/railSettingsFlyout'
import type { AppShell } from '../appShell'
import { BarItemButton, startItemDrag, useBarItemActions } from './barItems'
import { RemoteCrewSwitcher } from './remoteCrews'
import { SearchTrigger } from './searchTrigger'
import { SidebarStatus } from './sidebarStatus'
import { DragOwnedByParent } from './dragOwner'
import { useGridStyle } from '../../lib/editOption'
import { BarStyleChooser, offersStyle } from './barStyleChooser'
import { useLayoutItemProps } from './keyboardMove'

/** The grid's look, by the prototype's grid switch (lib/editOption.ts).
 *  Drafting: neutral tints of the theme's text colour, a graph-paper grid in
 *  any theme. Minimal: thin lines in the accent colour, and the cells an item
 *  would take outlined rather than filled. The tints are CSS variables that
 *  `GridVars` sets (Tailwind classes), so both grids read the same three. */
export const GRID_LINE = 'var(--grid-line)'
export const GRID_FILL = 'var(--grid-fill)'
export const GRID_EDGE = 'var(--grid-edge)'

/** Classes that define the grid tints for the current grid style. */
export function useGridVarsClass(): string {
  return useGridStyle() === 'minimal'
    ? '[--grid-line:color-mix(in_srgb,var(--accent)_28%,transparent)] [--grid-fill:color-mix(in_srgb,var(--accent)_14%,transparent)] [--grid-edge:var(--accent)]'
    : '[--grid-line:color-mix(in_srgb,var(--text)_14%,transparent)] [--grid-fill:color-mix(in_srgb,var(--text)_10%,transparent)] [--grid-edge:color-mix(in_srgb,var(--text)_45%,transparent)]'
}

/** The bar's width, kept current. */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setW(el.getBoundingClientRect().width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

/** Reports an element's natural width whenever it changes. */
function Measured({ onWidth, children }: { onWidth: (w: number) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const cb = useRef(onWidth)
  cb.current = onWidth
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    cb.current(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => cb.current(el.getBoundingClientRect().width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return <div ref={ref} className="w-max flex items-center">{children}</div>
}

/** One item's cell. While editing it is draggable, focusable and movable by
 *  keyboard and its menu (keyboardMove.tsx); a click opens its style switch. */
function BarCell({ id, zone, label, cellRef, editing, faded, left, width, cell, onPointerEnter, onPointerLeave, onPick, children }: {
  id: string; zone: BarZone; label: string; cellRef: (el: HTMLDivElement | null) => void
  editing: boolean; faded: boolean; left: number; width: number; cell: number
  onPointerEnter: () => void; onPointerLeave: () => void; onPick: () => void; children: ReactNode
}) {
  const kbd = useLayoutItemProps(id, zone, label)
  return (
    // While editing `kbd` makes this a focusable button with its keyboard path
    // (Space, arrows, Delete, Shift+F10); lint cannot see the spread role.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      ref={cellRef}
      {...kbd}
      onPointerEnter={editing ? onPointerEnter : undefined}
      onPointerLeave={editing ? onPointerLeave : undefined}
      onClick={editing && offersStyle(id) ? onPick : undefined}
      data-bar-item={id}
      data-bar-cell={cell}
      draggable={editing}
      onDragStart={editing ? e => startItemDrag(e, id) : undefined}
      className={`absolute inset-y-0 flex items-center justify-center outline-none transition-[left] duration-150 motion-reduce:transition-none ${
        faded ? 'opacity-40' : ''
      } ${editing ? 'group/edit rounded-md cursor-grab active:cursor-grabbing [&_*]:cursor-grab hover:bg-bg-hover focus-visible:ring-2 focus-visible:ring-accent data-[held]:ring-2 data-[held]:ring-accent data-[held]:bg-accent-subtle' : ''}`}
      style={{ left, width }}
    >
      {editing && <GripVertical size={12} aria-hidden="true" className="absolute left-0 top-1/2 -translate-y-1/2 text-muted opacity-0 group-hover/edit:opacity-100" />}
      {children}
    </div>
  )
}

export function BarGrid({ zone, shell, renderStatus }: {
  zone: BarZone
  shell: AppShell
  /** The top bar draws status as its readout capsule and bell; the bottom bar
   *  uses the sidebar's compact status row. */
  renderStatus?: () => ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref)
  // No layout yet (first paint, tests): assume a laptop-wide bar.
  const n = width > 0 ? Math.max(1, Math.floor(width / CELL)) : 30
  const cellW = width > 0 ? width / n : CELL
  useEffect(() => { setBarColumns(zone, n) }, [zone, n])

  const placement = useShellPlacement()
  const widgets: string[] = useWidgetsIn(zone)
  const { drawable, meta } = useBarItemActions(shell)
  const ids = useMemo(
    () => [...widgets, ...placement[zone].filter(id => drawable(id))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [widgets.join(), placement, zone, shell.terminalEnabled, shell.hasRenderableMobileConnect, shell.allAppGroup],
  )
  const cells = useBarCells(zone)
  const [px, setPx] = useState<Record<string, number>>({})
  const span = (id: string) => (px[id] ? Math.max(1, Math.ceil((px[id] + 2) / cellW)) : spanOf(zone, id))
  useEffect(() => { for (const id of ids) if (px[id]) setItemSpan(zone, id, Math.max(1, Math.ceil((px[id] + 2) / cellW))) })

  const editing = useLayoutEditing()
  const drag = useChromeDrag()
  const gridVars = useGridVarsClass()
  // Drafting shows every bar's cells for the whole drag. Minimal shows a
  // bar's cells only while the dragged item is over that bar.
  const gridStyle = useGridStyle()
  const showGrid = editing && drag.id !== null && (gridStyle !== 'minimal' || drag.over === zone)
  const hovering = showGrid && drag.over === zone && drag.cell != null
  const cols = hovering
    ? pushAside(zone, ids.includes(drag.id!) ? ids : [...ids, drag.id!], cells, span, n, drag.id!, drag.cell!)
    : resolveBar(zone, ids, cells, span, n)
  const drawn = [...ids].sort((a, b) => cols[a] - cols[b])

  // "Icon only" or "Icon and label" (barStyleChooser.tsx): offered under an
  // item right after it lands in this bar, and while the pointer rests on it.
  const cellEls = useRef<Record<string, HTMLDivElement | null>>({})
  const [fresh, setFresh] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const leaveTimer = useRef(0)
  const prevIds = useRef<string[] | null>(null)
  useEffect(() => {
    const before = prevIds.current
    prevIds.current = ids
    if (!editing || !before) return
    const arrived = ids.find(id => !before.includes(id) && offersStyle(id))
    if (arrived) setFresh(arrived)
  }, [ids, editing])
  // Gone when edit mode ends, a new drag starts, or a press lands elsewhere.
  useEffect(() => { if (!editing || drag.id !== null) { setFresh(null); setHovered(null) } }, [editing, drag.id])
  useEffect(() => {
    if (!fresh) return
    const away = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (!t?.closest('[data-testid="bar-style-chooser"]') && !cellEls.current[fresh]?.contains(t)) setFresh(null)
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [fresh])
  const hoverOn = (id: string) => { window.clearTimeout(leaveTimer.current); if (offersStyle(id)) setHovered(id) }
  const hoverOff = () => { window.clearTimeout(leaveTimer.current); leaveTimer.current = window.setTimeout(() => setHovered(null), 250) }
  const chooserFor = editing && drag.id === null ? (hovered ?? fresh) : null
  const chooserAnchor = chooserFor && ids.includes(chooserFor) ? cellEls.current[chooserFor] : null

  const render = (id: string): ReactNode => {
    switch (id) {
      case SEARCH_ITEM:
        return <SearchTrigger variant="top" onOpen={shell.commandPalette.openPalette} launcherOwned={!!shell.slotOwners['quick-search']} />
      case STATUS_ITEM:
        return renderStatus ? renderStatus() : <SidebarStatus shell={shell} collapsed={false} />
      case REMOTE_ITEM:
        return <RemoteCrewSwitcher />
      case HISTORY_ITEM:
        return <NavHistoryArrows />
      case PROFILE_ITEM:
        return <ShellProfileMenu shell={shell} compact={zone} />
      default:
        return <BarItemButton id={id} zone={zone} shell={shell} />
    }
  }

  return (
    <div ref={ref} data-bar-grid={zone} data-layout-zone={zone} className={`relative h-full w-full min-w-0 ${gridVars}`}>
      {/* The cells, only while something is being dragged: neutral
          graph-paper lines, like a design tool's pixel grid. */}
      {showGrid && (
        <div
          aria-hidden="true"
          data-testid={`bar-grid-cells-${zone}`}
          className="absolute inset-0 pointer-events-none"
          style={{
            // Minimal: blank inside; only the drop line and the space the item takes show.
            backgroundImage: gridStyle === 'minimal' ? undefined : `linear-gradient(to right, ${GRID_LINE} 1px, transparent 1px)`,
            backgroundSize: `${cellW}px 100%`,
            boxShadow: `inset 0 1px 0 ${GRID_LINE}, inset 0 -1px 0 ${GRID_LINE}, inset -1px 0 0 ${GRID_LINE}`,
          }}
        />
      )}
      {/* The cells the dragged item would take: a darker neutral fill. */}
      {hovering && (
        <span
          aria-hidden="true"
          data-testid={`bar-grid-target-${zone}`}
          className="absolute inset-y-0 pointer-events-none transition-[left,width] duration-100 motion-reduce:transition-none"
          style={{ left: cols[drag.id!] * cellW, width: span(drag.id!) * cellW, background: GRID_FILL, boxShadow: gridStyle === 'minimal' ? `inset 2px 0 0 ${GRID_EDGE}` : `inset 0 0 0 1px ${GRID_EDGE}` }}
        />
      )}
      {drawn.map(id => {
        // The dragged item is shown by the highlight, not drawn twice.
        if (hovering && id === drag.id && !ids.includes(id)) return null
        return (
          <BarCell
            key={id}
            id={id}
            zone={zone}
            label={id === SEARCH_ITEM ? i18nT('nav.layout_locked_search') : meta(id)?.label ?? id}
            cellRef={el => { cellEls.current[id] = el }}
            editing={editing}
            faded={hovering && id === drag.id}
            left={cols[id] * cellW}
            width={span(id) * cellW}
            cell={cols[id]}
            onPointerEnter={() => hoverOn(id)}
            onPointerLeave={hoverOff}
            onPick={() => setFresh(id)}
          >
            <Measured onWidth={w => setPx(p => (Math.abs((p[id] ?? 0) - w) < 1 ? p : { ...p, [id]: w }))}>
              {/* The cell drags the item, so the widget's own drag is off, and
                  while editing presses pass through to the cell: a menu
                  trigger would otherwise take the press and block the drag. */}
              <div className={editing ? '[&_*]:pointer-events-none' : 'contents'} {...(editing ? { inert: '' } : {})}>
                <DragOwnedByParent.Provider value>{render(id)}</DragOwnedByParent.Provider>
              </div>
            </Measured>
          </BarCell>
        )
      })}
      {chooserFor && chooserAnchor && (
        <BarStyleChooser
          id={chooserFor}
          label={chooserFor === SEARCH_ITEM ? i18nT('nav.layout_locked_search') : meta(chooserFor)?.label ?? chooserFor}
          zone={zone}
          anchor={chooserAnchor}
          onPointerEnter={() => hoverOn(chooserFor)}
          onPointerLeave={hoverOff}
        />
      )}
    </div>
  )
}

