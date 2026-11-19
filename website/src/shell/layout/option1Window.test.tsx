/**
 * Edit layout, option 1 (on the window), round 1: each row shows its own
 * arrows and "⋯" (each a Tab stop), the area "+" adds a not shown item, a
 * drop on the page never hides, and option 2 locks the window.
 */
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { SidebarColumn } from '../nav/sidebarColumn'
import { setEditOption } from '../../lib/editOption'
import { SEARCH_ITEM, moveItem, readPlace, resetShellLayout, setLayoutEditing } from '../../lib/shellLayout'
import { i18nT } from '../../i18n/t'
import { PageHideZone, pageHideZoneAt } from './dragOnlyEdit'
import { notShownFor } from './areaAdd'

afterEach(() => {
  cleanup()
  act(() => setLayoutEditing(false))
  resetShellLayout()
  localStorage.clear()
})

function column() {
  return render(
    <SidebarColumn
      groups={[{ id: 'workspace', items: ['a', 'b'] }]}
      collapsed={false}
      labelOf={id => `Item ${id}`}
      groupTitle={() => 'Main list'}
      renderHeader={() => null}
      renderRow={id => <span>{`row ${id}`}</span>}
    />,
  )
}

describe('option 1: on the window', () => {
  it('gives each row named arrows and a ⋯ in the Tab order, off at the ends', () => {
    setEditOption('drag')
    act(() => setLayoutEditing(true))
    column()
    const up = screen.getByRole('button', { name: i18nT('nav.layout_move_up', { item: 'Item a' }) })
    const down = screen.getByRole('button', { name: i18nT('nav.layout_move_down', { item: 'Item a' }) })
    expect(up.tabIndex).toBe(0)
    expect((up as HTMLButtonElement).disabled).toBe(true)
    expect((down as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole('button', { name: i18nT('nav.layout_kbd_menu', { item: 'Item b' }) })).toBeTruthy()
    // The controls sit beside the item, never inside its own button.
    const item = document.querySelector('[data-layout-item="a"]')!
    expect(item.contains(up)).toBe(false)
  })

  it('shows a "+" for the sidebar while editing', () => {
    setEditOption('drag')
    act(() => setLayoutEditing(true))
    column()
    expect(screen.getByTestId('layout-area-add-sidebar')).toBeTruthy()
  })

  it('lists a removed item under the area "+" and no longer once placed', () => {
    moveItem(SEARCH_ITEM, null)
    expect(notShownFor('top').map(x => x.id)).toContain(SEARCH_ITEM)
    moveItem(SEARCH_ITEM, 'top')
    expect(readPlace(SEARCH_ITEM)).toBe('top')
    expect(notShownFor('top').map(x => x.id)).not.toContain(SEARCH_ITEM)
  })

  it('never hides an item dropped on the page', () => {
    setEditOption('drag')
    act(() => setLayoutEditing(true))
    render(<PageHideZone />)
    expect(pageHideZoneAt(10, 10)).toBe(false)
    const page = document.querySelector<HTMLElement>('[data-layout-outline="page"]')!
    expect(page.style.pointerEvents).toBe('none')
    fireEvent.drop(page)
    expect(page.textContent).toBe(i18nT('nav.layout_preview_page'))
  })
})

describe('option 2 locks the window', () => {
  it('draws rows that cannot be dragged, focused or edited, with no controls', () => {
    setEditOption('panel')
    act(() => setLayoutEditing(true))
    column()
    const row = document.querySelector('[data-column-row="a"]')!
    expect(row.querySelector('[draggable="true"]')).toBeNull()
    expect(row.querySelector('[tabindex="0"]')).toBeNull()
    expect(screen.queryByTestId('layout-item-more')).toBeNull()
    expect(screen.queryByTestId('layout-area-add-sidebar')).toBeNull()
  })
})
