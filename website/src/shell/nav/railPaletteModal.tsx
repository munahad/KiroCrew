/**
 * Palette rail editor: a design variation of `RailCustomizeModal`.
 *
 * Left, "Your rail": the rail as it is now, edited with buttons (move up,
 * move down, remove) so every change works by keyboard. Right, "Add to your
 * rail": everything that can go on the rail, sorted into Pages, Apps, Mates
 * and Sessions, with search. Modeled on Sketch's toolbar customization: you
 * browse a palette instead of having to know that rows can be dragged.
 *
 * It writes through the same commit path as the list editor, so the rail
 * behind the modal follows every change and both editors stay interchangeable.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronUp, Lock, MessageSquare, Plus, Search, Settings, X } from 'lucide-react'

import CrewAvatar from '../../components/CrewAvatar'
import Modal from '../../components/Modal'
import { Btn } from '../../components/ui'
import { membersRosterQuery } from '../../api/membersQuery'
import { isAppNavId } from '../../appNotificationBadges'
import { i18nT } from '../../i18n/t'
import { useAppSelector } from '../../store'
import {
  MATE_PIN_PREFIX, SESSION_PIN_PREFIX, insertPin, isEntityPin, matePinId, resetRailLayout, sessionPinId, updateRail,
  type RailGroup,
} from '../../lib/railLayout'
import { setRailEditorVariant } from '../../lib/railEditorVariant'
import { groupTitle, type RailItemMeta } from './railCustomize'
import type { RailPinChange } from './railCustomizeModal'
import { BottomBarSwitch } from './bottomBarSwitch'

type Category = 'all' | 'pages' | 'apps' | 'mates' | 'sessions'
const CATEGORIES: Category[] = ['all', 'pages', 'apps', 'mates', 'sessions']
/** Without a search, the Sessions list shows this many; search reaches all of them. */
const SESSION_BROWSE_LIMIT = 30

interface Candidate { id: string; category: Exclude<Category, 'all'>; meta: RailItemMeta }

function categoryOf(id: string): Exclude<Category, 'all'> {
  if (id.startsWith(MATE_PIN_PREFIX)) return 'mates'
  if (id.startsWith(SESSION_PIN_PREFIX)) return 'sessions'
  return isAppNavId(id) ? 'apps' : 'pages'
}

const categoryLabel = (c: Category) => i18nT(`nav.rail_palette_${c}`)

/** Move one item a step up or down, crossing into the next group at a group's edge. */
function moveStep(groups: readonly RailGroup[], id: string, delta: -1 | 1): RailGroup[] | null {
  const next = groups.map(g => ({ ...g, items: [...g.items] }))
  const gi = next.findIndex(g => g.items.includes(id))
  if (gi < 0) return null
  const items = next[gi].items
  const i = items.indexOf(id)
  const j = i + delta
  if (j >= 0 && j < items.length) {
    ;[items[i], items[j]] = [items[j], items[i]]
    return next
  }
  const ng = gi + delta
  if (ng < 0 || ng >= next.length) return null
  items.splice(i, 1)
  if (delta < 0) next[ng].items.push(id)
  else next[ng].items.unshift(id)
  return next
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="w-6 h-6 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-muted hover:text-text hover:bg-bg-hover disabled:opacity-30 disabled:cursor-default"
    >
      {children}
    </button>
  )
}

export function RailPaletteModal({ open, onClose, groups, hidden, meta, onCommit }: {
  open: boolean
  onClose: () => void
  groups: readonly RailGroup[]
  /** Pages and apps not on the rail that can be pinned back. */
  hidden: readonly string[]
  meta: (id: string) => RailItemMeta | null
  onCommit: (next: RailGroup[], change?: RailPinChange) => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('all')
  const [target, setTarget] = useState<string>(groups[0]?.id ?? '')
  const targetGroup = groups.some(g => g.id === target) ? target : groups[0]?.id ?? ''

  const slots = useAppSelector(s => s.dashboard.slots)
  const roster = useQuery({ ...membersRosterQuery, enabled: open }).data

  const onRail = useMemo(() => new Set(groups.flatMap(g => g.items)), [groups])

  // Everything that could be on the rail, whether it is now or not.
  const candidates = useMemo((): Candidate[] => {
    const out: Candidate[] = []
    const seen = new Set<string>()
    const add = (id: string, m: RailItemMeta | null) => {
      if (!m || seen.has(id)) return
      seen.add(id)
      out.push({ id, category: categoryOf(id), meta: m })
    }
    for (const id of [...groups.flatMap(g => g.items), ...hidden]) if (!isEntityPin(id)) add(id, meta(id))
    for (const m of roster ?? []) {
      add(matePinId(m.slug), { label: m.name, icon: <CrewAvatar seed={m.name} avatar={m.avatar} size={18} /> })
    }
    for (const s of slots) add(sessionPinId(s.key), { label: s.title || s.key, icon: <MessageSquare size={16} /> })
    return out
  }, [groups, hidden, meta, roster, slots])

  const q = query.trim().toLowerCase()
  const counts = useMemo(() => {
    const c: Record<Category, number> = { all: 0, pages: 0, apps: 0, mates: 0, sessions: 0 }
    for (const x of candidates) {
      if (q && !x.meta.label.toLowerCase().includes(q)) continue
      c[x.category]++
      c.all++
    }
    return c
  }, [candidates, q])

  const shown = useMemo(() => {
    let list = candidates.filter(x => (category === 'all' || x.category === category) && (!q || x.meta.label.toLowerCase().includes(q)))
    if (!q) {
      // Browsing, not searching: keep the long Sessions list to its most recent rows.
      let sessions = 0
      list = list.filter(x => x.category !== 'sessions' || sessions++ < SESSION_BROWSE_LIMIT)
    }
    return list
  }, [candidates, category, q])

  const add = (id: string) => {
    if (isEntityPin(id)) {
      updateRail(l => insertPin(l, id, targetGroup, null))
      return
    }
    const next = groups.map(g => (g.id === targetGroup ? { ...g, items: [...g.items, id] } : { ...g, items: [...g.items] }))
    onCommit(next, { pin: id })
  }
  const remove = (id: string) => onCommit(groups.map(g => ({ ...g, items: g.items.filter(x => x !== id) })), { unpin: id })
  const move = (id: string, delta: -1 | 1) => {
    const next = moveStep(groups, id, delta)
    if (next) onCommit(next)
  }

  const flatOrder = groups.flatMap(g => g.items)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={i18nT('nav.rail_palette_title')}
      maxWidth={880}
      footer={(
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Btn onClick={resetRailLayout}>{i18nT('nav.rail_reset')}</Btn>
            <button
              type="button"
              onClick={() => setRailEditorVariant('list')}
              className="text-[13px] text-muted bg-transparent border-none cursor-pointer hover:text-text underline underline-offset-2"
            >
              {i18nT('nav.rail_editor_use_list')}
            </button>
          </div>
          <Btn primary onClick={onClose}>{i18nT('nav.rail_done')}</Btn>
        </div>
      )}
    >
      <div className="grid gap-5 md:grid-cols-[260px_1fr] min-h-[420px]">
        {/* ── Your rail ── */}
        <section aria-label={i18nT('nav.rail_palette_your_rail')} className="flex flex-col gap-3 min-w-0">
          <h3 className="m-0 text-[13px] font-semibold text-text">{i18nT('nav.rail_palette_your_rail')}</h3>
          {groups.map(g => (
            <div key={g.id} className="rounded-lg border border-border bg-bg-elevated overflow-hidden">
              <div className="px-3 py-1.5 text-[12px] font-medium text-muted bg-bg-hover border-b border-border">{groupTitle(g)}</div>
              {g.items.length === 0 && (
                <div className="px-3 py-2 text-[12px] text-muted">{i18nT('nav.rail_palette_empty_group')}</div>
              )}
              <ul className="m-0 p-0 list-none divide-y divide-border">
                {g.items.map(id => {
                  const m = meta(id)
                  if (!m) return null
                  const pos = flatOrder.indexOf(id)
                  return (
                    <li key={id} className="group/row flex items-center gap-2 pl-3 pr-1 py-1.5 text-sm text-text">
                      <span className="w-4 h-4 flex items-center justify-center shrink-0 text-muted">{m.icon}</span>
                      <span className="flex-1 min-w-0 truncate">{m.label}</span>
                      <span className="flex items-center opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                        <IconButton label={`${i18nT('nav.rail_palette_move_up')}: ${m.label}`} onClick={() => move(id, -1)} disabled={pos === 0}><ChevronUp size={14} /></IconButton>
                        <IconButton label={`${i18nT('nav.rail_palette_move_down')}: ${m.label}`} onClick={() => move(id, 1)} disabled={pos === flatOrder.length - 1}><ChevronDown size={14} /></IconButton>
                        <IconButton label={`${i18nT('nav.rail_palette_remove')}: ${m.label}`} onClick={() => remove(id)}><X size={13} /></IconButton>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          {/* The one permanent item, shown locked so its absence from the editable list reads as deliberate. */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-[13px] text-muted">
            <Settings size={15} />
            <span className="flex-1">{i18nT('nav.rail_palette_settings_locked')}</span>
            <Lock size={13} aria-hidden="true" />
          </div>
          {/* Design exploration: the opt-in bottom bar, with the other layout choices. */}
          <BottomBarSwitch />
        </section>

        {/* ── Palette ── */}
        <section aria-label={i18nT('nav.rail_palette_add_title')} className="flex flex-col gap-3 min-w-0">
          <h3 className="m-0 text-[13px] font-semibold text-text">{i18nT('nav.rail_palette_add_title')}</h3>
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-bg-elevated focus-within:border-accent">
            <Search size={15} className="text-muted shrink-0" aria-hidden="true" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={i18nT('nav.rail_palette_search')}
              aria-label={i18nT('nav.rail_palette_search')}
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-text placeholder:text-muted"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="tablist" className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={category === c}
                  onClick={() => setCategory(c)}
                  className={`px-2.5 py-1 rounded-full text-[12px] border cursor-pointer ${category === c ? 'bg-accent text-accent-fg border-accent' : 'bg-transparent text-muted border-border hover:text-text'}`}
                >
                  {categoryLabel(c)} <span className="opacity-70">{counts[c]}</span>
                </button>
              ))}
            </div>
            {groups.length > 1 && (
              <label className="flex items-center gap-1.5 text-[12px] text-muted">
                {i18nT('nav.rail_palette_add_to')}
                <select
                  value={targetGroup}
                  onChange={e => setTarget(e.target.value)}
                  className="px-1.5 py-0.5 rounded border border-border bg-bg-elevated text-text text-[12px]"
                >
                  {groups.map(g => <option key={g.id} value={g.id}>{groupTitle(g)}</option>)}
                </select>
              </label>
            )}
          </div>
          {shown.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted py-10">
              {i18nT('nav.rail_palette_no_results', { query: query.trim() })}
            </div>
          ) : (
            <ul className="m-0 p-0 list-none grid gap-2 grid-cols-[repeat(auto-fill,minmax(170px,1fr))] max-h-[52vh] overflow-y-auto pr-1">
              {shown.map(x => {
                const pinned = onRail.has(x.id)
                return (
                  <li key={x.id}>
                    <button
                      type="button"
                      onClick={() => (pinned ? undefined : add(x.id))}
                      aria-disabled={pinned}
                      aria-label={pinned ? `${x.meta.label}: ${i18nT('nav.rail_palette_on_rail')}` : `${i18nT('nav.rail_palette_add')}: ${x.meta.label}`}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left ${pinned ? 'border-border bg-bg-hover cursor-default' : 'border-border bg-bg-elevated cursor-pointer hover:border-accent'}`}
                    >
                      <span className="w-5 h-5 flex items-center justify-center shrink-0 text-muted">{x.meta.icon}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm text-text">{x.meta.label}</span>
                        <span className="block text-[11px] text-muted">{categoryLabel(x.category)}</span>
                      </span>
                      {pinned
                        ? <span className="flex items-center gap-1 text-[11px] text-muted shrink-0"><Check size={13} />{i18nT('nav.rail_palette_on_rail')}</span>
                        : <span className="flex items-center gap-1 text-[12px] text-accent shrink-0"><Plus size={14} />{i18nT('nav.rail_palette_add')}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  )
}
