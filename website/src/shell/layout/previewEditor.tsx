/**
 * Edit layout, option 3: a separate editor on a drawing of the window
 * (design exploration). Built on Molly's sketch: a list of items on the left,
 * a small drawing of the window on the right with its areas as dashed drop
 * zones, Close, Cancel and Done. Built on further with the macOS Customize
 * Toolbar and Sketch toolbar editor patterns and the rest of this prototype:
 *  - Built in and Yours tabs (option 2's split), with search.
 *  - The list mirrors the drawing: grouped by area (Top bar, Sidebar, Bottom
 *    bar, Not shown) in the drawing's order, so a moved chip's row moves too.
 *    Each placed row has Move up / Move down and Hide; a Not shown row, Show.
 *    Hovering a row or a chip highlights both.
 *  - Chips in the drawing carry real icons. A chip's "⋯" menu (also on click)
 *    moves it, switches Icon only / Icon and label in a bar, and removes it.
 *    No grid: a drop line alone shows where an item will land. Dropping on
 *    the page does not hide (removing is a menu choice).
 *  - Changes apply on Done; Cancel puts back the layout as it was when the
 *    editor opened; leaving with changes asks "Keep your changes?".
 *
 * The real window sits behind an opaque backdrop, so editing the stored
 * layout in place shows nowhere but the drawing until Done; Cancel restores
 * the snapshot taken on open.
 *
 * Accessibility: a modal dialog (focus kept inside, Escape to leave); every
 * row and chip is a button; a selected chip moves with the arrow keys and
 * hides with Delete; every change is read out (WCAG 2.1.1, 2.5.7, 4.1.3).
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, EyeOff, MoreHorizontal, Plus, Search, X } from 'lucide-react'

import { Btn } from '../../components/ui'
import { OverlayPortal } from '../../components/overlayRoot'
import { i18nT } from '../../i18n/t'
import { barOrder, cellOf, setItemStyle, useItemStyle } from '../../lib/barGrid'
import type { RailGroup } from '../../lib/railLayout'
import {
  SEARCH_ITEM, SHELL_ITEM_MIME, announceLayout, readShellPlacement, setLayoutEditing, setSearchStyle, useSearchStyle,
  type ShellZone,
} from '../../lib/shellLayout'
import { columnIdsOf, columnOrder, isHeaderId } from '../../lib/sidebarGrid'
import { zoneLabel, startItemDrag } from './barItems'
import { offersStyle } from './barStyleChooser'
import { restoreLayout, snapshotLayout } from './dragOnlyEdit'
import { announceStep, moveInto, spotOf, stepItem } from './keyboardMove'
import type { Candidate } from './layoutEditPanel'

type Place = ShellZone | 'none'

/** The list's order runs top to bottom; in a bar "earlier" is to the left. */
const earlierKey = (zone: ShellZone) => (zone === 'sidebar' ? 'ArrowUp' : 'ArrowLeft')
const laterKey = (zone: ShellZone) => (zone === 'sidebar' ? 'ArrowDown' : 'ArrowRight')
const ZONES: readonly ShellZone[] = ['top', 'sidebar', 'bottom']
type Tab = 'builtin' | 'yours'
type Category = Candidate['category']

export function PreviewEditor({ candidates, columnOf, categoryLabel, repeated, groups, where, place, reset, announcement }: {
  candidates: readonly Candidate[]
  columnOf: (x: Candidate) => Tab
  categoryLabel: (c: Category) => string
  repeated: ReadonlySet<string>
  groups: readonly RailGroup[]
  where: (id: string) => Place
  place: (id: string, to: Place, label: string) => void
  reset: () => void
  announcement: string
}) {
  const [tab, setTab] = useState<Tab>('builtin')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  // The item under the pointer, in the list or the drawing: both light up.
  const [hot, setHot] = useState<string | null>(null)
  // A chip's "⋯" menu, placed under the chip.
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const styleOf = useItemStyle()
  const searchStyle = useSearchStyle()

  // The layout as it was on open: Cancel and Discard put it back.
  const initial = useRef(snapshotLayout())
  const dirty = () => JSON.stringify(snapshotLayout()) !== JSON.stringify(initial.current)
  const done = () => setLayoutEditing(false)
  const cancel = () => { restoreLayout(initial.current); setLayoutEditing(false) }
  const leave = () => { if (dirty()) setConfirming(true); else done() }

  // Widget places change through their own event; redraw on it.
  const [, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick(t => t + 1)
    window.addEventListener('mc:two-place-changed', bump)
    window.addEventListener('mc:search-style-changed', bump)
    return () => {
      window.removeEventListener('mc:two-place-changed', bump)
      window.removeEventListener('mc:search-style-changed', bump)
    }
  }, [])

  const byId = useMemo(() => new Map(candidates.map(x => [x.id, x])), [candidates])
  const labelOf = (id: string) => byId.get(id)?.meta.label ?? id

  // What each area holds, in the order it draws it.
  const inZone = (zone: ShellZone): string[] => {
    if (zone === 'top' || zone === 'bottom') return barOrder(zone).filter(id => byId.has(id) && where(id) === zone)
    const rows = columnOrder(columnIdsOf(groups)).filter(id => !isHeaderId(id) && byId.has(id) && where(id) === 'sidebar')
    return [...rows, ...readShellPlacement().side.filter(id => byId.has(id) && !rows.includes(id))]
  }

  /* ── Moves ── */

  const dropAt = (id: string, zone: ShellZone, index: number) => {
    const order = inZone(zone).filter(x => x !== id)
    const before = order[index]
    if (zone === 'top' || zone === 'bottom') moveInto(id, zone, before ? (cellOf(zone, before)?.col ?? 'end') : 'end')
    else moveInto(id, 'sidebar', before ? (spotOf(before)?.pos ?? 'end') : 'end')
    announceLayout(i18nT('nav.layout_moved', { item: labelOf(id), place: zoneLabel(zone) }))
    setSelected(id)
  }
  const hide = (id: string) => {
    place(id, 'none', labelOf(id))
    if (selected === id) setSelected(null)
    if (menu?.id === id) setMenu(null)
  }
  const toggle = (id: string) => (where(id) === 'none' ? place(id, 'sidebar', labelOf(id)) : hide(id))
  const canStep = (id: string, earlier: boolean) => {
    const z = where(id)
    if (z === 'none') return false
    const order = inZone(z)
    const i = order.indexOf(id)
    return i >= 0 && (earlier ? i > 0 : i < order.length - 1)
  }
  const openMenu = (id: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setSelected(id)
    setMenu({ id, x: r.left, y: r.bottom + 4 })
  }
  const step = (id: string, key: string) => {
    const from = where(id)
    if (from === 'none') return
    const to = stepItem(id, from, key)
    if (to) {
      announceStep(labelOf(id), from, to, key)
      requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>(`[data-preview-chip="${CSS.escape(id)}"]`)?.focus())
    }
  }
  const setIconOnly = (id: string, icon: boolean) => {
    if (id === SEARCH_ITEM) {
      setSearchStyle(icon ? 'icon' : 'field')
      announceLayout(i18nT(icon ? 'nav.layout_search_now_icon' : 'nav.layout_search_now_field'))
    } else {
      setItemStyle(id, icon ? 'icon' : 'label')
      announceLayout(i18nT(icon ? 'nav.layout_now_icon' : 'nav.layout_now_label', { item: labelOf(id) }))
    }
  }
  const iconOnly = (id: string) => (id === SEARCH_ITEM ? searchStyle === 'icon' : styleOf(id) === 'icon')

  /* ── Dialog keyboard: Escape leaves (asking first), Tab stays inside ── */

  useEffect(() => { dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus() }, [])
  const onDialogKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (confirming) setConfirming(false)
      else if (menu) { const id = menu.id; setMenu(null); dialogRef.current?.querySelector<HTMLElement>(`[data-preview-chip="${CSS.escape(id)}"]`)?.focus() }
      else if (selected) setSelected(null)
      else leave()
      return
    }
    if (e.key !== 'Tab') return
    const f = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]') ?? [])]
      .filter(el => el.offsetParent !== null)
    if (f.length === 0) return
    const first = f[0], last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  /* ── The list ── */

  const q = query.trim().toLowerCase()
  const rows = candidates.filter(x => columnOf(x) === tab && (!q || x.meta.label.toLowerCase().includes(q)))
  const counts = { builtin: candidates.filter(x => columnOf(x) === 'builtin').length, yours: candidates.filter(x => columnOf(x) === 'yours').length }
  const placeName = (p: Place) => (p === 'none' ? i18nT('nav.layout_zone_none') : zoneLabel(p))

  /* ── The drawing: drop targets ── */

  const [over, setOver] = useState<{ zone: ShellZone; index: number } | null>(null)
  const indexAt = (e: DragEvent, zone: ShellZone) => {
    const chips = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-preview-chip]')]
    const vertical = zone === 'sidebar'
    const i = chips.findIndex(c => {
      const r = c.getBoundingClientRect()
      return vertical ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2
    })
    return i < 0 ? chips.length : i
  }
  const zoneDrop = (zone: ShellZone) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(SHELL_ITEM_MIME)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      const index = indexAt(e, zone)
      if (over?.zone !== zone || over.index !== index) setOver({ zone, index })
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const id = e.dataTransfer.getData(SHELL_ITEM_MIME)
      const index = indexAt(e, zone)
      setOver(null)
      if (id) dropAt(id, zone, index)
    },
  })
  useEffect(() => {
    const clear = () => setOver(null)
    window.addEventListener('dragend', clear)
    return () => window.removeEventListener('dragend', clear)
  }, [])

  const chip = (id: string, zone: ShellZone) => {
    const x = byId.get(id)
    if (!x) return null
    const compact = zone !== 'sidebar' && iconOnly(id)
    const on = selected === id || menu?.id === id
    const lit = hot === id
    return (
      <span
        key={id}
        className={`group/chip relative flex min-w-0 shrink-0 ${zone === 'sidebar' ? 'w-full' : 'max-w-[132px]'}`}
        onPointerEnter={() => setHot(id)}
        onPointerLeave={() => setHot(h => (h === id ? null : h))}
      >
        <button
          type="button"
          data-preview-chip={id}
          draggable
          onDragStart={e => { setMenu(null); startItemDrag(e, id) }}
          onClick={e => (menu?.id === id ? setMenu(null) : openMenu(id, e.currentTarget))}
          onKeyDown={e => {
            if (e.key.startsWith('Arrow')) { e.preventDefault(); step(id, e.key) }
            else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); hide(id) }
          }}
          aria-haspopup="menu"
          aria-expanded={menu?.id === id}
          aria-label={x.meta.label}
          aria-describedby="preview-chip-hint"
          title={x.meta.label}
          className={`flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md border px-1.5 pr-5 text-[11px] cursor-grab active:cursor-grabbing ${
            on ? 'border-accent bg-accent-subtle text-text-strong' : lit ? 'border-accent/60 bg-bg-hover text-text' : 'border-border bg-bg text-text hover:bg-bg-hover'}`}
        >
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center [&_svg]:h-3.5 [&_svg]:w-3.5">{x.meta.icon}</span>
          {!compact && <span className="min-w-0 truncate">{x.meta.label}</span>}
        </button>
        {/* The "⋯" More button: the same menu as a click on the chip. Left out
            of the Tab order and the accessibility tree (the chip opens it). */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          draggable={false}
          title={i18nT('nav.layout_item_more')}
          data-testid="preview-chip-more"
          onClick={e => { e.stopPropagation(); if (menu?.id === id) setMenu(null); else openMenu(id, e.currentTarget.previousElementSibling as HTMLElement) }}
          className={`absolute right-0.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded border-none bg-transparent text-muted hover:text-text cursor-pointer ${
            on || lit ? 'opacity-100' : 'opacity-0 group-hover/chip:opacity-100 group-focus-within/chip:opacity-100'}`}
        >
          <MoreHorizontal size={12} aria-hidden="true" />
        </button>
      </span>
    )
  }
  const line = (vertical: boolean) => (
    <span aria-hidden="true" className={`shrink-0 rounded-full bg-accent ${vertical ? 'h-0.5 w-full' : 'h-5 w-0.5'}`} />
  )
  const zoneBody = (zone: ShellZone) => {
    const ids = inZone(zone)
    const vertical = zone === 'sidebar'
    const at = over?.zone === zone ? over.index : -1
    const out: ReactNode[] = []
    ids.forEach((id, i) => { if (i === at) out.push(<span key={`line-${i}`} className="contents">{line(vertical)}</span>); out.push(chip(id, zone)) })
    if (at >= ids.length) out.push(<span key="line-end" className="contents">{line(vertical)}</span>)
    return (
      <div
        role="group"
        aria-label={zoneLabel(zone)}
        data-preview-zone={zone}
        {...zoneDrop(zone)}
        className={`relative flex min-w-0 gap-1 rounded-lg border-2 border-dashed p-1.5 transition-colors ${
          vertical ? 'h-full flex-col' : 'h-full items-center'
        } ${over?.zone === zone ? 'border-accent bg-accent-subtle/40' : 'border-text/30'}`}
      >
        {out}
        {ids.length === 0 && at < 0 && (
          <span className={`pointer-events-none text-[11px] text-muted ${vertical ? 'm-auto' : 'mx-auto'}`}>{i18nT('nav.layout_preview_empty_area')}</span>
        )}
        {zone !== 'sidebar' && ids.length > 0 && (
          <button
            type="button"
            onClick={() => { for (const id of ids) place(id, 'none', labelOf(id)) }}
            className="ml-auto shrink-0 rounded border-none bg-transparent px-1 text-[11px] text-muted hover:text-text hover:underline cursor-pointer"
          >
            {i18nT('nav.layout_preview_clear_area')}
          </button>
        )}
      </div>
    )
  }

  // The drawing keeps the window's own proportions.
  const ratio = typeof window !== 'undefined' ? Math.min(1.9, Math.max(1.2, window.innerWidth / window.innerHeight)) : 1.6
  const menuItem = menu ? byId.get(menu.id) : undefined
  const menuAt = menu ? where(menu.id) : 'none'

  return (
    <OverlayPortal>
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
      <span id="preview-chip-hint" className="sr-only">{i18nT('nav.layout_preview_chip_hint')}</span>
      {/* An opaque backdrop: the real window waits behind it until Done. A
          press on it leaves, asking first when something changed. */}
      <div className="fixed inset-0 z-[85] bg-bg/95 backdrop-blur-[1px]" aria-hidden="true" onPointerDown={leave} />
      <div className="pointer-events-none fixed inset-0 z-[86] flex items-center justify-center p-[clamp(12px,4vw,48px)]">
        {/* The dialog owns Escape and keeps Tab inside it (modal). */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-title"
          aria-describedby="preview-hint"
          onKeyDown={onDialogKey}
          // A fixed size: switching tabs or searching never resizes it; the
          // list scrolls inside.
          className="pointer-events-auto relative flex h-[min(680px,100%)] w-[min(1080px,100%)] flex-col overflow-hidden rounded-2xl border border-border bg-bg-elevated text-text shadow-2xl"
          data-testid="layout-preview-editor"
        >
          <header className="flex items-start gap-3 border-b border-border px-5 pt-4 pb-3">
            <div className="min-w-0 flex-1">
              <h2 id="preview-title" className="m-0 text-[16px] font-semibold text-text">{i18nT('nav.rail_customize_title')}</h2>
              <p id="preview-hint" className="m-0 mt-0.5 truncate text-[12px] text-muted" title={i18nT('nav.layout_preview_hint')}>{i18nT('nav.layout_preview_hint')}</p>
            </div>
            <button
              type="button"
              onClick={leave}
              aria-label={i18nT('nav.layout_preview_close')}
              title={i18nT('nav.layout_preview_close')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-none bg-transparent text-muted hover:bg-bg-hover hover:text-text cursor-pointer"
            >
              <X size={16} />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 gap-5 overflow-hidden px-5 py-4">
            {/* The list: Built in and Yours, searchable. */}
            <section className="flex min-h-0 w-[300px] min-w-[240px] shrink-0 flex-col" aria-label={i18nT('nav.layout_preview_items')}>
              <div role="tablist" aria-label={i18nT('nav.layout_preview_items')} className="mb-2 flex gap-4 border-b border-border">
                {(['builtin', 'yours'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    tabIndex={tab === t ? 0 : -1}
                    onClick={() => setTab(t)}
                    onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setTab(tab === 'builtin' ? 'yours' : 'builtin') } }}
                    className={`-mb-px border-0 border-b-2 bg-transparent px-0.5 pb-1.5 text-[13px] cursor-pointer ${tab === t ? 'border-text-strong font-semibold text-text-strong' : 'border-transparent text-muted hover:text-text'}`}
                  >
                    {i18nT(t === 'builtin' ? 'nav.layout_col_builtin' : 'nav.layout_col_yours')} <span className="font-normal text-muted">{counts[t]}</span>
                  </button>
                ))}
              </div>
              <label className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-bg px-2.5 py-1.5 focus-within:border-accent">
                <Search size={14} aria-hidden="true" className="shrink-0 text-muted" />
                <input
                  data-autofocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={i18nT('nav.rail_palette_search')}
                  aria-label={i18nT('nav.rail_palette_search')}
                  className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-text outline-none placeholder:text-muted"
                />
              </label>
              <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto" data-testid="preview-list">
                {rows.length === 0 && (
                  <p className="m-0 px-2 py-6 text-center text-[13px] text-muted">
                    {q ? i18nT('nav.rail_palette_no_results', { query: query.trim() }) : i18nT('nav.layout_col_yours_empty')}
                  </p>
                )}
                {/* Grouped by area in the drawing's own order, so a chip moved
                    in the drawing moves its row here too. */}
                {([...ZONES, 'none'] as const).map(z => {
                  const inTab = new Set(rows.map(x => x.id))
                  const ids = z === 'none' ? rows.filter(x => where(x.id) === 'none').map(x => x.id) : inZone(z).filter(id => inTab.has(id))
                  if (ids.length === 0) return null
                  return (
                    <section key={z} aria-label={placeName(z)} data-preview-group={z} className="mb-2">
                      <h3 className="m-0 px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                        {placeName(z)} <span className="font-normal">{ids.length}</span>
                      </h3>
                      <ul className="m-0 list-none p-0">
                        {ids.map(id => {
                          const x = byId.get(id)!
                          const lit = hot === id || menu?.id === id
                          return (
                            // The drag is a pointer convenience; the row's buttons move, hide or show it.
                            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
                            <li
                              key={id}
                              data-preview-row={id}
                              draggable
                              onDragStart={e => startItemDrag(e, id)}
                              onPointerEnter={() => setHot(id)}
                              onPointerLeave={() => setHot(h => (h === id ? null : h))}
                              className={`group/row flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-grab active:cursor-grabbing ${lit ? 'bg-bg-hover ring-1 ring-accent/60' : 'hover:bg-bg-hover'}`}
                            >
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted">{x.meta.icon}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px]">{x.meta.label}</span>
                                <span className="block truncate text-[11px] text-muted">
                                  {categoryLabel(x.category)}{x.detail && repeated.has(x.meta.label) ? ` · ${x.detail}` : ''}
                                </span>
                              </span>
                              {z !== 'none' && (
                                <span className="flex shrink-0 items-center">
                                  {[true, false].map(earlier => {
                                    const ok = canStep(id, earlier)
                                    const key = earlier ? 'nav.layout_move_up' : 'nav.layout_move_down'
                                    const Icon = earlier ? ChevronUp : ChevronDown
                                    return (
                                      <button
                                        key={String(earlier)}
                                        type="button"
                                        disabled={!ok}
                                        onClick={() => step(id, earlier ? earlierKey(z) : laterKey(z))}
                                        aria-label={i18nT(key, { item: x.meta.label })}
                                        title={i18nT(key, { item: x.meta.label })}
                                        className="flex h-6 w-6 items-center justify-center rounded-md border-none bg-transparent text-muted hover:bg-bg-elevated hover:text-text cursor-pointer disabled:opacity-30 disabled:cursor-default"
                                      >
                                        <Icon size={14} />
                                      </button>
                                    )
                                  })}
                                </span>
                              )}
                              {/* Hide a placed item; show one that is not shown (in the sidebar). */}
                              <button
                                type="button"
                                onClick={() => toggle(id)}
                                aria-label={i18nT(z === 'none' ? 'nav.layout_preview_show_item' : 'nav.layout_preview_hide_item', { item: x.meta.label })}
                                title={i18nT(z === 'none' ? 'nav.layout_preview_show_item' : 'nav.layout_preview_hide_item', { item: x.meta.label })}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-bg text-muted hover:text-text cursor-pointer"
                              >
                                {z === 'none' ? <Plus size={13} /> : <EyeOff size={13} />}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )
                })}
              </div>
            </section>

            {/* The drawing of the window. */}
            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto" aria-label={i18nT('nav.layout_preview_drawing')}>
              <div className="relative mx-auto w-full max-h-full" style={{ aspectRatio: `${ratio}` }}>
                <div className="absolute inset-0 grid gap-1.5 rounded-xl border border-border bg-bg p-1.5" style={{ gridTemplateColumns: '24% 1fr', gridTemplateRows: '34px 1fr 34px' }}>
                  <div style={{ gridColumn: '1 / 3', gridRow: '1' }}>{zoneBody('top')}</div>
                  <div style={{ gridColumn: '1', gridRow: '2 / 4' }} className="min-h-0 overflow-hidden">{zoneBody('sidebar')}</div>
                  {/* The page: a plain area (removing an item is a menu choice). */}
                  <div style={{ gridColumn: '2', gridRow: '2' }} className="flex items-center justify-center rounded-lg bg-text/5">
                    <span className="pointer-events-none text-[11px] text-muted">{i18nT('nav.layout_preview_page')}</span>
                  </div>
                  <div style={{ gridColumn: '2', gridRow: '3' }}>{zoneBody('bottom')}</div>
                </div>
              </div>

              <p className="m-0 mt-3 text-[12px] text-muted">{i18nT('nav.layout_preview_menu_hint')}</p>
            </section>
          </div>

          <footer className="flex items-center gap-2 border-t border-border px-5 py-3">
            <Btn onClick={() => { reset(); setSelected(null) }}>{i18nT('nav.rail_reset')}</Btn>
            <span className="flex-1" />
            <Btn onClick={cancel}>{i18nT('nav.layout_preview_cancel')}</Btn>
            <Btn primary onClick={done}>{i18nT('nav.rail_done')}</Btn>
          </footer>

          {menu && menuItem && menuAt !== 'none' && (
            <>
              <div className="fixed inset-0 z-[88]" aria-hidden="true" onPointerDown={() => setMenu(null)} />
              <div
                role="menu"
                tabIndex={-1}
                aria-label={i18nT('nav.layout_kbd_menu', { item: menuItem.meta.label })}
                data-testid="preview-chip-menu"
                className="fixed z-[89] min-w-[200px] max-w-[280px] rounded-lg border border-border bg-bg-elevated p-1 text-text shadow-xl"
                style={{ left: Math.min(menu.x, window.innerWidth - 290), top: Math.min(menu.y, window.innerHeight - 220) }}
                ref={el => { if (el && !el.contains(document.activeElement)) el.querySelector<HTMLElement>('[role="menuitem"]')?.focus() }}
                onKeyDown={e => {
                  const list = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')]
                  const i = list.indexOf(document.activeElement as HTMLElement)
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus() }
                }}
              >
                {(() => {
                  const id = menu.id
                  const label = menuItem.meta.label
                  const inBar = menuAt === 'top' || menuAt === 'bottom'
                  const items: { key: string; text: string; run: () => void }[] = []
                  if (canStep(id, true)) items.push({ key: 'earlier', text: i18nT(inBar ? 'nav.layout_move_left' : 'nav.layout_move_up', { item: label }), run: () => step(id, earlierKey(menuAt)) })
                  if (canStep(id, false)) items.push({ key: 'later', text: i18nT(inBar ? 'nav.layout_move_right' : 'nav.layout_move_down', { item: label }), run: () => step(id, laterKey(menuAt)) })
                  for (const z of ZONES) if (z !== menuAt) items.push({ key: `to-${z}`, text: i18nT('nav.layout_kbd_move_to', { place: zoneLabel(z) }), run: () => dropAt(id, z, inZone(z).length) })
                  if (inBar && offersStyle(id)) {
                    const icon = iconOnly(id)
                    items.push({ key: 'style', text: i18nT(icon ? (id === SEARCH_ITEM ? 'nav.layout_search_field' : 'nav.layout_style_label') : 'nav.layout_search_icon'), run: () => setIconOnly(id, !icon) })
                  }
                  items.push({ key: 'remove', text: i18nT('nav.layout_kbd_remove'), run: () => hide(id) })
                  return items.map(x => (
                    <button
                      key={x.key}
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      onClick={() => { x.run(); setMenu(null) }}
                      className="block w-full rounded-md border-none bg-transparent px-2.5 py-1.5 text-left text-[13px] text-text cursor-pointer hover:bg-bg-hover focus-visible:bg-bg-hover outline-none"
                    >
                      {x.text}
                    </button>
                  ))
                })()}
              </div>
            </>
          )}

          {confirming && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg/60" role="presentation">
              <div role="alertdialog" aria-modal="true" aria-labelledby="preview-keep-title" aria-describedby="preview-keep-body" className="w-[min(400px,90%)] rounded-xl border border-border bg-bg-elevated p-5 text-text shadow-2xl">
                <h3 id="preview-keep-title" className="m-0 text-[15px] font-semibold">{i18nT('nav.layout_preview_keep_title')}</h3>
                <p id="preview-keep-body" className="m-0 mt-1.5 text-[13px] text-muted">{i18nT('nav.layout_preview_keep_body')}</p>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Btn onClick={() => setConfirming(false)}>{i18nT('nav.layout_preview_keep_editing')}</Btn>
                  <Btn onClick={cancel}>{i18nT('nav.layout_preview_discard')}</Btn>
                  <Btn primary onClick={done} autoFocus>{i18nT('nav.layout_preview_keep')}</Btn>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </OverlayPortal>
  )
}
