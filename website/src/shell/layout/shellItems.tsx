/**
 * Label, icon and destination for an item that can sit in the top bar or the
 * bottom bar (design exploration). Built-in pages resolve through the surface
 * registry; Discover and Library are the rail's own App Store rows; the two
 * window toggles act instead of navigating.
 */
import type { ReactNode } from 'react'
import { Compass, LayoutGrid, Lightbulb, Smartphone, SquareTerminal } from 'lucide-react'

import { i18nT } from '../../i18n/t'
import { getBuiltinSurface, surfaceLabel } from '../../surfaces/registry'
import { FEEDBACK_ITEM, PHONE_ITEM, TERMINAL_ITEM, isTwoPlaceItem, isWindowToggle, type ShellZone } from '../../lib/shellLayout'
import { isEntityPin } from '../../lib/railLayout'

export interface ShellItemMeta { label: string; icon: ReactNode; path?: string }

export function shellItemMeta(id: string, size = 16): ShellItemMeta | null {
  if (id === TERMINAL_ITEM) return { label: i18nT('app.terminal'), icon: <SquareTerminal size={size} /> }
  if (id === PHONE_ITEM) return { label: i18nT('app.connect_your_phone'), icon: <Smartphone size={size} /> }
  if (id === FEEDBACK_ITEM) return { label: i18nT('nav.send_feedback'), icon: <Lightbulb size={size} /> }
  if (id === 'apps') return { label: i18nT('nav.discover'), icon: <Compass size={size} />, path: '/apps' }
  if (id === 'apps-library') return { label: i18nT('nav.library'), icon: <LayoutGrid size={size} />, path: '/apps/library' }
  const s = getBuiltinSurface(id)
  return s ? { label: surfaceLabel(s), icon: s.icon, path: s.route } : null
}

/** Whether an item may sit in a bar in this prototype (pages and window toggles only). */
export function canSitInBar(id: string): boolean {
  return shellItemMeta(id) !== null
}

/** Every place an item may go. Search and status: top bar or sidebar. Window
 *  toggles: the bars only. Pages: anywhere. Apps, Mates and sessions: sidebar. */
export function zonesFor(id: string): ShellZone[] {
  if (isTwoPlaceItem(id)) return ['top', 'sidebar']
  if (isWindowToggle(id)) return ['top', 'bottom']
  if (isEntityPin(id)) return ['sidebar']
  return canSitInBar(id) ? ['sidebar', 'top', 'bottom'] : ['sidebar']
}
