/**
 * "Icon only" or "Icon and label" for an item in the top or bottom bar
 * (design exploration).
 *
 * From the Nov 11 review: an item dragged into a bar must not change form on
 * its own, and the choice should be the user's, made where the item is. So
 * while editing, a small two-part switch shows under an item in the top bar
 * (above one in the bottom bar) right after it lands there, and again when the
 * pointer rests on it. Both halves are real buttons, so the keyboard reaches
 * them too; the Edit layout panel offers the same choice on the item's row.
 *
 * Search keeps its own two forms (search field or icon); every other item with
 * a label uses the per-item style in lib/barGrid.ts. Widgets with a fixed form
 * (status, Back/Forward, remote Crews, "You") get no switch.
 */
import { useLayoutEffect, useState } from 'react'

import { OverlayPortal } from '../../components/overlayRoot'
import { i18nT } from '../../i18n/t'
import { setItemStyle, useItemStyle } from '../../lib/barGrid'
import {
  SEARCH_ITEM, announceLayout, isWidgetItem, setSearchStyle, useSearchStyle, type BarZone,
} from '../../lib/shellLayout'

/** Whether an item in a bar can switch between icon only and icon and label. */
export const offersStyle = (id: string) => id === SEARCH_ITEM || !isWidgetItem(id)

export function BarStyleChooser({ id, label, zone, anchor, onPointerEnter, onPointerLeave }: {
  id: string
  /** The item's name, for announcements. */
  label: string
  zone: BarZone
  /** The item's cell, which the switch sits against. */
  anchor: HTMLElement
  onPointerEnter: () => void
  onPointerLeave: () => void
}) {
  const styleOf = useItemStyle()
  const searchStyle = useSearchStyle()
  const iconOnly = id === SEARCH_ITEM ? searchStyle === 'icon' : styleOf(id) === 'icon'

  // Follow the cell: it slides when neighbours are pushed aside.
  const [rect, setRect] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    let raf = 0
    const tick = () => { setRect(anchor.getBoundingClientRect()); raf = requestAnimationFrame(tick) }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [anchor])
  if (!rect) return null

  const choose = (icon: boolean) => {
    if (icon === iconOnly) return
    if (id === SEARCH_ITEM) {
      setSearchStyle(icon ? 'icon' : 'field')
      announceLayout(i18nT(icon ? 'nav.layout_search_now_icon' : 'nav.layout_search_now_field'))
      return
    }
    setItemStyle(id, icon ? 'icon' : 'label')
    announceLayout(i18nT(icon ? 'nav.layout_now_icon' : 'nav.layout_now_label', { item: label }))
  }
  const part = (icon: boolean) => {
    const on = icon === iconOnly
    const name = i18nT(icon ? 'nav.layout_search_icon' : id === SEARCH_ITEM ? 'nav.layout_search_field' : 'nav.layout_style_label')
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => choose(icon)}
        className={`h-6 px-2 rounded-md border-none text-[12px] whitespace-nowrap cursor-pointer ${on ? 'bg-bg-hover text-text' : 'bg-transparent text-muted hover:text-text'}`}
      >
        {name}
      </button>
    )
  }
  const below = zone === 'top'
  return (
    <OverlayPortal>
      <div
        role="group"
        aria-label={`${i18nT('nav.layout_show_as')}: ${label}`}
        data-testid="bar-style-chooser"
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        className="fixed z-[75] flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-bg-elevated text-text shadow-lg -translate-x-1/2"
        style={{ left: rect.left + rect.width / 2, top: below ? rect.bottom + 6 : undefined, bottom: below ? undefined : window.innerHeight - rect.top + 6 }}
      >
        {part(false)}
        {part(true)}
      </div>
    </OverlayPortal>
  )
}
