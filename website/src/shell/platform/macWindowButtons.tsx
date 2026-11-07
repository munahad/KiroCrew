/**
 * Room for the macOS window buttons (design exploration).
 *
 * The desktop app draws the red, yellow and green window buttons at the
 * window's top-left (x 16-68, y 11-23 at 100% zoom; electron/runtime/window/
 * chrome.js). They used to sit over the top bar, which had an 84px left inset
 * for them. Now the sidebar runs the full height of the window, so the buttons
 * land on the sidebar's header instead, and the top bar starts to the right of
 * the sidebar and needs no inset.
 *
 * The fix, as in Finder, Notes and Mail: a short empty band at the top of the
 * sidebar for the buttons to sit in, with the logo row below it. The band is
 * part of the window's drag area, so it also gives the user somewhere to grab.
 * Applied only where the buttons actually sit over the sidebar: the macOS app,
 * not fullscreen (macOS hides them there), not the phone layout, not focus mode
 * (the full-width top bar comes back and keeps its own inset).
 *
 * Browser preview: add `?mac-preview` to the dashboard URL to draw stand-in
 * buttons and apply the same spacing, so the layout can be checked without the
 * desktop app. `?mac-preview=off` turns it off. Prototype-only.
 */
import { safeGetItem, safeRemoveItem, safeSetItem } from '../../utils/safeStorage'
import { isElectron } from '../../lib/electron'

const PREVIEW_KEY = 'mc-mac-preview'

function readPreview(): boolean {
  if (isElectron || typeof window === 'undefined') return false
  const q = new URLSearchParams(window.location.search).get('mac-preview')
  if (q === 'off') safeRemoveItem(PREVIEW_KEY)
  else if (q !== null) safeSetItem(PREVIEW_KEY, '1')
  return safeGetItem(PREVIEW_KEY) === '1'
}

/** Browser only: draw stand-in macOS window buttons and use the macOS spacing. */
export const isMacPreview = readPreview()

/**
 * Stand-in window buttons for the browser preview, at the native position.
 * The colours are macOS's own, not theme colours: they stand in for OS chrome
 * that the theme never paints.
 */
export function MacWindowButtonsPreview() {
  if (!isMacPreview) return null
  return (
    <div
      aria-hidden="true"
      data-testid="mac-window-buttons-preview"
      className="fixed left-4 top-[11px] z-[99999] flex gap-2 pointer-events-none"
    >
      {['#ff5f57', '#febc2e', '#28c840'].map(c => (
        <span key={c} className="w-3 h-3 rounded-full" style={{ background: c, boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,.2)' }} />
      ))}
    </div>
  )
}
