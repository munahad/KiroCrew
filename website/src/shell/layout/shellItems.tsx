/**
 * Label, icon and destination for an item placed in the top bar or the bottom
 * bar (design exploration). Built-in pages resolve through the surface
 * registry; Discover and Library are the rail's own App Store rows; the window
 * toggles act instead of navigating. `useBarItemMeta` adds the items that need
 * live data: installed apps, single mates and pinned sessions.
 */
import { useCallback, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Boxes, CalendarCheck, Compass, Fullscreen, LayoutGrid, Lightbulb, Megaphone, MessageSquare, Palette, Smartphone, Square, SquareTerminal } from 'lucide-react'

import CrewAvatar from '../../components/CrewAvatar'
import { membersRosterQuery } from '../../api/membersQuery'
import { i18nT } from '../../i18n/t'
import { getBuiltinSurface, surfaceLabel } from '../../surfaces/registry'
import { useAppSelector } from '../../store'
import { FEATURE2_ITEM, FEEDBACK_ITEM, FOCUS_ITEM, PHONE_ITEM, TERMINAL_ITEM, placesOf, type ShellZone } from '../../lib/shellLayout'
import { MATE_PIN_PREFIX, SESSION_PIN_PREFIX } from '../../lib/railLayout'

export interface ShellItemMeta {
  label: string
  icon: ReactNode
  path?: string
  /** A pinned session: opening it switches the chat to that session. */
  sessionKey?: string
}

/** Query parameter the Mates page opens a mate by (see railPins.tsx). */
const MEMBER_PARAM = 'member'

export function shellItemMeta(id: string, size = 16): ShellItemMeta | null {
  if (id === TERMINAL_ITEM) return { label: i18nT('app.terminal'), icon: <SquareTerminal size={size} /> }
  if (id === PHONE_ITEM) return { label: i18nT('app.connect_your_phone'), icon: <Smartphone size={size} /> }
  if (id === FEEDBACK_ITEM) return { label: i18nT('nav.send_feedback'), icon: <Lightbulb size={size} /> }
  if (id === FOCUS_ITEM) return { label: i18nT('app.focus_mode'), icon: <Fullscreen size={size} /> }
  if (id === 'apps') return { label: i18nT('nav.discover'), icon: <Compass size={size} />, path: '/apps' }
  if (id === 'apps-library') return { label: i18nT('nav.library'), icon: <LayoutGrid size={size} />, path: '/apps/library' }
  // Made-up items (prototype only): the sample apps open Discover; Feature 2 opens nothing.
  if (id === 'demo-app:release-notes') return { label: i18nT('nav.demo_app_release_notes'), icon: <Megaphone size={size} />, path: '/apps' }
  if (id === 'demo-app:standup-bot') return { label: i18nT('nav.demo_app_standup_bot'), icon: <CalendarCheck size={size} />, path: '/apps' }
  if (id === 'demo-app:design-critique') return { label: i18nT('nav.demo_app_design_critique'), icon: <Palette size={size} />, path: '/apps' }
  if (id === 'demo-app:dev-fleet') return { label: i18nT('nav.demo_app_dev_fleet'), icon: <Boxes size={size} />, path: '/apps' }
  if (id === FEATURE2_ITEM) return { label: i18nT('nav.demo_tool_feature_2'), icon: <Square size={size} /> }
  const s = getBuiltinSurface(id)
  return s ? { label: surfaceLabel(s), icon: s.icon, path: s.route } : null
}

/** Meta for every item a bar can hold, including apps, mates and sessions. */
export function useBarItemMeta(apps: readonly { id: string; label: string; icon: ReactNode; path: string }[]) {
  const roster = useQuery({ ...membersRosterQuery }).data
  const slots = useAppSelector(s => s.dashboard.slots)
  return useCallback((id: string, size = 16): ShellItemMeta | null => {
    const base = shellItemMeta(id, size)
    if (base) return base
    if (id.startsWith(MATE_PIN_PREFIX)) {
      const m = roster?.find(x => x.slug === id.slice(MATE_PIN_PREFIX.length))
      return m ? { label: m.name, icon: <CrewAvatar seed={m.name} avatar={m.avatar} size={size} />, path: `/members?${MEMBER_PARAM}=${encodeURIComponent(m.name)}` } : null
    }
    if (id.startsWith(SESSION_PIN_PREFIX)) {
      const s = slots.find(x => x.key === id.slice(SESSION_PIN_PREFIX.length))
      return s ? { label: s.title || s.key, icon: <MessageSquare size={size} />, path: '/chat', sessionKey: s.key } : null
    }
    const a = apps.find(x => x.id === id)
    return a ? { label: a.label, icon: a.icon, path: a.path } : null
  }, [roster, slots, apps])
}

/** Whether an item may sit in a bar. Every item can now; kept for call sites. */
export function canSitInBar(_id: string): boolean {
  return true
}

/** Every area an item may go to (lib/shellLayout.ts placesOf): all three for
 *  every item except where placesOf says otherwise. */
export function zonesFor(id: string): ShellZone[] {
  return placesOf(id).filter((z): z is ShellZone => z !== 'none')
}
