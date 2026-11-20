import { afterEach, describe, expect, it } from 'vitest'

import {
  HISTORY_ITEM, LOGO_ITEM, NOTIFY_ITEM, PROFILE_ITEM, REMOTE_ITEM, STATUS_ITEM, WIDGET_ITEMS, canRemove, isWidgetItem, moveItem, placesOf, readLogoShown,
  readPlace, readShellPlacement, resetShellLayout, zoneOf,
} from './shellLayout'
import { barIds, barOrder } from './barGrid'

afterEach(() => { resetShellLayout(); localStorage.clear() })

describe('round 1 shared store rules', () => {
  it('never puts "You" in Not shown, but lets it move between areas', () => {
    expect(canRemove(PROFILE_ITEM)).toBe(false)
    expect(placesOf(PROFILE_ITEM)).not.toContain('none')
    moveItem(PROFILE_ITEM, null)
    expect(readPlace(PROFILE_ITEM)).toBe('sidebar')
    moveItem(PROFILE_ITEM, 'top')
    expect(readPlace(PROFILE_ITEM)).toBe('top')
    // A 'none' stored by an older build reads as the default.
    localStorage.setItem('mc-profile-place', 'none')
    expect(readPlace(PROFILE_ITEM)).toBe('sidebar')
  })

  it('starts the Crews switcher in the top bar, lets it move, and never removes it', () => {
    expect(isWidgetItem(REMOTE_ITEM)).toBe(true)
    expect(readPlace(REMOTE_ITEM)).toBe('top')
    expect(canRemove(REMOTE_ITEM)).toBe(false)
    expect(placesOf(REMOTE_ITEM)).toEqual(['sidebar', 'top', 'bottom'])
    moveItem(REMOTE_ITEM, 'sidebar')
    expect(readPlace(REMOTE_ITEM)).toBe('sidebar')
    moveItem(REMOTE_ITEM, 'bottom')
    expect(readPlace(REMOTE_ITEM)).toBe('bottom')
    moveItem(REMOTE_ITEM, null)
    expect(readPlace(REMOTE_ITEM)).toBe('bottom')
    // A 'none' stored by checkpoint 54 reads as its default spot.
    localStorage.setItem('mc-remote-place', 'none')
    expect(readPlace(REMOTE_ITEM)).toBe('top')
  })

  it('puts the Crews switcher back right after Back/Forward on Reset', () => {
    moveItem(REMOTE_ITEM, 'bottom')
    resetShellLayout()
    expect(barOrder('top').slice(0, 2)).toEqual([HISTORY_ITEM, REMOTE_ITEM])
  })

  it('moves notifications on their own, apart from status', () => {
    expect(WIDGET_ITEMS).toContain(NOTIFY_ITEM)
    const status = readPlace(STATUS_ITEM)
    moveItem(NOTIFY_ITEM, 'bottom')
    expect(readPlace(NOTIFY_ITEM)).toBe('bottom')
    expect(readPlace(STATUS_ITEM)).toBe(status)
  })

  it('lets the logo sit in the sidebar, the top bar or the bottom bar, or be removed', () => {
    expect(readLogoShown()).toBe(true)
    moveItem(LOGO_ITEM, 'top')
    expect(readLogoShown()).toBe(false)
    expect(zoneOf(LOGO_ITEM, readShellPlacement(), false)).toBe('top')
    expect(barIds('top')).toContain(LOGO_ITEM)
    moveItem(LOGO_ITEM, 'bottom')
    expect(zoneOf(LOGO_ITEM, readShellPlacement(), false)).toBe('bottom')
    expect(barIds('bottom')).toContain(LOGO_ITEM)
    expect(barIds('top')).not.toContain(LOGO_ITEM)
    moveItem(LOGO_ITEM, null)
    expect(zoneOf(LOGO_ITEM, readShellPlacement(), false)).toBeNull()
    moveItem(LOGO_ITEM, 'sidebar')
    expect(readLogoShown()).toBe(true)
  })
})
