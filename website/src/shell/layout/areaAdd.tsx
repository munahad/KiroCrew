/**
 * Edit layout, option 1 (on the window): each area's "+" (design exploration).
 *
 * The top bar, the sidebar and the bottom bar each show a small "+" at their
 * end while editing. It opens a searchable list of the items not shown that
 * this area can hold; choosing one puts it at the area's end, where the "+"
 * sits. The list stays open after an add, so several items can be added in a
 * row (the "+" moves along with the area's end).
 *
 * Keyboard: the "+" is in the Tab order; the list's search field takes focus,
 * Up and Down move through the results, Enter adds, Escape closes the list
 * only (not edit mode) and returns focus to the "+" (WAI-ARIA combobox with a
 * listbox popup, as hiddenItemPicker.tsx).
 *
 * shortcut: Mates and sessions are not listed; they are pinned from their own
 * pages (and option 2's list). Add them here if review asks for it.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeftRight, Bell, Fullscreen, Lightbulb, PanelLeft, Plug, Plus, Search, Smartphone, SquareTerminal } from 'lucide-react'

import { OverlayPortal } from '../../components/overlayRoot'
import { i18nT } from '../../i18n/t'
import { readRailLayout } from '../../lib/railLayout'
import {
  FEEDBACK_ITEM, FOCUS_ITEM, HISTORY_ITEM, LOGO_ITEM, NOTIFY_ITEM, PHONE_ITEM, SEARCH_ITEM, STATUS_ITEM, TERMINAL_ITEM,
  announceLayout, placesOf, readShellPlacement, zoneOf, type ShellZone,
} from '../../lib/shellLayout'
import { columnIdsOf } from '../../lib/sidebarGrid'
import { zoneLabel } from './barItems'
import { shellItemMeta } from './shellItems'
import { readSidebarGroups } from './keyboardMove'

/* ── What can be added ── */

interface AppEntry { id: string; label: string; icon: ReactNode }
let shellApps: readonly AppEntry[] = []
let terminalOn = false

/** The installed apps and whether the terminal is on, as the shell last drew
 *  them (the bars register them; this module has no shell of its own). */
export function registerShellApps(apps: readonly AppEntry[], terminal: boolean): void {
  shellApps = apps
  terminalOn = terminal
}

interface AddItem { id: string; label: string; icon: ReactNode; kind: string }

/** Every item not shown on the window that `zone` can hold, by name. */
export function notShownFor(zone: ShellZone): AddItem[] {
  const placement = readShellPlacement()
  const onSidebar = new Set(columnIdsOf(readSidebarGroups()))
  const out: AddItem[] = []
  const seen = new Set<string>()
  const add = (id: string, label: string | undefined, icon: ReactNode, kind: string) => {
    if (!label || seen.has(id)) return
    seen.add(id)
    if (!placesOf(id).includes(zone)) return
    if (zoneOf(id, placement, onSidebar.has(id)) !== null) return
    out.push({ id, label, icon, kind })
  }
  const tools = i18nT('nav.layout_cat_tools')
  add(SEARCH_ITEM, i18nT('nav.layout_locked_search'), <Search size={16} />, tools)
  add(LOGO_ITEM, i18nT('nav.layout_locked_logo'), <PanelLeft size={16} />, tools)
  add(HISTORY_ITEM, i18nT('nav.layout_locked_back_forward'), <ArrowLeftRight size={16} />, tools)
  add(STATUS_ITEM, i18nT('nav.layout_status_item'), <Plug size={16} />, tools)
  add(NOTIFY_ITEM, i18nT('nav.layout_notifications_item'), <Bell size={16} />, tools)
  if (terminalOn) add(TERMINAL_ITEM, i18nT('app.terminal'), <SquareTerminal size={16} />, tools)
  add(PHONE_ITEM, i18nT('app.connect_your_phone'), <Smartphone size={16} />, tools)
  add(FEEDBACK_ITEM, i18nT('nav.send_feedback'), <Lightbulb size={16} />, tools)
  add(FOCUS_ITEM, i18nT('app.focus_mode'), <Fullscreen size={16} />, tools)
  const pages = i18nT('nav.layout_cat_pages')
  for (const id of readRailLayout().hidden) {
    const m = shellItemMeta(id)
    if (m) add(id, m.label, m.icon, pages)
  }
  const apps = i18nT('nav.layout_cat_apps')
  for (const a of shellApps) add(a.id, a.label, a.icon, apps)
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

/* ── The "+" and its list ── */

export function AreaAddButton({ zone, onAdd, className = '', style }: {
  zone: ShellZone
  /** Put `id` at this area's end. */
  onAdd: (id: string) => void
  className?: string
  style?: CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const place = zoneLabel(zone)
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={i18nT('nav.layout_area_add', { place })}
        title={i18nT('nav.layout_area_add', { place })}
        data-testid={`layout-area-add-${zone}`}
        draggable={false}
        onClick={() => setOpen(o => !o)}
        style={style}
        className={`z-20 flex h-[22px] w-[22px] items-center justify-center rounded-md border-none bg-transparent text-muted hover:bg-text/10 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent aria-expanded:bg-text/10 aria-expanded:text-text cursor-pointer ${className}`}
      >
        <Plus size={14} aria-hidden="true" />
      </button>
      {open && <AddList zone={zone} anchor={buttonRef} onAdd={onAdd} onClose={() => { setOpen(false); buttonRef.current?.focus() }} />}
    </>
  )
}

function AddList({ zone, anchor, onAdd, onClose }: {
  zone: ShellZone
  anchor: React.RefObject<HTMLButtonElement | null>
  onAdd: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  // Bumped after each add, so the list drops what was just added.
  const [, setTick] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  const listId = useId()

  // Read fresh on every render: the stores change under it as items are added.
  const items = notShownFor(zone)
  const q = query.trim().toLowerCase()
  const results = q ? items.filter(x => x.label.toLowerCase().includes(q)) : items
  useEffect(() => { setActive(a => Math.min(a, Math.max(0, results.length - 1))) }, [results.length])
  useEffect(() => { setActive(0) }, [q])

  // Under the "+", or above it when there is no room below (the bottom bar).
  useLayoutEffect(() => {
    const r = anchor.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const maxHeight = Math.min(360, Math.max(below, above))
    const top = below >= Math.min(240, above) ? r.bottom + 4 : Math.max(8, r.top - 4 - maxHeight)
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 280)), top, maxHeight })
  }, [anchor])
  const placed = pos !== null
  useEffect(() => { if (placed) inputRef.current?.focus() }, [placed])
  // A press outside closes it.
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!popRef.current?.contains(t) && !anchor.current?.contains(t)) onClose()
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [anchor, onClose])
  // Escape closes the list only, wherever focus is; it is marked handled so
  // edit mode stays on.
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onEsc, true)
    return () => window.removeEventListener('keydown', onEsc, true)
  }, [onClose])
  useEffect(() => {
    popRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  const pick = (x: AddItem) => {
    onAdd(x.id)
    announceLayout(i18nT('nav.layout_added', { item: x.label, place: zoneLabel(zone) }))
    setQuery('')
    setTick(t => t + 1)
    inputRef.current?.focus()
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (results.length) setActive(i => (i + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const x = results[active]
      if (x) pick(x)
    } else if (e.key === 'Tab') {
      onClose()
    }
  }

  return (
    <OverlayPortal>
      <div
        ref={popRef}
        data-testid={`layout-area-add-list-${zone}`}
        className="fixed z-[86] flex w-[260px] flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated text-text shadow-2xl"
        style={pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxHeight } : { visibility: 'hidden' }}
      >
        <label className="m-2 flex items-center gap-2 rounded-lg border border-border bg-bg px-2.5 py-1.5 focus-within:border-accent">
          <Search size={14} aria-hidden="true" className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            aria-label={i18nT('nav.layout_add_item_search')}
            placeholder={i18nT('nav.layout_add_item_search')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKey}
            className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-text outline-none placeholder:text-muted"
          />
        </label>
        <div id={listId} role="listbox" aria-label={i18nT('nav.layout_area_add', { place: zoneLabel(zone) })} className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
          {results.length === 0 && (
            <div className="px-2 py-6 text-center text-[13px] text-muted">
              {q ? i18nT('nav.rail_palette_no_results', { query: query.trim() }) : i18nT('nav.layout_area_add_none')}
            </div>
          )}
          {results.map((x, i) => (
            // The search field owns the keyboard (combobox): Up, Down and
            // Enter act on the active option, so options take no keys.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
            <div
              key={x.id}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(x)}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer ${i === active ? 'bg-bg-hover' : ''}`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted">{x.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{x.label}</span>
                <span className="block truncate text-[11px] text-muted">{x.kind}</span>
              </span>
              <Plus size={13} aria-hidden="true" className={`shrink-0 text-muted ${i === active ? 'opacity-100' : 'opacity-0'}`} />
            </div>
          ))}
        </div>
      </div>
    </OverlayPortal>
  )
}
