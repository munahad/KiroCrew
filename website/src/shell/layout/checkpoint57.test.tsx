/**
 * Checkpoint 57 (Munahad's test notes 14-18): option 1's Undo list (16),
 * option 2 always Gradual with no Reveal switch (17), and option 2's Columns
 * 2 | 3 switch (18). Notes 14 (bar arrows swap past a neighbour) and 15 (the
 * logo in the bottom bar) are in lib/barGrid.test.ts and
 * lib/shellLayout.round1.test.ts.
 */
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

import { i18nT } from '../../i18n/t'
import { readDisclosure, readPanelColumns, setDisclosure, setEditOption, setPanelColumns, setPreviewSide } from '../../lib/editOption'
import {
  FOCUS_ITEM, HISTORY_ITEM, LOGO_ITEM, NOTIFY_ITEM, PROFILE_ITEM, REMOTE_ITEM, SEARCH_ITEM, SHELL_ITEM_MIME, STATUS_ITEM, moveItem, readShellPlacement, resetShellLayout, setLayoutEditing, zoneOf, type ShellZone,
} from '../../lib/shellLayout'
import type { RailGroup } from '../../lib/railLayout'
import { renderWithProviders } from '../../test/helpers'
import { RailGroups } from '../nav/railGroups'
import { SidebarColumn } from '../nav/sidebarColumn'
import { columnIdsOf, columnOrder, readSidebarRows } from '../../lib/sidebarGrid'
import { RailHeader } from '../nav/railChrome'
import { zoneLabel } from './barItems'
import { useBarContextMenu } from './barContextMenu'
import { PreviewEditor } from './previewEditor'
import type { Candidate } from './layoutEditPanel'
import { LayoutItemKeyboard, canStepInList, stepItem } from './keyboardMove'
import { DragOnlyBar, clearRemovedStack, hideFromCanvas, readRemovedStack } from './dragOnlyEdit'
import { EditOptionSwitcher } from './editOptionSwitcher'

const where = (id: string) => zoneOf(id, readShellPlacement(), false)

afterEach(() => {
  cleanup()
  act(() => setLayoutEditing(false))
  resetShellLayout()
  clearRemovedStack()
  localStorage.clear()
})

describe('note 16: option 1 Undo lists every removal', () => {
  it('reads "N removed · Undo ▾" and restores one in the middle on its own', () => {
    setEditOption('drag')
    act(() => setLayoutEditing(true))
    render(<DragOnlyBar />)
    act(() => { hideFromCanvas(SEARCH_ITEM); hideFromCanvas(NOTIFY_ITEM); hideFromCanvas(STATUS_ITEM) })
    const toast = screen.getByTestId('drag-only-undo')
    expect(toast.textContent).toContain(i18nT('nav.layout_removed_count', { count: 3 }))
    const toggle = within(toast).getByRole('button', { name: i18nT('nav.layout_removed_list') })
    expect(toggle.getAttribute('aria-haspopup')).toBe('menu')
    fireEvent.click(toggle)
    const menu = screen.getByRole('menu', { name: i18nT('nav.layout_removed_list') })
    // Newest first.
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map(x => x.getAttribute('aria-label'))).toEqual([
      i18nT('nav.layout_restore_item', { item: i18nT('nav.layout_status_item') }),
      i18nT('nav.layout_restore_item', { item: i18nT('nav.layout_notifications_item') }),
      i18nT('nav.layout_restore_item', { item: i18nT('nav.layout_locked_search') }),
    ])
    // The middle one comes back without undoing the newer one.
    act(() => { fireEvent.click(items[1]) })
    expect(where(NOTIFY_ITEM)).toBe('top')
    expect(where(STATUS_ITEM)).toBeNull()
    expect(readRemovedStack().map(h => h.id)).toEqual([SEARCH_ITEM, STATUS_ITEM])
    // Escape closes the list only; edit mode stays on.
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByTestId('drag-only-bar')).toBeTruthy()
    // Cmd+Z still restores the newest.
    act(() => { fireEvent.keyDown(window, { key: 'z', metaKey: true }) })
    expect(where(STATUS_ITEM)).toBe('top')
    // One left: the plain "<Item> removed · Undo", no list.
    expect(screen.getByTestId('drag-only-undo').textContent).toContain(i18nT('nav.layout_removed_short', { item: i18nT('nav.layout_locked_search') }))
    expect(screen.queryByTestId('drag-only-undo-list')).toBeNull()
  })
})

describe('note 17: option 2 is always Gradual', () => {
  it('has no Reveal switch in the band and ignores a stored All up front', () => {
    setEditOption('panel')
    setDisclosure('all')
    expect(readDisclosure()).toBe('gradual')
    // Checkpoint 58: the band shows its Edit layout switches in edit mode only.
    act(() => setLayoutEditing(true))
    render(<EditOptionSwitcher />)
    expect(screen.queryByText(i18nT('nav.layout_disclosure_label'))).toBeNull()
    expect(screen.getByText(i18nT('nav.layout_columns_label'))).toBeTruthy()
  })
})

const AVAILABLE = ['chat', 'members', 'app-ada']
const LABELS: Record<string, string> = { chat: 'Sessions', members: 'Mates', 'app-ada': 'Ada' }
function openPanel() {
  renderWithProviders(
    <>
      <div data-testid="dashboard-shell" />
      <RailGroups
        available={AVAILABLE}
        collapsed={false}
        defaultGroup={() => 'workspace'}
        renderItem={(id, label) => <button type="button">{label ?? LABELS[id]}</button>}
        meta={id => (LABELS[id] ? { label: LABELS[id], icon: null } : null)}
        isApp={() => false}
      />
    </>,
  )
  act(() => setLayoutEditing(true))
  return screen.getByRole('dialog', { name: 'Edit layout' })
}
const dt = (id: string) => ({ types: [SHELL_ITEM_MIME], getData: () => id, setData: () => {}, setDragImage: () => {}, dropEffect: '', effectAllowed: '' })

describe('note 18: option 2 Columns 2 | 3', () => {
  it('switches from the band, stores the choice, and starts at 2', () => {
    setEditOption('panel')
    expect(readPanelColumns()).toBe('2')
    act(() => setLayoutEditing(true))
    render(<EditOptionSwitcher />)
    fireEvent.click(screen.getByRole('radio', { name: '3' }))
    expect(readPanelColumns()).toBe('3')
    expect(localStorage.getItem('mc-layout-panel-columns')).toBe('3')
  })

  it('2 keeps Built in | Yours; 3 draws Top bar | Sidebar | Bottom bar, each with its own Add an item', () => {
    setEditOption('panel')
    let panel = openPanel()
    expect(within(panel).getByRole('heading', { name: /^Built in/ })).toBeTruthy()
    expect(within(panel).queryByTestId('layout-three-columns')).toBeNull()
    cleanup()
    act(() => setLayoutEditing(false))
    act(() => setPanelColumns('3'))
    panel = openPanel()
    const cols = [...panel.querySelectorAll<HTMLElement>('[data-layout-column]')].map(c => c.dataset.layoutColumn)
    expect(cols).toEqual(['top', 'sidebar', 'bottom'])
    expect(within(panel).queryByRole('heading', { name: /^Built in/ })).toBeNull()
    for (const z of ['top', 'sidebar', 'bottom']) expect(within(screen.getByTestId(`layout-col-add-${z}`)).getByTestId('hidden-item-picker')).toBeTruthy()
    // The collapse button: a fixed row at the top of the Sidebar column.
    const side = panel.querySelector<HTMLElement>('[data-layout-column="sidebar"] ul')!
    expect(side.firstElementChild?.getAttribute('data-testid')).toBe('layout-col-locked-collapse')
    expect(side.firstElementChild?.getAttribute('draggable')).toBeNull()
  })

  it('moves a row between columns by drag, live', () => {
    setEditOption('panel')
    setPanelColumns('3')
    const panel = openPanel()
    const sessions = panel.querySelector('[data-layout-row="chat"]')!
    const top = panel.querySelector<HTMLElement>('[data-layout-column="top"]')!
    const search = top.querySelector(`[data-layout-row="${SEARCH_ITEM}"]`)!
    fireEvent.dragStart(sessions, { dataTransfer: dt('chat') })
    // No Built in / Yours shut: another column takes it, with one landing line.
    expect(fireEvent.dragOver(search, { dataTransfer: dt('chat'), clientY: 10 })).toBe(false)
    expect(screen.getAllByTestId('layout-list-drop-line')).toHaveLength(1)
    act(() => { fireEvent.drop(search, { dataTransfer: dt('chat'), clientY: 10 }) })
    expect(readShellPlacement().top).toContain('chat')
    expect(top.querySelector('[data-layout-row="chat"]')).not.toBeNull()
  })
})

function column1() {
  return render(
    <>
      <SidebarColumn
        groups={[{ id: 'workspace', items: ['a', 'b'] }]}
        collapsed={false}
        labelOf={id => `Item ${id}`}
        groupTitle={() => 'Main list'}
        renderHeader={() => null}
        renderRow={id => <span>{`row ${id}`}</span>}
      />
      <LayoutItemKeyboard />
    </>,
  )
}
const drawnOrder = () => [...document.querySelectorAll<HTMLElement>('[data-layout-item]')].map(e => e.dataset.layoutItem)

describe('note 21: Move up / down in the item menus', () => {
  it('option 1: the right-click menu moves a sidebar row', () => {
    setEditOption('drag')
    act(() => setLayoutEditing(true))
    column1()
    fireEvent.contextMenu(document.querySelector('[data-layout-item="a"]')!)
    act(() => { fireEvent.click(within(screen.getByTestId('layout-item-menu')).getByText(i18nT('nav.layout_move_down', { item: 'Item a' }))) })
    expect(readSidebarRows().a).toBeGreaterThan(readSidebarRows().b ?? 0)
    expect(drawnOrder().filter(x => x === 'a' || x === 'b')).toEqual(['b', 'a'])
  })
})

const GROUPS: RailGroup[] = [{ id: 'workspace', items: ['a'] }, { id: 'apps', title: 'Apps', items: ['b'] }]
const preCandidates: Candidate[] = [
  ...[['a', 'Ada'], ['b', 'Standup Bot']].map(([id, label]) => ({ id, category: 'apps', meta: { label, icon: <span /> } }) as Candidate),
  ...[[HISTORY_ITEM, 'Back and forward'], [FOCUS_ITEM, 'Focus'], [SEARCH_ITEM, 'Search'], [STATUS_ITEM, 'Status'], [NOTIFY_ITEM, 'Notifications'], [PROFILE_ITEM, 'You'], [REMOTE_ITEM, 'Crews']].map(([id, label]) => ({ id, category: 'tools', meta: { label, icon: <span /> } }) as Candidate),
]
const preWhere = (id: string): ShellZone | 'none' => (id === 'a' || id === 'b' ? 'sidebar' : zoneOf(id, readShellPlacement(), false) ?? 'none')
function renderPreview() {
  return render(
    <PreviewEditor
      candidates={preCandidates}
      columnOf={() => 'builtin'}
      categoryLabel={() => 'Apps'}
      repeated={new Set()}
      groups={GROUPS}
      where={preWhere}
      place={(id, to) => moveItem(id, to === 'none' ? null : to)}
      reset={() => {}}
      announcement=""
    />,
  )
}
const sideOrder = () => columnOrder(columnIdsOf(GROUPS)).filter(x => x === 'a' || x === 'b')

describe('note 21: Move up / down in the item menus, options 2 and 3', () => {
  it('option 3: "Move Standup Bot up" passes the group title and moves it', () => {
    renderPreview()
    fireEvent.click(document.querySelector('[data-preview-zone="sidebar"] [data-preview-chip="b"]')!)
    act(() => { fireEvent.click(within(screen.getByTestId('preview-chip-menu')).getByText(i18nT('nav.layout_move_up', { item: 'Standup Bot' }))) })
    expect(sideOrder()).toEqual(['b', 'a'])
  })

  it('option 2: a row\'s arrow passes the group title too (its ⋯ has Move to only)', () => {
    expect(canStepInList('b', 'sidebar', -1, GROUPS)).toBe(true)
    expect(canStepInList('a', 'sidebar', -1, GROUPS)).toBe(false)
    expect(stepItem('b', 'sidebar', 'ArrowUp', true, GROUPS)).toBe('sidebar')
    expect(sideOrder()).toEqual(['b', 'a'])
    // At the list's end, nothing further, and never out into a bar.
    expect(canStepInList('b', 'sidebar', -1, GROUPS)).toBe(false)
    expect(stepItem('b', 'sidebar', 'ArrowUp', true, GROUPS)).toBeNull()
  })
})

describe('note 22: option 3 list rows step left and right in a bar', () => {
  it('gives Top bar rows ‹ › named left and right, sidebar rows up and down', () => {
    setPreviewSide('list')
    renderPreview()
    const list = screen.getByTestId('preview-list')
    const top = list.querySelector<HTMLElement>('[data-preview-group="top"]')!
    expect(within(top).getAllByRole('button', { name: i18nT('nav.layout_move_left', { item: 'Status' }) })).toHaveLength(1)
    expect(within(top).queryByRole('button', { name: i18nT('nav.layout_move_up', { item: 'Status' }) })).toBeNull()
    const side = list.querySelector<HTMLElement>('[data-preview-group="sidebar"]')!
    expect(within(side).getByRole('button', { name: i18nT('nav.layout_move_up', { item: 'Standup Bot' }) })).toBeTruthy()
    // Fades at an end: the first top-bar row can't go further left.
    const firstTop = top.querySelector<HTMLElement>('[data-preview-row]')!
    const left = within(firstTop).getAllByRole('button').find(b => /left/i.test(b.getAttribute('aria-label') ?? ''))! as HTMLButtonElement
    expect(left.disabled).toBe(true)
  })
})

describe('note 20: the collapse button is fixed, with a lock on hover or focus', () => {
  it('names it "Collapse sidebar, fixed" on the window while editing, with a lock and no controls', () => {
    setEditOption('drag')
    act(() => setLayoutEditing(true))
    render(<RailHeader effectiveCollapsed={false} toggleNav={() => {}} avatar="" branding={undefined as never} botName="Kiro Crew" showLogo={false} />)
    const btn = screen.getByTestId('sidebar-collapse-toggle')
    expect(btn.getAttribute('aria-label')).toBe(i18nT('nav.layout_fixed_collapse'))
    const wrap = btn.parentElement!
    expect(within(wrap).getByTestId('fixed-lock')).toBeTruthy()
    // Checkpoint 59 (note 27): its label shows beside the button, in the overlay layer.
    fireEvent.pointerEnter(wrap)
    expect(screen.getByTestId('fixed-lock-label').textContent).toBe(i18nT('nav.layout_fixed_sidebar'))
    expect(wrap.querySelector('[draggable="true"], [data-testid="layout-item-more"], [data-testid^="layout-item-step"]')).toBeNull()
  })

  it('draws the lock on option 3\'s fixed chip and option 2\'s fixed row', () => {
    renderPreview()
    const chip = document.querySelector<HTMLElement>('[data-preview-fixed="collapse"]')!
    expect(chip.getAttribute('aria-label')).toBe(i18nT('nav.layout_fixed_collapse'))
    expect(chip.tabIndex).toBe(0)
    expect(within(chip).getByTestId('fixed-lock')).toBeTruthy()
    cleanup()
    setEditOption('panel')
    setPanelColumns('3')
    openPanel()
    expect(within(screen.getByTestId('layout-col-locked-collapse')).getByTestId('fixed-lock')).toBeTruthy()
  })
})

function Bar23({ zone }: { zone: 'top' | 'bottom' }) {
  const m = useBarContextMenu(zone, false)
  return <div data-testid={`bar-${zone}`} {...m.props}>{m.menu}</div>
}

describe('note 23: Remove all from two removable items', () => {
  it('option 1: offered at two removable items, not at one; You and the Crews switcher never count', () => {
    setEditOption('drag')
    act(() => setLayoutEditing(true))
    moveItem(SEARCH_ITEM, 'bottom')
    moveItem(PROFILE_ITEM, 'bottom')
    moveItem(REMOTE_ITEM, 'bottom')
    render(<Bar23 zone="bottom" />)
    const removeAll = i18nT('nav.layout_remove_all_from', { place: zoneLabel('bottom') })
    fireEvent.contextMenu(screen.getByTestId('bar-bottom'))
    expect(screen.queryByText(removeAll)).toBeNull()
    cleanup()
    moveItem(STATUS_ITEM, 'bottom')
    render(<Bar23 zone="bottom" />)
    fireEvent.contextMenu(screen.getByTestId('bar-bottom'))
    expect(screen.getByText(removeAll)).toBeTruthy()
  })

  it('option 3: shown at two removable items beside You', () => {
    moveItem(STATUS_ITEM, null)
    moveItem(NOTIFY_ITEM, null)
    moveItem(SEARCH_ITEM, 'bottom')
    moveItem(PROFILE_ITEM, 'bottom')
    renderPreview()
    const clear = () => within(document.querySelector<HTMLElement>('[data-preview-zone="bottom"]')!).queryByRole('button', { name: i18nT('nav.layout_preview_clear_area') })
    expect(clear()).toBeNull()
    cleanup()
    moveItem(STATUS_ITEM, 'bottom')
    renderPreview()
    expect(clear()).not.toBeNull()
  })
})

describe('notes 24 and 25: the sidebar header matches production', () => {
  const header = (collapsed: boolean, showLogo: boolean, toggleNav = () => {}) =>
    render(<RailHeader effectiveCollapsed={collapsed} toggleNav={toggleNav} avatar="" branding={undefined as never} botName="Kiro Crew" showLogo={showLogo} />)

  it('collapsed with the logo: the logo alone, and clicking it expands', () => {
    let opened = 0
    header(true, true, () => { opened++ })
    expect(screen.queryByTestId('sidebar-collapse-toggle')).toBeNull()
    const logo = screen.getByTestId('sidebar-logo-toggle')
    expect(logo.getAttribute('aria-label')).toBe(i18nT('app.expand_sidebar'))
    fireEvent.click(logo)
    expect(opened).toBe(1)
  })

  it('collapsed with the logo removed or in a bar: the expand button', () => {
    header(true, false)
    expect(screen.getByTestId('sidebar-collapse-toggle').getAttribute('aria-label')).toBe(i18nT('app.expand_sidebar'))
  })

  it('expanded: always the collapse button, production\'s 15px arrow with no hover tint', () => {
    header(false, true)
    const btn = screen.getByTestId('sidebar-collapse-toggle')
    expect(btn.getAttribute('aria-label')).toBe(i18nT('app.collapse_sidebar'))
    expect(btn.className).not.toMatch(/hover:bg-/)
    expect(btn.querySelector('svg')?.getAttribute('width')).toBe('15')
  })

  it('option 1 editing, collapsed with the logo: clicking the logo item expands', () => {
    setEditOption('drag')
    act(() => setLayoutEditing(true))
    let opened = 0
    header(true, true, () => { opened++ })
    expect(screen.queryByTestId('sidebar-collapse-toggle')).toBeNull()
    fireEvent.click(screen.getByTestId('sidebar-logo-item').querySelector('[data-layout-item]')!)
    expect(opened).toBe(1)
  })

  it('option 3 draws the same rule for both logo cases', () => {
    const logoCandidates: Candidate[] = [...preCandidates, { id: LOGO_ITEM, category: 'tools', meta: { label: 'Logo', icon: <span /> } } as Candidate]
    const draw = () => render(
      <PreviewEditor candidates={logoCandidates} columnOf={() => 'builtin'} categoryLabel={() => 'Tools'} repeated={new Set()} groups={GROUPS}
        where={id => (id === LOGO_ITEM ? (zoneOf(id, readShellPlacement(), false) ?? 'none') : preWhere(id))}
        place={(id, to) => moveItem(id, to === 'none' ? null : to)} reset={() => {}} announcement="" />,
    )
    const collapse = () => document.querySelector('[data-preview-fixed="collapse"]')
    localStorage.setItem('mc-nav', '1')
    draw()
    expect(collapse()).toBeNull()
    cleanup()
    moveItem(LOGO_ITEM, 'bottom')
    draw()
    expect(collapse()).not.toBeNull()
    cleanup()
    moveItem(LOGO_ITEM, 'sidebar')
    localStorage.setItem('mc-nav', '0')
    draw()
    expect(collapse()).not.toBeNull()
  })
})
