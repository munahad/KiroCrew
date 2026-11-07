import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { ShellStatusBar } from './shellStatusBar'
import type { AppShell } from '../appShell'
import { PHONE_ITEM, TERMINAL_ITEM, moveItem, resetShellLayout, setLayoutEditing } from '../../lib/shellLayout'

const toggle = vi.hoisted(() => vi.fn())
vi.mock('../../hooks/useBottomTerminal', () => ({ toggleBottomTerminal: toggle }))

function shellWith(over: Partial<AppShell>): AppShell {
  return {
    terminalEnabled: true, terminalPoppedOut: false, bottomTerminalOpen: false, activeSlotProject: '/proj',
    hasRenderableMobileConnect: true, mobileConnectOpen: false, setMobileConnectOpen: vi.fn(),
    ...over,
  } as unknown as AppShell
}

const renderBar = (shell: AppShell) => render(<MemoryRouter><ShellStatusBar shell={shell} /></MemoryRouter>)

describe('ShellStatusBar', () => {
  beforeEach(() => resetShellLayout())
  afterEach(() => { setLayoutEditing(false); resetShellLayout() })

  it('ships empty: no items until the user places some', () => {
    renderBar(shellWith({}))
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('toggles the docked terminal and opens phone connect once they are placed there', () => {
    moveItem(TERMINAL_ITEM, 'bottom')
    moveItem(PHONE_ITEM, 'bottom')
    const setMobileConnectOpen = vi.fn()
    renderBar(shellWith({ setMobileConnectOpen }))
    expect(screen.getByRole('toolbar', { name: 'Bottom bar' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }))
    expect(toggle).toHaveBeenCalledWith('/proj')

    fireEvent.click(screen.getByRole('button', { name: 'Connect your phone' }))
    expect(setMobileConnectOpen).toHaveBeenCalledWith(true)
  })

  it('marks the terminal button pressed while the panel is open', () => {
    moveItem(TERMINAL_ITEM, 'bottom')
    renderBar(shellWith({ bottomTerminalOpen: true }))
    expect(screen.getByRole('button', { name: 'Terminal' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the empty bar on screen as a drop target while editing the layout', () => {
    setLayoutEditing(true)
    renderBar(shellWith({}))
    expect(screen.getByRole('toolbar', { name: 'Bottom bar' })).toBeInTheDocument()
  })
})
