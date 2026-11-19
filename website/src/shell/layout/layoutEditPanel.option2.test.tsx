/**
 * Option 2, list only (round 1): the panel is the one place to edit. The
 * window behind is locked, Tiles cannot come back from a stored choice, rows
 * drag within the list with one landing line, and "You" has no Remove.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'

import { RailGroups } from '../nav/railGroups'
import { LayoutZoneOutlines } from './layoutZones'
import { setEditOption } from '../../lib/editOption'
import { SHELL_ITEM_MIME, isLayoutWindowLocked, setLayoutEditing } from '../../lib/shellLayout'
import { renderWithProviders } from '../../test/helpers'

const AVAILABLE = ['chat', 'members']
const LABELS: Record<string, string> = { chat: 'Sessions', members: 'Mates' }

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

afterEach(() => { act(() => setLayoutEditing(false)); localStorage.clear() })

describe('Edit layout option 2 (list only)', () => {
  it('locks the window while open and unlocks on Escape', async () => {
    openPanel()
    expect(isLayoutWindowLocked()).toBe(true)
    expect(screen.getByTestId('dashboard-shell').hasAttribute('inert')).toBe(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(isLayoutWindowLocked()).toBe(false))
    expect(screen.getByTestId('dashboard-shell').hasAttribute('inert')).toBe(false)
  })

  it('ignores a stored Tiles choice and has no Hide panel', () => {
    localStorage.setItem('mc-layout-panel-style', 'tiles')
    const panel = openPanel()
    expect(panel.getAttribute('data-panel-style')).toBeNull()
    expect(screen.queryByTestId('layout-tiles')).toBeNull()
    expect(within(panel).queryByRole('button', { name: 'Hide panel' })).toBeNull()
  })

  it('offers Move to but no Remove for You', async () => {
    const panel = openPanel()
    const row = within(panel).getByText('You').closest('li')!
    fireEvent.keyDown(within(row).getByRole('button', { name: 'Actions for You' }), { key: 'Enter' })
    const menu = await screen.findByTestId('layout-row-menu')
    expect(within(menu).getAllByRole('menuitem').some(m => /Move to/.test(m.textContent ?? ''))).toBe(true)
    expect(within(menu).queryByRole('menuitem', { name: 'Remove' })).toBeNull()
  })

  it('shows one landing line while a row is dragged over another', () => {
    const panel = openPanel()
    const sessions = panel.querySelector('[data-layout-row="chat"]')!
    const mates = panel.querySelector('[data-layout-row="members"]')!
    fireEvent.dragStart(sessions, { dataTransfer: dt('chat') })
    fireEvent.dragOver(mates, { dataTransfer: dt('chat'), clientY: 10 })
    expect(screen.getAllByTestId('layout-list-drop-line')).toHaveLength(1)
    fireEvent.drop(mates, { dataTransfer: dt('chat'), clientY: 10 })
    expect(screen.queryByTestId('layout-list-drop-line')).toBeNull()
  })

  it('leaves the window bars closed to drops (list only)', () => {
    const outline = (zone: string) => document.querySelector<HTMLElement>(`[data-layout-outline="${zone}"]`)!
    renderWithProviders(<LayoutZoneOutlines />)
    act(() => setLayoutEditing(true))
    act(() => { window.dispatchEvent(new Event('dragstart')) })
    expect(outline('top').style.pointerEvents).toBe('none')
    expect(outline('bottom').style.pointerEvents).toBe('none')
    // Option 1 still takes them, so the gate is option 2's alone.
    act(() => setEditOption('drag'))
    expect(outline('top').style.pointerEvents).toBe('auto')
    act(() => { window.dispatchEvent(new Event('dragend')) })
  })
})
