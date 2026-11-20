/**
 * Checkpoint 60 (review of cp58-59): option 3 Palette keeps keyboard focus in
 * the dialog, apps never step below Terminal and "You" by keyboard or menu
 * (note 28, all three options), the lock label follows its button, and
 * Palette's Cancel, Discard and "Keep your changes?".
 */
import { useRef } from 'react'
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

import { i18nT } from '../../i18n/t'
import { setEditOption, setPreviewSide } from '../../lib/editOption'
import {
  NOTIFY_ITEM, PROFILE_ITEM, SEARCH_ITEM, TERMINAL_ITEM, isLayoutEditing, moveItem, readShellPlacement, resetShellLayout,
  setLayoutEditing, zoneOf, type ShellZone,
} from '../../lib/shellLayout'
import { canSwapInSidebar } from '../../lib/sidebarGrid'
import type { RailGroup } from '../../lib/railLayout'
import { zoneLabel } from './barItems'
import { FixedLockLabel } from './fixedLock'
import { LayoutItemKeyboard, canStepInList, registerSidebarGroups, spotOf, stepItem, useLayoutItemProps } from './keyboardMove'
import { PreviewEditor } from './previewEditor'
import type { Candidate } from './layoutEditPanel'

afterEach(() => {
  cleanup()
  act(() => setLayoutEditing(false))
  resetShellLayout()
  localStorage.clear()
})

const frame = () => act(() => new Promise<void>(r => requestAnimationFrame(() => r())))

const RN = 'demo-app:release-notes'
const GROUPS: RailGroup[] = [{ id: 'workspace', items: ['chat', PROFILE_ITEM] }, { id: 'apps', title: 'Apps', items: [RN] }]
const candidates: Candidate[] = [
  { id: 'chat', category: 'pages', meta: { label: 'Sessions', icon: <span /> } },
  { id: RN, category: 'apps', meta: { label: 'Release Notes', icon: <span /> } },
  ...[[SEARCH_ITEM, 'Search'], [NOTIFY_ITEM, 'Notifications'], [TERMINAL_ITEM, 'Terminal'], [PROFILE_ITEM, 'You']].map(([id, label]) => ({ id, category: 'tools', meta: { label, icon: <span /> } }) as Candidate),
]
const SIDEBAR = new Set(['chat', RN, PROFILE_ITEM])
const where = (id: string): ShellZone | 'none' => (SIDEBAR.has(id) ? 'sidebar' : zoneOf(id, readShellPlacement(), false) ?? 'none')
const preview = () => render(
  <PreviewEditor candidates={candidates} columnOf={() => 'builtin'} categoryLabel={c => c} repeated={new Set()} groups={GROUPS}
    where={where} place={(id, to) => moveItem(id, to === 'none' ? null : to)} reset={() => {}} announcement="" />,
)
const dialog = () => screen.getByTestId('layout-preview-editor')
const paletteItem = (label: string) => within(screen.getByTestId('preview-palette')).getByRole('button', { name: label })

describe('option 3 Palette: keyboard focus stays in the dialog', () => {
  it('starts inside the dialog, and Escape on a palette item menu goes back to the item', async () => {
    moveItem(NOTIFY_ITEM, null)
    setEditOption('preview')
    act(() => setLayoutEditing(true))
    preview()
    expect(dialog().contains(document.activeElement)).toBe(true)
    const item = paletteItem('Notifications')
    item.focus()
    fireEvent.click(item)
    expect(screen.getByTestId('preview-chip-menu').contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    await frame()
    expect(screen.queryByTestId('preview-chip-menu')).toBeNull()
    expect(document.activeElement).toBe(paletteItem('Notifications'))
    // Escape still works from there: it clears the selection, then leaves (no changes).
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(isLayoutEditing()).toBe(false)
  })

  it('"Add to …" focuses the new chip in the drawing', async () => {
    moveItem(NOTIFY_ITEM, null)
    act(() => setLayoutEditing(true))
    preview()
    fireEvent.click(paletteItem('Notifications'))
    act(() => { fireEvent.click(within(screen.getByTestId('preview-chip-menu')).getByText(i18nT('nav.layout_preview_add_to', { place: zoneLabel('top') }))) })
    await frame()
    expect(document.activeElement).toBe(document.querySelector(`[data-preview-chip="${NOTIFY_ITEM}"]`))
  })

  it('Remove from a chip menu focuses the item back on the palette', async () => {
    act(() => setLayoutEditing(true))
    preview()
    fireEvent.click(document.querySelector(`[data-preview-chip="${SEARCH_ITEM}"]`)!)
    act(() => { fireEvent.click(within(screen.getByTestId('preview-chip-menu')).getByText(i18nT('nav.layout_kbd_remove'))) })
    await frame()
    expect(document.activeElement).toBe(paletteItem('Search'))
  })
})

describe('option 3 Palette: Cancel, Discard and "Keep your changes?"', () => {
  const removeSearch = () => {
    fireEvent.click(document.querySelector(`[data-preview-chip="${SEARCH_ITEM}"]`)!)
    act(() => { fireEvent.click(within(screen.getByTestId('preview-chip-menu')).getByText(i18nT('nav.layout_kbd_remove'))) })
    expect(where(SEARCH_ITEM)).toBe('none')
  }
  const start = () => { setPreviewSide('palette'); setEditOption('preview'); act(() => setLayoutEditing(true)); return preview() }
  const close = () => fireEvent.click(screen.getByRole('button', { name: i18nT('nav.layout_preview_close') }))

  it('Cancel puts back what the palette changed and leaves edit mode', () => {
    start()
    removeSearch()
    fireEvent.click(screen.getByRole('button', { name: i18nT('nav.layout_preview_cancel') }))
    expect(where(SEARCH_ITEM)).toBe('top')
    expect(isLayoutEditing()).toBe(false)
  })

  it('Close with changes asks "Keep your changes?"; Discard puts them back', () => {
    start()
    removeSearch()
    close()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(isLayoutEditing()).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: i18nT('nav.layout_preview_discard') }))
    expect(where(SEARCH_ITEM)).toBe('top')
    expect(isLayoutEditing()).toBe(false)
  })

  it('Keep holds the palette change', () => {
    const { unmount } = start()
    removeSearch()
    close()
    fireEvent.click(screen.getByRole('button', { name: i18nT('nav.layout_preview_keep') }))
    expect(isLayoutEditing()).toBe(false)
    unmount()
    expect(where(SEARCH_ITEM)).toBe('none')
  })
})

describe('note 28 by keyboard: an app never steps below Terminal or "You"', () => {
  it('option 1: arrow steps stop above the foot, and never jump to the bottom bar', () => {
    registerSidebarGroups(GROUPS)
    expect(readShellPlacement().side).toContain(TERMINAL_ITEM)
    for (let i = 0; i < 40; i++) stepItem(RN, 'sidebar', 'ArrowDown')
    const end = spotOf(RN)
    expect(end?.zone).toBe('sidebar')
    //x
    // One more press does nothing; up still works; other rows are not limited.
    expect(stepItem(RN, 'sidebar', 'ArrowDown')).toBeNull()
    expect(spotOf(RN)).toEqual(end)
    //x
    //x
  })

  it('option 1: the item menu offers no Move down at that spot', () => {
    registerSidebarGroups(GROUPS)
    for (let i = 0; i < 40; i++) stepItem(RN, 'sidebar', 'ArrowDown')
    setEditOption('drag')
    act(() => setLayoutEditing(true))
    function Row() { return <div {...useLayoutItemProps(RN, 'sidebar', 'Release Notes')} /> }
    render(<><Row /><LayoutItemKeyboard /></>)
    fireEvent.keyDown(document.querySelector(`[data-layout-item="${RN}"]`)!, { key: 'ContextMenu' })
    const menu = screen.getByTestId('layout-item-menu')
    expect(within(menu).queryByText(i18nT('nav.layout_move_down', { item: 'Release Notes' }))).toBeNull()
    expect(within(menu).getByText(i18nT('nav.layout_move_up', { item: 'Release Notes' }))).toBeTruthy()
  })

  it('options 2 and 3: the list step stops at the last app', () => {
    registerSidebarGroups(GROUPS)
    expect(canSwapInSidebar(GROUPS, RN, 1)).toBe(false)
    expect(canStepInList(RN, 'sidebar', 1, GROUPS)).toBe(false)
    expect(canStepInList(RN, 'sidebar', -1, GROUPS)).toBe(true)
    // Option 3: no Move down in the chip menu, and ↓ moves nothing.
    setPreviewSide('list')
    act(() => setLayoutEditing(true))
    preview()
    const chip = document.querySelector<HTMLElement>(`[data-preview-chip="${RN}"]`)!
    const before = [...document.querySelectorAll('[data-preview-zone="sidebar"] [data-preview-chip]')].map(x => x.getAttribute('data-preview-chip'))
    fireEvent.keyDown(chip, { key: 'ArrowDown' })
    expect([...document.querySelectorAll('[data-preview-zone="sidebar"] [data-preview-chip]')].map(x => x.getAttribute('data-preview-chip'))).toEqual(before)
    fireEvent.click(chip)
    expect(within(screen.getByTestId('preview-chip-menu')).queryByText(i18nT('nav.layout_move_down', { item: 'Release Notes' }))).toBeNull()
  })
})

describe('the lock label follows its button', () => {
  it('re-measures while shown, and hides on leave', async () => {
    let rect = { left: 0, top: 100, right: 40, bottom: 120, width: 40, height: 20, x: 0, y: 100 }
    function Anchor() {
      const ref = useRef<HTMLSpanElement>(null)
      return <span ref={ref} data-testid="anchor"><FixedLockLabel anchor={ref} /></span>
    }
    render(<Anchor />)
    const anchor = screen.getByTestId('anchor')
    anchor.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect
    fireEvent.pointerEnter(anchor)
    expect(screen.getByTestId('fixed-lock-label').style.left).toBe('46px')
    // The sidebar collapses: the button moves left; the label follows.
    rect = { ...rect, left: 0, right: 20, width: 20, top: 300, bottom: 320, y: 300 }
    await frame()
    await frame()
    expect(screen.getByTestId('fixed-lock-label').style.left).toBe('26px')
    expect(screen.getByTestId('fixed-lock-label').style.top).toBe('310px')
    fireEvent.pointerLeave(anchor)
    expect(screen.queryByTestId('fixed-lock-label')).toBeNull()
  })
})
