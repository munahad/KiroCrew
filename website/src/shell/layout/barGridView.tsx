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

/** The grid's look: neutral tints of the theme's text colour, so it reads as
 *  a drafting grid in any theme rather than in the accent colour. */
export const GRID_LINE = 'color-mix(in srgb, var(--text) 14%, transparent)'
export const GRID_FILL = 'color-mix(in srgb, var(--text) 10%, transparent)'
export const GRID_EDGE = 'color-mix(in srgb, var(--text) 45%, transparent)'

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
  const { drawable } = useBarItemActions(shell)
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
  const showGrid = editing && drag.id !== null
  const hovering = showGrid && drag.over === zone && drag.cell != null
  const cols = hovering
    ? pushAside(zone, ids.includes(drag.id!) ? ids : [...ids, drag.id!], cells, span, n, drag.id!, drag.cell!)
    : resolveBar(zone, ids, cells, span, n)
  const drawn = [...ids].sort((a, b) => cols[a] - cols[b])

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
    <div ref={ref} data-bar-grid={zone} data-layout-zone={zone} className="relative h-full w-full min-w-0">
      {/* The cells, only while something is being dragged: neutral
          graph-paper lines, like a design tool's pixel grid. */}
      {showGrid && (
        <div
          aria-hidden="true"
          data-testid={`bar-grid-cells-${zone}`}
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(to right, ${GRID_LINE} 1px, transparent 1px)`,
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
          style={{ left: cols[drag.id!] * cellW, width: span(drag.id!) * cellW, background: GRID_FILL, boxShadow: `inset 0 0 0 1px ${GRID_EDGE}` }}
        />
      )}
      {drawn.map(id => {
        // The dragged item is shown by the highlight, not drawn twice.
        if (hovering && id === drag.id && !ids.includes(id)) return null
        return (
          // The drag is a pointer convenience: every move also has the edit
          // panel's menu and Move left / Move right (WCAG 2.5.7), so this cell
          // is not a control of its own.
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions
          <div
            key={id}
            data-bar-item={id}
            data-bar-cell={cols[id]}
            draggable={editing}
            onDragStart={editing ? e => startItemDrag(e, id) : undefined}
            className={`absolute inset-y-0 flex items-center justify-center transition-[left] duration-150 motion-reduce:transition-none ${
              hovering && id === drag.id ? 'opacity-40' : ''
            } ${editing ? 'group/edit rounded-md cursor-grab active:cursor-grabbing [&_*]:cursor-grab hover:bg-bg-hover' : ''}`}
            style={{ left: cols[id] * cellW, width: span(id) * cellW }}
          >
            {editing && <GripVertical size={12} aria-hidden="true" className="absolute left-0 top-1/2 -translate-y-1/2 text-muted opacity-0 group-hover/edit:opacity-100" />}
            <Measured onWidth={w => setPx(p => (Math.abs((p[id] ?? 0) - w) < 1 ? p : { ...p, [id]: w }))}>
              {/* The cell drags the item, so the widget's own drag is off, and
                  while editing presses pass through to the cell: a menu
                  trigger would otherwise take the press and block the drag. */}
              <div className={editing ? '[&_*]:pointer-events-none' : 'contents'}>
                <DragOwnedByParent.Provider value>{render(id)}</DragOwnedByParent.Provider>
              </div>
            </Measured>
          </div>
        )
      })}
    </div>
  )
}

