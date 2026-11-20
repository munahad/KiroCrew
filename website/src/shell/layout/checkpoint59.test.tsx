/**
 * Checkpoint 59 (Munahad's test notes 26-29): option 1 drops on a bar (the
 * logo to the top and bottom bars, 26), apps never below Terminal and "You"
 * (28), and option 3's Side switch, Palette | List (29).
 */
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

import { i18nT } from '../../i18n/t'
import { readPreviewSide, setEditOption, setPreviewSide } from '../../lib/editOption'
import {
  LOGO_ITEM, NOTIFY_ITEM, PROFILE_ITEM, SEARCH_ITEM, SHELL_ITEM_MIME, TERMINAL_ITEM, moveItem, readLogoPlace, readShellPlacement, resetShellLayout,
  setLayoutEditing, zoneOf, type ShellZone,
} from '../../lib/shellLayout'
import { appBlockedAt, isSidebarApp } from '../../lib/sidebarGrid'
import type { RailGroup } from '../../lib/railLayout'
import { RailHeader } from '../nav/railChrome'
import { zoneLabel } from './barItems'
import { LayoutZoneOutlines } from './layoutZones'
import { LayoutItemKeyboard } from './keyboardMove'
import { PreviewEditor } from './previewEditor'
import type { Candidate } from './layoutEditPanel'
import { EditOptionSwitcher } from './editOptionSwitcher'

afterEach(() => {
  cleanup()
  act(() => setLayoutEditing(false))
  resetShellLayout()
  localStorage.clear()
})

const dt = (id: string) => ({ types: [SHELL_ITEM_MIME], getData: () => id, setData: () => {}, setDragImage: () => {}, dropEffect: '', effectAllowed: '' })

describe('note 26: the logo moves to either bar in option 1', () => {
  it('a drop on the top or bottom bar lands even after the drag state was cleared', () => {
    setEditOption('drag')
    act(() => setLayoutEditing(true))
    render(<LayoutZoneOutlines />)
    // The window's drop listeners clear the drag state before React's handler
    // runs; the outline must still take the drop (it lost it before).
    act(() => { fireEvent.drop(document.querySelector('[data-layout-outline="top"]')!, { dataTransfer: dt(LOGO_ITEM), clientX: 10 }) })
    expect(readLogoPlace()).toBe('top')
    act(() => { fireEvent.drop(document.querySelector('[data-layout-outline="bottom"]')!, { dataTransfer: dt(LOGO_ITEM), clientX: 10 }) })
    expect(readLogoPlace()).toBe('bottom')
  })

  it('⋯ Move to Bottom bar moves it there', () => {
    setEditOption('drag')
    act(() => setLayoutEditing(true))
    render(<><RailHeader effectiveCollapsed={false} toggleNav={() => {}} avatar="" branding={undefined as never} botName="Kiro Crew" showLogo /><LayoutItemKeyboard /></>)
    fireEvent.click(within(screen.getByTestId('sidebar-logo-item')).getByTestId('layout-item-more'))
    fireEvent.click(within(screen.getByTestId('layout-item-menu')).getByText(i18nT('nav.layout_kbd_move_to', { place: zoneLabel('bottom') })))
    expect(readLogoPlace()).toBe('bottom')
  })
})

describe('note 27: the collapse button lock label', () => {
  it('reads "Can\'t move", beside the button, and the button keeps its name', () => {
    setEditOption('drag')
    act(() => setLayoutEditing(true))
    render(<RailHeader effectiveCollapsed={false} toggleNav={() => {}} avatar="" branding={undefined as never} botName="Kiro Crew" showLogo />)
    const btn = screen.getByTestId('sidebar-collapse-toggle')
    expect(btn.getAttribute('aria-label')).toBe(i18nT('nav.layout_fixed_collapse'))
    fireEvent.pointerEnter(btn.parentElement!)
    expect(screen.getByTestId('fixed-lock-label').textContent).toBe("Can't move")
  })
})

const RN = 'demo-app:release-notes'
const GROUPS: RailGroup[] = [{ id: 'workspace', items: ['chat'] }, { id: 'apps', title: 'Apps', items: [RN] }]
const candidates: Candidate[] = [
  { id: 'chat', category: 'pages', meta: { label: 'Sessions', icon: <span /> } },
  { id: RN, category: 'apps', meta: { label: 'Release Notes', icon: <span /> } },
  ...[[SEARCH_ITEM, 'Search'], [NOTIFY_ITEM, 'Notifications'], [TERMINAL_ITEM, 'Terminal'], [PROFILE_ITEM, 'You']].map(([id, label]) => ({ id, category: 'tools', meta: { label, icon: <span /> } }) as Candidate),
]
const where = (id: string): ShellZone | 'none' => (id === 'chat' || id === RN ? 'sidebar' : zoneOf(id, readShellPlacement(), false) ?? 'none')
const preview = () => render(
  <PreviewEditor candidates={candidates} columnOf={() => 'builtin'} categoryLabel={c => c} repeated={new Set()} groups={GROUPS}
    where={where} place={(id, to) => moveItem(id, to === 'none' ? null : to)} reset={() => {}} announcement="" />,
)

describe('note 28: apps stay above Terminal and "You"', () => {
  it('blocks an app below the foot, never other items', () => {
    const order = ['chat', 'apps', TERMINAL_ITEM, PROFILE_ITEM]
    expect(readShellPlacement().side).toContain(TERMINAL_ITEM)
    expect(isSidebarApp(RN)).toBe(true)
    expect(appBlockedAt(RN, order, 2)).toBe(false)
    expect(appBlockedAt(RN, order, 3)).toBe(true)
    expect(appBlockedAt(RN, order, 4)).toBe(true)
    expect(appBlockedAt('chat', order, 4)).toBe(false)
  })

  it('option 3: no landing line and no drop for an app at the sidebar end', () => {
    setPreviewSide('list')
    act(() => setLayoutEditing(true))
    preview()
    const side = document.querySelector('[data-preview-zone="sidebar"]')!
    const chipRn = document.querySelector(`[data-preview-chip="${RN}"]`)!
    fireEvent.dragStart(chipRn, { dataTransfer: dt(RN) })
    // jsdom has no layout: every drag lands at the end, below "You".
    expect(fireEvent.dragOver(side, { dataTransfer: dt(RN) })).toBe(true)
    expect(side.querySelector('span.bg-accent')).toBeNull()
  })
})

describe('note 29: option 3 Side, Palette | List', () => {
  it('the band shows Side only for option 3, Palette first, and stores it', () => {
    setEditOption('drag')
    act(() => setLayoutEditing(true))
    render(<EditOptionSwitcher />)
    expect(screen.queryByText(i18nT('nav.layout_preview_side_label'))).toBeNull()
    act(() => setEditOption('preview'))
    expect(screen.getByText(i18nT('nav.layout_preview_side_label'))).toBeTruthy()
    expect(readPreviewSide()).toBe('palette')
    fireEvent.click(screen.getByRole('radio', { name: i18nT('nav.layout_preview_side_list') }))
    expect(localStorage.getItem('mc-layout-preview-side')).toBe('list')
  })

  it('Palette: adds a not-shown item from its menu, and Remove puts it back', () => {
    moveItem(NOTIFY_ITEM, null)
    act(() => setLayoutEditing(true))
    preview()
    expect(screen.queryByTestId('preview-list')).toBeNull()
    const palette = screen.getByTestId('preview-palette')
    const item = within(palette).getByRole('button', { name: 'Notifications' })
    fireEvent.click(item)
    const menu = screen.getByTestId('preview-chip-menu')
    expect(within(menu).getAllByRole('menuitem').map(x => x.textContent)).toEqual(['top', 'sidebar', 'bottom'].map(z => i18nT('nav.layout_preview_add_to', { place: zoneLabel(z as ShellZone) })))
    act(() => { fireEvent.click(within(menu).getByText(i18nT('nav.layout_preview_add_to', { place: zoneLabel('top') }))) })
    expect(where(NOTIFY_ITEM)).toBe('top')
    expect(within(screen.getByTestId('preview-palette')).queryByRole('button', { name: 'Notifications' })).toBeNull()
    fireEvent.click(document.querySelector(`[data-preview-chip="${NOTIFY_ITEM}"]`)!)
    act(() => { fireEvent.click(within(screen.getByTestId('preview-chip-menu')).getByText(i18nT('nav.layout_kbd_remove'))) })
    expect(where(NOTIFY_ITEM)).toBe('none')
    expect(within(screen.getByTestId('preview-palette')).getByRole('button', { name: 'Notifications' })).toBeTruthy()
  })

  it('Palette: a chip dragged onto the palette is removed; List keeps the list', () => {
    act(() => setLayoutEditing(true))
    const { unmount } = preview()
    const palette = screen.getByTestId('preview-palette')
    fireEvent.dragStart(document.querySelector(`[data-preview-chip="${SEARCH_ITEM}"]`)!, { dataTransfer: dt(SEARCH_ITEM) })
    act(() => { fireEvent.drop(palette, { dataTransfer: dt(SEARCH_ITEM) }) })
    expect(where(SEARCH_ITEM)).toBe('none')
    unmount()
    setPreviewSide('list')
    preview()
    expect(screen.getByTestId('preview-list')).toBeTruthy()
    expect(screen.queryByTestId('preview-palette')).toBeNull()
  })
})
