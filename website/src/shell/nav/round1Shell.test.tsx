/**
 * Round 1 shared shell: the collapse button works with the logo removed, and
 * rows that do not fit the sidebar go into a "More" panel.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { RailHeader } from './railChrome'
import { SidebarColumn } from './sidebarColumn'
import { forwardBarContextMenu } from '../layout/barContextMenu'
import { i18nT } from '../../i18n/t'

afterEach(() => { cleanup(); localStorage.clear() })

describe('RailHeader without the logo', () => {
  it('still offers a working expand button when collapsed', () => {
    const toggleNav = vi.fn()
    render(<RailHeader effectiveCollapsed toggleNav={toggleNav} avatar="" branding={undefined as never} botName="Kiro Crew" showLogo={false} />)
    expect(document.querySelector('[data-layout-logo]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: i18nT('app.expand_sidebar') }))
    expect(toggleNav).toHaveBeenCalledTimes(1)
  })

  it('draws the logo and the collapse button separately when shown', () => {
    render(<RailHeader effectiveCollapsed={false} toggleNav={() => {}} avatar="" branding={undefined as never} botName="Kiro Crew" showLogo />)
    expect(document.querySelector('[data-layout-logo]')).not.toBeNull()
    expect(screen.getByRole('button', { name: i18nT('app.collapse_sidebar') })).toBeTruthy()
  })
})

describe('top bar right-click outside its item grid', () => {
  it('is handed to the bar grid, so its menu opens there', () => {
    const onGrid = vi.fn()
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div onContextMenu={forwardBarContextMenu}>
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div data-bar-grid="top" onContextMenu={onGrid} />
        <span>fixed end group</span>
      </div>,
    )
    fireEvent.contextMenu(screen.getByText('fixed end group'))
    expect(onGrid).toHaveBeenCalledTimes(1)
  })
})

describe('SidebarColumn overflow', () => {
  it('puts rows that do not fit into More, which opens a panel', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    // 4 rows of the default 34px pitch fit above the 24px bottom padding.
    const frame = document.createElement('div')
    frame.setAttribute('data-sidebar-scroll', '')
    Object.defineProperty(frame, 'clientHeight', { value: 34 * 4 + 24 })
    document.body.appendChild(frame)
    render(
      <SidebarColumn
        groups={[{ id: 'workspace', items: ids }]}
        collapsed={false}
        labelOf={id => id}
        groupTitle={() => 'Main list'}
        renderHeader={() => null}
        renderRow={id => <button type="button">{`row ${id}`}</button>}
      />,
      { container: frame },
    )
    // Three rows, then More in the fourth.
    expect(screen.getByText('row c')).toBeTruthy()
    expect(screen.queryByText('row d')).toBeNull()
    const more = screen.getByTestId('sidebar-more')
    fireEvent.click(more.querySelector('button')!)
    const panel = screen.getByTestId('sidebar-more-panel')
    expect(panel.textContent).toContain('row d')
    expect(panel.textContent).toContain('row g')
    frame.remove()
  })
})
