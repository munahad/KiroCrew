/**
 * Where a drop lands in a bar part: between the items already there, by the
 * pointer's x, with the bar's fixed-spot widgets ("You", status) not counted
 * as gaps.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { PROFILE_ITEM, moveItem, readShellPlacement, resetShellLayout, setZoneSlot, zoneDropAt } from './shellLayout'

/** A bar outline 300px wide, and one part holding items at the given x ranges. */
function drawBar(slot: 'left' | 'center' | 'right', items: { id: string; left: number; width: number }[]) {
  const outline = document.createElement('div')
  outline.dataset.layoutOutline = 'top'
  outline.getBoundingClientRect = () => ({ left: 0, right: 300, width: 300, top: 0, bottom: 40, height: 40, x: 0, y: 0, toJSON: () => ({}) })
  const part = document.createElement('div')
  part.dataset.layoutZone = 'top'
  part.dataset.topSlot = slot
  for (const it of items) {
    const el = document.createElement('button')
    el.dataset.barItem = it.id
    el.getBoundingClientRect = () => ({ left: it.left, right: it.left + it.width, width: it.width, top: 4, bottom: 32, height: 28, x: it.left, y: 4, toJSON: () => ({}) })
    part.appendChild(el)
  }
  document.body.append(outline, part)
}

afterEach(() => { document.body.innerHTML = ''; resetShellLayout(); localStorage.clear() })

describe('zoneDropAt', () => {
  it('lands between two items in the same part', () => {
    moveItem('schedule', 'top')
    moveItem('artifacts', 'top')
    setZoneSlot('top', 'schedule', 'right')
    setZoneSlot('top', 'artifacts', 'right')
    drawBar('right', [{ id: 'schedule', left: 210, width: 28 }, { id: 'artifacts', left: 250, width: 28 }])
    // Between the two items' centres (224 and 264).
    const t = zoneDropAt('top', 245, 'members')
    expect(t.slot).toBe('right')
    expect(t.index).toBe(readShellPlacement().top.indexOf('artifacts'))
    expect(t.lineX).toBe(248)
  })

  it('does not count a fixed-spot widget drawn in the same part as a gap', () => {
    moveItem('schedule', 'top')
    moveItem('artifacts', 'top')
    // "You" is drawn first in the right part but is not one of the placed items.
    drawBar('right', [{ id: PROFILE_ITEM, left: 205, width: 20 }, { id: 'schedule', left: 230, width: 28 }, { id: 'artifacts', left: 265, width: 28 }])
    const t = zoneDropAt('top', 262, 'members')
    // Lands before Artifacts, not one spot later.
    expect(t.index).toBe(readShellPlacement().top.indexOf('artifacts'))
  })

  it('lands after the last item when dropped past it', () => {
    moveItem('schedule', 'top')
    drawBar('right', [{ id: 'schedule', left: 230, width: 28 }])
    const t = zoneDropAt('top', 290, 'members')
    expect(t.index).toBe(1)
    expect(t.lineX).toBe(260)
  })
})
