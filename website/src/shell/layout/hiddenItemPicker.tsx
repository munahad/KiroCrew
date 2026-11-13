/**
 * "Add an item": the items not shown on the canvas, as a searchable list
 * (design exploration, option 2's Gradual reveal). Replaces a long folded
 * "Not shown" section with one button, the way Notion's "Add a property" and
 * Slack's "Add channels" pickers do.
 *
 * Choosing an item puts it in the sidebar (where most items start); it can be
 * moved from there. An item can also be dragged out of the list straight onto
 * a bar or the sidebar.
 *
 * Keyboard: the search field takes focus; Up and Down move through the
 * results, Enter adds the active one, Escape closes and returns focus to the
 * button (WAI-ARIA combobox pattern with a listbox popup).
 */
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Plus, Search } from 'lucide-react'

import { OverlayPortal } from '../../components/overlayRoot'
import { i18nT } from '../../i18n/t'
import { readRecentlyRemoved } from '../../lib/editOption'
import { startItemDrag } from './barItems'

/** How many recently removed items lead the list. */
const RECENT_SHOWN = 5

export interface PickerItem { id: string; label: string; icon: ReactNode; kind: string; detail?: string }

export function HiddenItemPicker({ items, onAdd }: {
  items: readonly PickerItem[]
  onAdd: (id: string, label: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null)
  const listId = useId()

  const q = query.trim().toLowerCase()
  // Without a search, what was removed most recently comes first, under its
  // own heading: it is the likeliest thing to want back.
  const recentIds = useMemo(() => (open ? readRecentlyRemoved() : []), [open])
  const recent = useMemo(
    () => (q ? [] : recentIds.map(id => items.find(x => x.id === id)).filter((x): x is PickerItem => !!x).slice(0, RECENT_SHOWN)),
    [items, q, recentIds],
  )
  const results = useMemo(() => {
    if (q) return items.filter(x => x.label.toLowerCase().includes(q))
    const first = new Set(recent.map(x => x.id))
    return [...recent, ...items.filter(x => !first.has(x.id))]
  }, [items, q, recent])
  useEffect(() => { setActive(0) }, [q])

  // Under the button, or above it when there is no room below.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const r = buttonRef.current?.getBoundingClientRect()
      if (!r) return
      const below = window.innerHeight - r.bottom - 12
      const above = r.top - 12
      const maxHeight = Math.min(360, Math.max(below, above))
      const top = below >= Math.min(240, above) ? r.bottom + 4 : Math.max(8, r.top - 4 - maxHeight)
      setPos({ left: r.left, top, width: Math.max(r.width, 260), maxHeight })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])
  // Focus the search once the list is placed: it is hidden until then, and a
  // hidden field cannot take focus (typing and Escape would go elsewhere).
  const placed = pos !== null
  useEffect(() => { if (open && placed) inputRef.current?.focus() }, [open, placed])
  useEffect(() => { if (!open) setPos(null) }, [open])
  // A press outside closes it.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!popRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false)
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [open])

  const close = () => { setOpen(false); setQuery(''); buttonRef.current?.focus() }
  const add = (x: PickerItem) => { onAdd(x.id, x.label); setQuery('') }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (results.length) setActive(i => (i + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const x = results[active]
      if (x) add(x)
    } else if (e.key === 'Escape') {
      // Closes the list only, not edit mode.
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }
  useEffect(() => {
    popRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-lg border border-dashed border-border bg-transparent px-2 py-2 text-left text-[13px] text-muted hover:bg-bg-hover hover:text-text cursor-pointer aria-expanded:bg-bg-hover aria-expanded:text-text"
        data-testid="hidden-item-picker"
      >
        <Plus size={14} aria-hidden="true" className="shrink-0" />
        <span className="flex-1 min-w-0 truncate">{i18nT('nav.layout_add_item')}</span>
        <span className="shrink-0 text-[12px]">{items.length}</span>
        <ChevronDown size={13} aria-hidden="true" className="shrink-0" />
      </button>
      {open && (
        <OverlayPortal>
          <div
            ref={popRef}
            className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated text-text shadow-2xl"
            style={pos ? { left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight } : { visibility: 'hidden' }}
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
            <div id={listId} role="listbox" aria-label={i18nT('nav.layout_add_item')} className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
              {results.length === 0 && (
                <div className="px-2 py-6 text-center text-[13px] text-muted">{i18nT('nav.rail_palette_no_results', { query: query.trim() })}</div>
              )}
              {results.map((x, i) => (<Fragment key={x.id}>
                {recent.length > 0 && (i === 0 || i === recent.length) && (
                  <div role="presentation" className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                    {i18nT(i === 0 ? 'nav.layout_recently_removed' : 'nav.layout_all_items')}
                  </div>
                )}
                {/* The search field owns the keyboard (combobox): Up, Down and
                    Enter act on the active option, so options take no keys. */}
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus */}
                <div
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  draggable
                  onDragStart={e => { startItemDrag(e, x.id); setOpen(false) }}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => add(x)}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer ${i === active ? 'bg-bg-hover' : ''}`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted">{x.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{x.label}</span>
                    <span className="block truncate text-[11px] text-muted">{x.detail ? `${x.kind} · ${x.detail}` : x.kind}</span>
                  </span>
                  <Plus size={13} aria-hidden="true" className={`shrink-0 text-muted ${i === active ? 'opacity-100' : 'opacity-0'}`} />
                </div>
              </Fragment>))}
            </div>
          </div>
        </OverlayPortal>
      )}
    </>
  )
}
