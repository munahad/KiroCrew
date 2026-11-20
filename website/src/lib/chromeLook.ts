/**
 * Which chrome treatment the prototype draws (design exploration, checkpoint 58).
 *
 *   current   — today's look: the page sits flat on the window background.
 *   a-lighter — treatment A, Shared frame (Codex style): the top bar, sidebar
 *               and bottom bar share one frame background, and the page is a
 *               rounded panel set into it. The frame is lighter than the page.
 *   a-darker  — the same, with the frame darker than the page.
 *
 * Chosen from the prototype band outside edit mode, stored per browser like
 * the band's other switches. Edit mode always draws the current look, so the
 * edit-mode visuals from checkpoints 52-57 are unchanged (shell/chromeA.css).
 */
import { useEffect, useState } from 'react'

import { safeGetItem, safeSetItem } from '../utils/safeStorage'

export type ChromeLook = 'current' | 'a-lighter' | 'a-darker'
export const CHROME_LOOKS: readonly ChromeLook[] = ['current', 'a-lighter', 'a-darker']

const KEY = 'mc-prototype-chrome'
const EVENT = 'mc:prototype-chrome-changed'

const isChromeLook = (v: unknown): v is ChromeLook => (CHROME_LOOKS as readonly unknown[]).includes(v)

export function readChromeLook(): ChromeLook {
  const v = safeGetItem(KEY)
  return isChromeLook(v) ? v : 'current'
}

export function setChromeLook(look: ChromeLook): void {
  if (look === readChromeLook()) return
  safeSetItem(KEY, look)
  window.dispatchEvent(new Event(EVENT))
}

export function useChromeLook(): ChromeLook {
  const [look, setLook] = useState(readChromeLook)
  useEffect(() => {
    const sync = () => setLook(readChromeLook())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return look
}

/** The sample page with its own side panel (pages/prototypeSidePanelPage.tsx),
 *  opened from the band to judge A with two side panels next to each other. */
export const PROTOTYPE_TWO_PANELS_PATH = '/prototype/two-panels'
