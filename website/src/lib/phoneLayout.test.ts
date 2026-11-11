/**
 * The phone's own layout: reorders and hides there change the phone only, on
 * top of the desktop layout, which never moves.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { forPhone, phoneBarIds, phoneHide, phoneShow, phoneStep, readPhoneLayout, resetPhoneLayout } from './phoneLayout'
import { FEEDBACK_ITEM, PHONE_ITEM, PROFILE_ITEM, SEARCH_ITEM, TERMINAL_ITEM, moveItem, readShellPlacement, resetShellLayout } from './shellLayout'

afterEach(() => { resetPhoneLayout(); resetShellLayout(); localStorage.clear() })

describe('phone layout', () => {
  it('keeps the desktop order until the phone reorders', () => {
    expect(forPhone(['a', 'b', 'c'], readPhoneLayout())).toEqual(['a', 'b', 'c'])
  })

  it('moves an item one step within its part, on the phone only', () => {
    moveItem('schedule', 'top')
    moveItem('artifacts', 'top')
    const part = forPhone(readShellPlacement().top, readPhoneLayout())
    expect(phoneStep(part, 'artifacts', -1)).toBe(true)
    expect(forPhone(readShellPlacement().top, readPhoneLayout())).toEqual(['artifacts', 'schedule'])
    // The desktop's top bar is unchanged.
    expect(readShellPlacement().top).toEqual(['schedule', 'artifacts'])
  })

  it('refuses a step past either end', () => {
    expect(phoneStep(['a', 'b'], 'a', -1)).toBe(false)
    expect(phoneStep(['a', 'b'], 'b', 1)).toBe(false)
  })

  it('hides on the phone without touching the desktop', () => {
    moveItem('schedule', 'top')
    phoneHide('schedule')
    expect(forPhone(readShellPlacement().top, readPhoneLayout())).toEqual([])
    expect(readShellPlacement().top).toEqual(['schedule'])
    phoneShow('schedule', true)
    expect(forPhone(readShellPlacement().top, readPhoneLayout())).toEqual(['schedule'])
    expect(readPhoneLayout().extra).toEqual([])
  })

  it('shows an item the desktop does not place at the end of the phone column', () => {
    phoneShow('members', false)
    expect(readPhoneLayout().extra).toEqual(['members'])
    phoneHide('members')
    expect(readPhoneLayout().extra).toEqual([])
  })

  it('leaves widgets and the drawer\'s own rows out of the bar items it adds', () => {
    expect(phoneBarIds([SEARCH_ITEM, PROFILE_ITEM, TERMINAL_ITEM, PHONE_ITEM, FEEDBACK_ITEM, 'schedule'])).toEqual([FEEDBACK_ITEM, 'schedule'])
  })
})
