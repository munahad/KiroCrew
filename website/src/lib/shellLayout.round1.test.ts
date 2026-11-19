import { afterEach, describe, expect, it } from 'vitest'

import {
  LOGO_ITEM, NOTIFY_ITEM, PROFILE_ITEM, REMOTE_ITEM, STATUS_ITEM, WIDGET_ITEMS, canRemove, isWidgetItem, moveItem, placesOf, readLogoShown,
  readPlace, resetShellLayout,
} from './shellLayout'

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

  it('keeps the Crews switcher fixed in the sidebar', () => {
    expect(isWidgetItem(REMOTE_ITEM)).toBe(false)
    expect(placesOf(REMOTE_ITEM)).toEqual([])
    moveItem(REMOTE_ITEM, 'top')
    expect(readPlace(REMOTE_ITEM)).toBe('sidebar')
  })

  it('moves notifications on their own, apart from status', () => {
    expect(WIDGET_ITEMS).toContain(NOTIFY_ITEM)
    const status = readPlace(STATUS_ITEM)
    moveItem(NOTIFY_ITEM, 'bottom')
    expect(readPlace(NOTIFY_ITEM)).toBe('bottom')
    expect(readPlace(STATUS_ITEM)).toBe(status)
  })

  it('makes the logo optional, in the sidebar or nowhere', () => {
    expect(readLogoShown()).toBe(true)
    moveItem(LOGO_ITEM, 'top')
    expect(readLogoShown()).toBe(true)
    moveItem(LOGO_ITEM, null)
    expect(readLogoShown()).toBe(false)
    moveItem(LOGO_ITEM, 'sidebar')
    expect(readLogoShown()).toBe(true)
  })
})
