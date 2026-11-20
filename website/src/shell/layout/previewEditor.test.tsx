/**
 * Option 3 (Drag in a preview): Remove all shows only on a bar with two or
 * more removable items, and the drawing follows the round 1 shell rules
 * (a fixed collapse button, a move-only Crews switcher, an optional logo, "You" never
 * removed, the bell on its own).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'

import { i18nT } from '../../i18n/t'
import { readEditOption, requestEditOption, setEditOption, setPreviewSide } from '../../lib/editOption'
import {
  LOGO_ITEM, NOTIFY_ITEM, PROFILE_ITEM, REMOTE_ITEM, SEARCH_ITEM, STATUS_ITEM, isLayoutEditing, moveItem, readShellPlacement, setLayoutEditing, zoneOf, type ShellZone,
} from '../../lib/shellLayout'
import { zoneLabel } from './barItems'
import { PreviewEditor } from './previewEditor'
import type { Candidate } from './layoutEditPanel'

// These tests cover the List side; checkpoint 59's Palette is in checkpoint59.test.tsx.
beforeEach(() => setPreviewSide('list'))
afterEach(() => { cleanup(); localStorage.clear() })

const ITEMS: [string, string][] = [
  [SEARCH_ITEM, 'Search'], [STATUS_ITEM, 'Status'], [NOTIFY_ITEM, 'Notifications'], [PROFILE_ITEM, 'You'], [LOGO_ITEM, 'Logo'], [REMOTE_ITEM, 'Crews'],
]
const candidates: Candidate[] = ITEMS.map(([id, label]) => ({ id, category: 'tools', meta: { label, icon: <span /> } }) as Candidate)
const where = (id: string): ShellZone | 'none' => zoneOf(id, readShellPlacement(), false) ?? 'none'

function renderEditor() {
  return render(
    <PreviewEditor
      candidates={candidates}
      columnOf={() => 'builtin'}
      categoryLabel={() => 'Tools'}
      repeated={new Set()}
      groups={[{ id: 'workspace', items: [PROFILE_ITEM] }]}
      where={where}
      place={(id, to) => moveItem(id, to === 'none' ? null : to)}
      reset={() => {}}
      announcement=""
    />,
  )
}
const zone = (z: ShellZone) => document.querySelector<HTMLElement>(`[data-preview-zone="${z}"]`)!
const removeAll = (z: ShellZone) => within(zone(z)).queryByRole('button', { name: i18nT('nav.layout_preview_clear_area') })

describe('PreviewEditor Remove all', () => {
  it('shows on a bar with two or more items, and not on an empty bar', () => {
    // Under the test runner search, status and the bell start in the top bar.
    renderEditor()
    expect(removeAll('top')).not.toBeNull()
    expect(removeAll('bottom')).toBeNull()
  })

  it('is hidden on a bar with a single item', () => {
    moveItem(STATUS_ITEM, null)
    moveItem(NOTIFY_ITEM, null)
    renderEditor()
    expect(within(zone('top')).getByRole('button', { name: 'Search' })).toBeTruthy()
    expect(removeAll('top')).toBeNull()
  })

  it('does not count "You", which cannot be removed', () => {
    moveItem(STATUS_ITEM, null)
    moveItem(NOTIFY_ITEM, null)
    moveItem(PROFILE_ITEM, 'top')
    renderEditor()
    expect(removeAll('top')).toBeNull()
  })

  it('does not count or remove the Crews switcher', () => {
    renderEditor()
    fireEvent.click(removeAll('top')!)
    expect(where(REMOTE_ITEM)).toBe('top')
    expect(where(SEARCH_ITEM)).toBe('none')
  })
})

describe('PreviewEditor drawing', () => {
  it('draws the collapse button fixed, no fixed Crews switcher, and the bell as its own chip', () => {
    // Expanded: the collapse button always shows (checkpoint 57).
    localStorage.setItem('mc-nav', '0')
    renderEditor()
    const side = zone('sidebar')
    expect(side.querySelector('[data-preview-fixed="crews"]')).toBeNull()
    expect(side.querySelector('[data-preview-fixed="collapse"]')).not.toBeNull()
    expect(side.querySelector('[data-preview-fixed] button')).toBeNull()
    expect(within(zone('top')).getByRole('button', { name: 'Notifications' })).toBeTruthy()
  })

  it('draws the logo in the sidebar head, moves it to the top bar, the bottom bar and back', () => {
    renderEditor()
    fireEvent.click(within(zone('sidebar')).getByRole('button', { name: 'Logo' }))
    let menu = screen.getByTestId('preview-chip-menu')
    fireEvent.click(within(menu).getByText(i18nT('nav.layout_kbd_move_to', { place: zoneLabel('bottom') })))
    expect(where(LOGO_ITEM)).toBe('bottom')
    fireEvent.click(within(zone('bottom')).getByRole('button', { name: 'Logo' }))
    menu = screen.getByTestId('preview-chip-menu')
    fireEvent.click(within(menu).getByText(i18nT('nav.layout_kbd_move_to', { place: zoneLabel('top') })))
    expect(where(LOGO_ITEM)).toBe('top')
    const chip = within(zone('top')).getByRole('button', { name: 'Logo' })
    expect(chip.getAttribute('draggable')).toBe('true')
    fireEvent.click(chip)
    menu = screen.getByTestId('preview-chip-menu')
    fireEvent.click(within(menu).getByText(i18nT('nav.layout_kbd_move_to', { place: zoneLabel('sidebar') })))
    expect(where(LOGO_ITEM)).toBe('sidebar')
  })

  it('offers the logo Remove, and lists it as Not shown once removed', () => {
    renderEditor()
    fireEvent.click(within(zone('sidebar')).getByRole('button', { name: 'Logo' }))
    const menu = screen.getByTestId('preview-chip-menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: i18nT('nav.layout_kbd_remove') }))
    expect(within(zone('sidebar')).queryByRole('button', { name: 'Logo' })).toBeNull()
    expect(document.querySelector('[data-preview-group="none"] [data-preview-row="shell:logo"]')).not.toBeNull()
  })

  it('gives "You" no Remove in its menu and no Hide in the list', () => {
    renderEditor()
    fireEvent.click(within(zone('sidebar')).getByRole('button', { name: 'You' }))
    expect(within(screen.getByTestId('preview-chip-menu')).queryByRole('menuitem', { name: i18nT('nav.layout_kbd_remove') })).toBeNull()
    const row = document.querySelector<HTMLElement>(`[data-preview-row="${PROFILE_ITEM}"]`)!
    expect(within(row).queryByRole('button', { name: i18nT('nav.layout_preview_hide_item', { item: 'You' }) })).toBeNull()
  })

  it('lets the Crews switcher move but not be removed, by menu or Delete', () => {
    renderEditor()
    const chip = within(zone('top')).getByRole('button', { name: 'Crews' })
    fireEvent.click(chip)
    const menu = screen.getByTestId('preview-chip-menu')
    expect(within(menu).queryByRole('menuitem', { name: i18nT('nav.layout_kbd_remove') })).toBeNull()
    fireEvent.keyDown(chip, { key: 'Delete' })
    expect(where(REMOTE_ITEM)).toBe('top')
    fireEvent.click(within(screen.getByTestId('preview-chip-menu')).getByRole('menuitem', { name: i18nT('nav.layout_kbd_move_to', { place: zoneLabel('bottom') }) }))
    expect(where(REMOTE_ITEM)).toBe('bottom')
  })
})

describe('PreviewEditor switching option in the band', () => {
  const removeStatus = () => {
    fireEvent.click(within(zone('top')).getByRole('button', { name: 'Status' }))
    fireEvent.click(within(screen.getByTestId('preview-chip-menu')).getByRole('menuitem', { name: i18nT('nav.layout_kbd_remove') }))
    expect(zoneOf(STATUS_ITEM, readShellPlacement(), false)).toBeNull()
  }
  const prompt = () => screen.queryByRole('alertdialog')
  const start = () => { setEditOption('preview'); setLayoutEditing(true); return renderEditor() }
  afterEach(() => setLayoutEditing(false))

  it('switches straight away with no changes', () => {
    start()
    act(() => requestEditOption('drag'))
    expect(prompt()).toBeNull()
    expect(readEditOption()).toBe('drag')
  })

  it('asks first with changes; Keep editing stays in option 3', () => {
    start()
    removeStatus()
    act(() => requestEditOption('drag'))
    expect(prompt()).not.toBeNull()
    expect(readEditOption()).toBe('preview')
    fireEvent.click(screen.getByRole('button', { name: i18nT('nav.layout_preview_keep_editing') }))
    expect(prompt()).toBeNull()
    expect(readEditOption()).toBe('preview')
    // Escape on the prompt also stays, and a later Done does not switch.
    act(() => requestEditOption('panel'))
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(prompt()).toBeNull()
    expect(readEditOption()).toBe('preview')
  })

  it('Discard puts the layout back, then switches and stays in edit mode', () => {
    start()
    removeStatus()
    act(() => requestEditOption('drag'))
    fireEvent.click(screen.getByRole('button', { name: i18nT('nav.layout_preview_discard') }))
    expect(readEditOption()).toBe('drag')
    expect(zoneOf(STATUS_ITEM, readShellPlacement(), false)).toBe('top')
    expect(isLayoutEditing()).toBe(true)
  })

  it('Keep holds the changes, then switches', () => {
    const { unmount } = start()
    removeStatus()
    act(() => requestEditOption('drag'))
    fireEvent.click(screen.getByRole('button', { name: i18nT('nav.layout_preview_keep') }))
    expect(readEditOption()).toBe('drag')
    unmount()
    expect(zoneOf(STATUS_ITEM, readShellPlacement(), false)).toBeNull()
  })

  it('puts the layout back when it closes without asking (the phone)', () => {
    const { unmount } = start()
    removeStatus()
    unmount()
    expect(zoneOf(STATUS_ITEM, readShellPlacement(), false)).toBe('top')
    // With the editor gone, the band switches freely again.
    requestEditOption('drag')
    expect(readEditOption()).toBe('drag')
  })
})
