/**
 * Checkpoint 56 (Munahad's test notes): option 1's Remove all on a bar's
 * right-click, controls for Back/Forward and the Crews switcher, the top bar's
 * "+", the logo moving between the sidebar and the top bar, Undo, the "+"
 * lists' contents, a drag that never sticks, and empty areas hiding.
 */
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

import { i18nT } from '../../i18n/t'
import { setEditOption } from '../../lib/editOption'
import { barIds } from '../../lib/barGrid'
import { readRailLayout } from '../../lib/railLayout'
import {
  FEATURE2_ITEM, FEEDBACK_ITEM, HISTORY_ITEM, LOGO_ITEM, NOTIFY_ITEM, PHONE_ITEM, PROFILE_ITEM, REMOTE_ITEM, SEARCH_ITEM, STATUS_ITEM,
  moveItem, readChromeDrag, readShellPlacement, resetShellLayout, setLayoutEditing, useAreaHasContent, zoneOf, type ShellZone,
} from '../../lib/shellLayout'
import { renderWithProviders } from '../../test/helpers'
import type { AppShell } from '../appShell'
import { RailHeader } from '../nav/railChrome'
import { notShownFor, registerShellApps } from './areaAdd'
import { useBarContextMenu } from './barContextMenu'
import { BarGrid } from './barGridView'
import { startItemDrag, zoneLabel } from './barItems'
import { DragOnlyBar, hideFromCanvas, readRemovedStack, undoRemove } from './dragOnlyEdit'
import { ItemMoreButton, LayoutItemKeyboard } from './keyboardMove'
import { useNativeDragging } from './layoutZones'

const where = (id: string) => zoneOf(id, readShellPlacement(), false)

afterEach(() => {
  cleanup()
  act(() => setLayoutEditing(false))
  resetShellLayout()
  localStorage.clear()
})

function editOption1() {
  setEditOption('drag')
  act(() => setLayoutEditing(true))
}

function Bar({ zone }: { zone: 'top' | 'bottom' }) {
  const m = useBarContextMenu(zone, false)
  return <div data-testid={`bar-${zone}`} {...m.props}>{m.menu}</div>
}

describe('note 2: Remove all from a bar, on its right-click', () => {
  it('offers Remove all from Top bar beside Edit layout, and keeps You and the Crews switcher', () => {
    moveItem(PROFILE_ITEM, 'top')
    render(<Bar zone="top" />)
    fireEvent.contextMenu(screen.getByTestId('bar-top'))
    const menu = screen.getByTestId('bar-context-menu')
    expect(within(menu).getByText(i18nT('nav.rail_customize'))).toBeTruthy()
    fireEvent.click(within(menu).getByText(i18nT('nav.layout_remove_all_from', { place: zoneLabel('top') })))
    expect(barIds('top').sort()).toEqual([PROFILE_ITEM, REMOTE_ITEM].sort())
  })
})

describe('note 4: Back/Forward and the Crews switcher have controls in option 1', () => {
  it('draws arrows and ⋯; the switcher can move but has no Remove', () => {
    editOption1()
    render(<><ItemMoreButton id={HISTORY_ITEM} zone="top" label="Back and forward" inline /><ItemMoreButton id={REMOTE_ITEM} zone="top" label="Crews" inline /><LayoutItemKeyboard /></>)
    expect(screen.getByRole('button', { name: i18nT('nav.layout_kbd_menu', { item: 'Back and forward' }) })).toBeTruthy()
    expect(screen.getByRole('button', { name: i18nT('nav.layout_move_right', { item: 'Crews' }) })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: i18nT('nav.layout_kbd_menu', { item: 'Crews' }) }))
    const menu = screen.getByTestId('layout-item-menu')
    expect(within(menu).getByText(i18nT('nav.layout_kbd_move_to', { place: zoneLabel('sidebar') }))).toBeTruthy()
    expect(within(menu).queryByText(i18nT('nav.layout_kbd_remove'))).toBeNull()
  })
})

const shell = {
  allAppGroup: [], terminalEnabled: false, hasRenderableMobileConnect: false, slotOwners: {}, avatar: '',
  commandPalette: { openPalette: () => {} },
} as unknown as AppShell

describe('note 5 and 3: every bar shows its "+" in option 1, and controls sit inside the bar', () => {
  it('draws the top bar\'s "+" and each item\'s ⋯ inside its own cell', () => {
    editOption1()
    renderWithProviders(<BarGrid zone="top" shell={shell} renderStatus={() => <span>status</span>} />)
    expect(screen.getByTestId('layout-area-add-top')).toBeTruthy()
    const cell = document.querySelector(`[data-bar-item="${HISTORY_ITEM}"]`)!
    expect(within(cell as HTMLElement).getByTestId('layout-item-more')).toBeTruthy()
  })
})

describe('note 6: the logo in option 1', () => {
  it('has a handle and ⋯ with Move to Top bar and Remove, then moves and removes', () => {
    editOption1()
    render(<><RailHeader effectiveCollapsed={false} toggleNav={() => {}} avatar="" branding={undefined as never} botName="Kiro Crew" showLogo /><LayoutItemKeyboard /></>)
    const item = screen.getByTestId('sidebar-logo-item')
    expect(item.querySelector('[draggable="true"]')).not.toBeNull()
    fireEvent.click(within(item).getByRole('button', { name: i18nT('nav.layout_kbd_menu', { item: i18nT('nav.layout_locked_logo') }) }))
    let menu = screen.getByTestId('layout-item-menu')
    expect(within(menu).queryByText(i18nT('nav.layout_kbd_move_to', { place: zoneLabel('bottom') }))).toBeNull()
    fireEvent.click(within(menu).getByText(i18nT('nav.layout_kbd_move_to', { place: zoneLabel('top') })))
    expect(where(LOGO_ITEM)).toBe('top')
    moveItem(LOGO_ITEM, 'sidebar')
    fireEvent.click(within(screen.getByTestId('sidebar-logo-item')).getByRole('button', { name: i18nT('nav.layout_kbd_menu', { item: i18nT('nav.layout_locked_logo') }) }))
    menu = screen.getByTestId('layout-item-menu')
    fireEvent.click(within(menu).getByText(i18nT('nav.layout_kbd_remove')))
    expect(where(LOGO_ITEM)).toBeNull()
    expect(notShownFor('top').map(x => x.id)).toContain(LOGO_ITEM)
    expect(notShownFor('bottom').map(x => x.id)).not.toContain(LOGO_ITEM)
  })
})

describe('note 8: Undo in option 1', () => {
  it('puts removed items back one at a time, newest first, each in its old spot, and clears on Done', () => {
    editOption1()
    render(<DragOnlyBar />)
    act(() => { hideFromCanvas(SEARCH_ITEM); hideFromCanvas(NOTIFY_ITEM) })
    expect(screen.getByTestId('drag-only-undo').textContent).toContain(i18nT('nav.layout_removed_short', { item: i18nT('nav.layout_notifications_item') }))
    act(() => { fireEvent.keyDown(window, { key: 'z', metaKey: true }) })
    expect(where(NOTIFY_ITEM)).toBe('top')
    expect(where(SEARCH_ITEM)).toBeNull()
    act(() => { fireEvent.click(within(screen.getByTestId('drag-only-undo')).getByText(i18nT('nav.layout_undo'))) })
    expect(where(SEARCH_ITEM)).toBe('top')
    act(() => { hideFromCanvas(STATUS_ITEM) })
    act(() => setLayoutEditing(false))
    expect(readRemovedStack()).toHaveLength(0)
    expect(undoRemove()).toBe(false)
  })
})

describe('note 10: the "+" lists never offer what the You menu holds', () => {
  it('lists Task Runner, Design Critique, Dev Fleet and Feature 2, never phone or feedback', () => {
    registerShellApps([{ id: 'projects', label: 'Task Runner', icon: <span /> }], false)
    for (const zone of ['top', 'sidebar', 'bottom'] as ShellZone[]) {
      const ids = notShownFor(zone).map(x => x.id)
      expect(ids).not.toContain(PHONE_ITEM)
      expect(ids).not.toContain(FEEDBACK_ITEM)
      expect(ids).toEqual(expect.arrayContaining(['projects', 'demo-app:design-critique', 'demo-app:dev-fleet', FEATURE2_ITEM]))
    }
    const kinds = Object.fromEntries(notShownFor('top').map(x => [x.id, x.kind]))
    expect(kinds['demo-app:dev-fleet']).toBe(i18nT('nav.layout_cat_apps'))
    expect(kinds[FEATURE2_ITEM]).toBe(i18nT('nav.layout_cat_tools'))
    registerShellApps([], false)
  })
})

function DragProbe() {
  const native = useNativeDragging()
  return <span data-testid="native">{String(native)}</span>
}

describe('note 11: a drag or removal never leaves the bars stuck', () => {
  it('ends the drag on the next pointer move even when the dragged item unmounted', () => {
    render(<DragProbe />)
    const el = document.createElement('div')
    document.body.appendChild(el)
    const data = new Map<string, string>()
    const e = { currentTarget: el, target: el, dataTransfer: { setData: (k: string, v: string) => data.set(k, v), effectAllowed: '', setDragImage: () => {} } } as never
    act(() => { startItemDrag(e, SEARCH_ITEM); window.dispatchEvent(new Event('dragstart')) })
    expect(readChromeDrag().id).toBe(SEARCH_ITEM)
    expect(screen.getByTestId('native').textContent).toBe('true')
    el.remove()
    act(() => { window.dispatchEvent(new Event('pointermove')) })
    expect(readChromeDrag().id).toBeNull()
    expect(screen.getByTestId('native').textContent).toBe('false')
  })

  it('empties the top bar completely in option 1, except You and the Crews switcher', () => {
    editOption1()
    for (const id of barIds('top')) act(() => hideFromCanvas(id))
    expect(barIds('top')).toEqual([REMOTE_ITEM])
    moveItem(REMOTE_ITEM, 'sidebar')
    expect(barIds('top')).toEqual([])
  })
})

function Areas() {
  const top = useAreaHasContent('top'), side = useAreaHasContent('sidebar'), bottom = useAreaHasContent('bottom')
  return <span data-testid="areas">{`${top} ${side} ${bottom}`}</span>
}

describe('note 12: empty areas hide', () => {
  it('reports the bottom bar empty by default, and the top bar empty once cleared', () => {
    render(<Areas />)
    expect(screen.getByTestId('areas').textContent).toBe('true true false')
    act(() => {
      for (const id of barIds('top')) moveItem(id, id === REMOTE_ITEM ? 'sidebar' : null)
    })
    expect(screen.getByTestId('areas').textContent).toBe('false true false')
    act(() => moveItem(SEARCH_ITEM, 'bottom'))
    expect(screen.getByTestId('areas').textContent).toBe('false true true')
  })

  it('counts the sidebar empty only when it holds nothing, the collapse button aside', () => {
    render(<Areas />)
    act(() => {
      moveItem(LOGO_ITEM, null)
      moveItem(PROFILE_ITEM, 'top')
      for (const g of readRailLayout().groups) for (const id of g.items) moveItem(id, null)
      for (const id of readShellPlacement().side) moveItem(id, null)
    })
    expect(screen.getByTestId('areas').textContent.split(' ')[1]).toBe('false')
  })
})
