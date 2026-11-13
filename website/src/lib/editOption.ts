/**
 * Which Edit layout approach the prototype shows (design exploration).
 *
 * From the Nov 11 prototype review: three ways to edit the shell, compared in
 * one branch behind a switch rather than in separate branches.
 *   1. drag   — drag only, no Edit layout panel.
 *   2. panel  — the current in-place editing with the floating panel.
 *   3. preview — a separate edit mode on a small preview of the layout.
 *
 * Stored per browser so a reload keeps the option under review.
 */
import { useEffect, useState } from 'react'

import { safeGetItem, safeSetItem } from '../utils/safeStorage'

export type EditOption = 'drag' | 'panel' | 'preview'
export const EDIT_OPTIONS: readonly EditOption[] = ['drag', 'panel', 'preview']

const KEY = 'mc-layout-edit-option'
const EVENT = 'mc:layout-edit-option-changed'
const DEFAULT: EditOption = 'panel'

const isEditOption = (v: unknown): v is EditOption => (EDIT_OPTIONS as readonly unknown[]).includes(v)

export function readEditOption(): EditOption {
  const v = safeGetItem(KEY)
  return isEditOption(v) ? v : DEFAULT
}

export function setEditOption(option: EditOption): void {
  if (option === readEditOption()) return
  safeSetItem(KEY, option)
  window.dispatchEvent(new Event(EVENT))
}

export function useEditOption(): EditOption {
  const [option, setOption] = useState(readEditOption)
  useEffect(() => {
    const sync = () => setOption(readEditOption())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return option
}

/**
 * Which drag grid the prototype shows, compared from the same band:
 *   drafting — neutral graph-paper lines in the theme's text colour.
 *   minimal  — thin accent-colour lines, the earlier look, drawn as a full grid.
 */
export type GridStyle = 'drafting' | 'minimal'
export const GRID_STYLES: readonly GridStyle[] = ['drafting', 'minimal']

const GRID_KEY = 'mc-layout-grid-style'
const GRID_EVENT = 'mc:layout-grid-style-changed'

export function readGridStyle(): GridStyle {
  return safeGetItem(GRID_KEY) === 'minimal' ? 'minimal' : 'drafting'
}

export function setGridStyle(style: GridStyle): void {
  if (style === readGridStyle()) return
  safeSetItem(GRID_KEY, style)
  window.dispatchEvent(new Event(GRID_EVENT))
}

export function useGridStyle(): GridStyle {
  const [style, setStyle] = useState(readGridStyle)
  useEffect(() => {
    const sync = () => setStyle(readGridStyle())
    window.addEventListener(GRID_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(GRID_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return style
}

/**
 * How the option 2 panel shows its items, compared from the same band:
 *   all     — everything listed up front (the current panel).
 *   gradual — fewer options at first, more revealed as the person uses it.
 */
export type DisclosureStyle = 'all' | 'gradual'
export const DISCLOSURE_STYLES: readonly DisclosureStyle[] = ['all', 'gradual']

const DISCLOSURE_KEY = 'mc-layout-disclosure'
const DISCLOSURE_EVENT = 'mc:layout-disclosure-changed'

export function readDisclosure(): DisclosureStyle {
  return safeGetItem(DISCLOSURE_KEY) === 'gradual' ? 'gradual' : 'all'
}

export function setDisclosure(style: DisclosureStyle): void {
  if (style === readDisclosure()) return
  safeSetItem(DISCLOSURE_KEY, style)
  window.dispatchEvent(new Event(DISCLOSURE_EVENT))
}

export function useDisclosure(): DisclosureStyle {
  const [style, setStyle] = useState(readDisclosure)
  useEffect(() => {
    const sync = () => setStyle(readDisclosure())
    window.addEventListener(DISCLOSURE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(DISCLOSURE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return style
}
