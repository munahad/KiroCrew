/**
 * The sidebar's row grid: rows stay where they are dropped, gaps included,
 * status and "You" start at the bottom, and groups follow their titles.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { PROFILE_ITEM, STATUS_ITEM } from './shellLayout'
import { clearSidebarRows, columnIdsOf, headerId, pushAsideInColumn, regroupFlat, resolveColumn } from './sidebarGrid'

afterEach(() => { clearSidebarRows(); localStorage.clear() })

describe('resolveColumn', () => {
  it('packs rows from the top and puts status and You at the bottom', () => {
    expect(resolveColumn(['a', 'b', STATUS_ITEM, PROFILE_ITEM], {}, 10)).toEqual({ a: 0, b: 1, [STATUS_ITEM]: 8, [PROFILE_ITEM]: 9 })
  })

  it('keeps a stored row, leaving the gap above it', () => {
    expect(resolveColumn(['a', 'b'], { a: 0, b: 7 }, 10)).toEqual({ a: 0, b: 7 })
  })

  it('grows past the frame when there are more rows than fit', () => {
    expect(resolveColumn(['a', 'b', 'c'], {}, 2)).toEqual({ a: 0, b: 1, c: 2 })
  })
})

describe('pushAsideInColumn', () => {
  it('moves You to the very bottom, leaving the rows above where they were', () => {
    expect(pushAsideInColumn(['a', PROFILE_ITEM], { a: 0, [PROFILE_ITEM]: 1 }, 10, PROFILE_ITEM, 9)).toEqual({ a: 0, [PROFILE_ITEM]: 9 })
  })

  it('pushes the row it lands on, and those touching it, down', () => {
    expect(pushAsideInColumn(['a', 'b', 'x'], { a: 2, b: 3, x: 0 }, 10, 'x', 2)).toEqual({ x: 2, a: 3, b: 4 })
  })

  it('pushes rows up when the bottom is full', () => {
    expect(pushAsideInColumn(['a', 'b', 'x'], { a: 3, b: 4, x: 0 }, 5, 'x', 4)).toEqual({ a: 2, b: 3, x: 4 })
  })
})

describe('regroupFlat', () => {
  it('puts each row in the group whose title is above it', () => {
    const groups = [{ id: 'workspace', items: ['a', 'b'] }, { id: 'g2', title: 'Mine', items: ['c'] }]
    expect(columnIdsOf(groups)).toEqual(['a', 'b', headerId('g2'), 'c'])
    const out = regroupFlat(['a', headerId('g2'), 'b', 'c'], groups)
    expect(out.map(g => g.items)).toEqual([['a'], ['b', 'c']])
  })
})
