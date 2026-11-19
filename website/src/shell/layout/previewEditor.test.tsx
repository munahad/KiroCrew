/**
 * Option 3 (Drag in a preview): Remove all shows only on a bar with two or
 * more removable items, and the drawing follows the round 1 shell rules
 * (fixed Crews switcher and collapse button, an optional logo, "You" never
 * removed, the bell on its own).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

import { i18nT } from '../../i18n/t'
import {
  LOGO_ITEM, NOTIFY_ITEM, PROFILE_ITEM, SEARCH_ITEM, STATUS_ITEM, moveItem, readShellPlacement, zoneOf, type ShellZone,
} from '../../lib/shellLayout'
import { zoneLabel } from './barItems'
import { PreviewEditor } from './previewEditor'
import type { Candidate } from './layoutEditPanel'

afterEach(() => { cleanup(); localStorage.clear() })

const ITEMS: [string, string][] = [
  [SEARCH_ITEM, 'Search'], [STATUS_ITEM, 'Status'], [NOTIFY_ITEM, 'Notifications'], [PROFILE_ITEM, 'You'], [LOGO_ITEM, 'Logo'],
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
})

describe('PreviewEditor drawing', () => {
  it('draws the Crews switcher and collapse button fixed, and the bell as its own chip', () => {
    renderEditor()
    const side = zone('sidebar')
    expect(side.querySelector('[data-preview-fixed="crews"]')).not.toBeNull()
    expect(side.querySelector('[data-preview-fixed="collapse"]')).not.toBeNull()
    expect(side.querySelector('[data-preview-fixed] button')).toBeNull()
    expect(within(zone('top')).getByRole('button', { name: 'Notifications' })).toBeTruthy()
  })

  it('offers the logo only Remove, and lists it as Not shown once removed', () => {
    renderEditor()
    fireEvent.click(within(zone('sidebar')).getByRole('button', { name: 'Logo' }))
    const menu = screen.getByTestId('preview-chip-menu')
    expect(within(menu).queryByText(i18nT('nav.layout_kbd_move_to', { place: zoneLabel('top') }))).toBeNull()
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
})
