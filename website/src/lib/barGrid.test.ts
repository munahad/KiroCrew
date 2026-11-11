/**
 * The bars' cell grid: items stay where they are dropped, gaps included, and
 * a drop onto taken cells pushes the items there aside.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { barOrder, cellOf, clearBarCells, placeOnBar, pushAside, readCells, resolveBar, setBarColumns, shiftOnBar } from './barGrid'
import { moveItem, readShellPlacement, resetShellLayout } from './shellLayout'

const one = () => 1
const sized = (m: Record<string, number>) => (id: string) => m[id] ?? 1

afterEach(() => { clearBarCells(); resetShellLayout(); localStorage.clear(); setBarColumns('top', 30); setBarColumns('bottom', 30) })

describe('resolveBar', () => {
  it('keeps each item at its stored cell, gaps included', () => {
    expect(resolveBar('top', ['a', 'b'], { a: 2, b: 10 }, one, 20)).toEqual({ a: 2, b: 10 })
  })

  it('puts an item with no cell at the right end of the top bar', () => {
    expect(resolveBar('top', ['a', 'b'], { a: 0 }, sized({ b: 3 }), 20)).toEqual({ a: 0, b: 17 })
  })

  it('puts an item with no cell after the last item of the bottom bar', () => {
    expect(resolveBar('bottom', ['a', 'b'], { a: 4 }, sized({ a: 3 }), 20)).toEqual({ a: 4, b: 7 })
  })

  it('packs against the edge when the bar gets too narrow, keeping the order', () => {
    expect(resolveBar('top', ['a', 'b'], { a: 0, b: 18 }, sized({ b: 4 }), 10)).toEqual({ a: 0, b: 6 })
  })
})

describe('pushAside', () => {
  it('moves an item to an empty spot without moving the others', () => {
    expect(pushAside('top', ['a', 'b', 'x'], { a: 0, b: 10 }, one, 20, 'x', 5)).toEqual({ a: 0, b: 10, x: 5 })
  })

  it('pushes items right of the drop further right', () => {
    const out = pushAside('top', ['a', 'b', 'x'], { a: 4, b: 5 }, one, 20, 'x', 3)
    // a's middle (4.5) is right of x's (3.5): a and b move right.
    expect(out).toEqual({ x: 3, a: 4, b: 5 })
    expect(pushAside('top', ['a', 'b', 'x'], { a: 4, b: 5 }, one, 20, 'x', 4)).toEqual({ x: 4, a: 5, b: 6 })
  })

  it('pushes items left of the drop further left', () => {
    expect(pushAside('top', ['a', 'b', 'x'], { a: 5, b: 6 }, sized({ x: 2 }), 20, 'x', 6)).toEqual({ a: 4, b: 5, x: 6 })
  })

  it('keeps the dropped item inside the bar', () => {
    expect(pushAside('top', ['x'], {}, sized({ x: 3 }), 10, 'x', 9)).toEqual({ x: 7 })
  })
})

describe('placing on a bar', () => {
  it('joins the bar at the dropped cell and saves every item\'s cell', () => {
    moveItem('schedule', 'top')
    placeOnBar('top', 'schedule', 3)
    placeOnBar('top', 'artifacts', 3)
    expect(readShellPlacement().top).toContain('artifacts')
    const cells = readCells('top')
    expect(cells.artifacts).toBe(3)
    expect(cells.schedule).not.toBe(3)
    const placed = barOrder('top').filter(id => id === 'schedule' || id === 'artifacts')
    expect(placed).toEqual(cells.schedule < 3 ? ['schedule', 'artifacts'] : ['artifacts', 'schedule'])
  })

  it('shifts one cell with the keyboard, and stops at the edge', () => {
    placeOnBar('top', 'schedule', 0)
    expect(shiftOnBar('top', 'schedule', -1)).toBe(false)
    expect(shiftOnBar('top', 'schedule', 1)).toBe(true)
    expect(cellOf('top', 'schedule')?.col).toBe(1)
  })
})
