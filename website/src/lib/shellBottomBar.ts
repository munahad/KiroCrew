/**
 * Whether the desktop shell shows its bottom bar (ShellStatusBar).
 *
 * Design exploration, following the shell review's decision that the bottom
 * bar is not a permanent default: it is OFF unless the user turns it on from
 * the Settings menu. With it off, the terminal button lives in the session
 * header (the terminal opens in the session's project, so it belongs to the
 * page) and phone connect stays in the Settings menu.
 */
import { useEffect, useState } from 'react'

import { safeGetItem, safeSetItem } from '../utils/safeStorage'

export const SHOW_BOTTOM_BAR_KEY = 'mc-show-bottom-bar'
const CHANGED_EVENT = 'mc:show-bottom-bar-changed'

export function readShowBottomBar(): boolean {
  return safeGetItem(SHOW_BOTTOM_BAR_KEY) === '1'
}

export function setShowBottomBar(on: boolean): void {
  safeSetItem(SHOW_BOTTOM_BAR_KEY, on ? '1' : '0')
  window.dispatchEvent(new Event(CHANGED_EVENT))
}

export function useShowBottomBar(): boolean {
  const [on, setOn] = useState(readShowBottomBar)
  useEffect(() => {
    const sync = () => setOn(readShowBottomBar())
    window.addEventListener(CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CHANGED_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return on
}
