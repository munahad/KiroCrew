/**
 * The bars' cell grid: items stay where they are dropped, gaps included, and
 * a drop onto taken cells pushes the items there aside.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { barOrder, canSwapOnBar, cellOf, clearBarCells, freeCellNear, placeOnBar, pushAside, readCells, resolveBar, setBarColumns, shiftOnBar, swapOnBar } from './barGrid'
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
    // Back/Forward (two cells) was pushed into the next cell: it swaps past it.
    expect(cellOf('top', 'schedule')?.col).toBe(2)
  })

  it('swaps past a neighbour in the next cell, so repeated presses reach the bar\'s end (note 14)', () => {
    setBarColumns('bottom', 10)
    moveItem('schedule', 'bottom')
    moveItem('artifacts', 'bottom')
    placeOnBar('bottom', 'schedule', 6)
    placeOnBar('bottom', 'artifacts', 9)
    // Packed against the right end before: a push could not move it.
    placeOnBar('bottom', 'schedule', 8)
    expect(cellOf('bottom', 'schedule')?.col).toBe(8)
    expect(shiftOnBar('bottom', 'schedule', 1)).toBe(true)
    expect(barOrder('bottom')).toEqual(['artifacts', 'schedule'])
    expect(cellOf('bottom', 'schedule')?.col).toBe(9)
    expect(cellOf('bottom', 'artifacts')?.col).toBe(8)
    // The real end: nothing further.
    expect(shiftOnBar('bottom', 'schedule', 1)).toBe(false)
    expect(shiftOnBar('bottom', 'schedule', -1)).toBe(true)
    expect(barOrder('bottom')).toEqual(['schedule', 'artifacts'])
  })

  it('steps past the next item, gaps skipped, for a list of the bar (options 2 and 3)', () => {
    setBarColumns('bottom', 10)
    moveItem('schedule', 'bottom')
    moveItem('artifacts', 'bottom')
    placeOnBar('bottom', 'schedule', 0)
    placeOnBar('bottom', 'artifacts', 5)
    expect(canSwapOnBar('bottom', 'schedule', -1)).toBe(false)
    expect(canSwapOnBar('bottom', 'schedule', 1)).toBe(true)
    expect(swapOnBar('bottom', 'schedule', 1)).toBe(true)
    expect(barOrder('bottom')).toEqual(['artifacts', 'schedule'])
    expect(canSwapOnBar('bottom', 'schedule', 1)).toBe(false)
  })

  it('finds the nearest free cell for an item put back (Undo, note 16)', () => {
    setBarColumns('bottom', 10)
    moveItem('schedule', 'bottom')
    moveItem('artifacts', 'bottom')
    placeOnBar('bottom', 'schedule', 4)
    expect(freeCellNear('bottom', 'artifacts', 2)).toBe(2)
    // Cell 4 is taken: the nearest free one, left first on a tie.
    expect(freeCellNear('bottom', 'artifacts', 4)).toBe(3)
  })
})
