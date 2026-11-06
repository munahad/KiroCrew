/**
 * Which rail editor the "Customize rail" entry points open: the list editor
 * (rows dragged between groups and a "Not on the rail" shelf) or the palette
 * editor (browse and search everything that can go on the rail, Sketch-toolbar
 * style). A design-exploration switch, persisted per browser so a reviewer can
 * flip between the two and compare.
 */
import { useEffect, useState } from 'react'

import { safeGetItem, safeSetItem } from '../utils/safeStorage'

export type RailEditorVariant = 'list' | 'palette'

export const RAIL_EDITOR_VARIANT_KEY = 'mc-rail-editor-variant'
const CHANGED_EVENT = 'mc:rail-editor-variant-changed'
const DEFAULT_VARIANT: RailEditorVariant = 'list'

export function readRailEditorVariant(): RailEditorVariant {
  const v = safeGetItem(RAIL_EDITOR_VARIANT_KEY)
  return v === 'list' || v === 'palette' ? v : DEFAULT_VARIANT
}

export function setRailEditorVariant(v: RailEditorVariant): void {
  safeSetItem(RAIL_EDITOR_VARIANT_KEY, v)
  window.dispatchEvent(new Event(CHANGED_EVENT))
}

export function useRailEditorVariant(): RailEditorVariant {
  const [v, setV] = useState(readRailEditorVariant)
  useEffect(() => {
    const sync = () => setV(readRailEditorVariant())
    window.addEventListener(CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CHANGED_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return v
}
