/**
 * Prototype-only sample page (design exploration, checkpoint 58): a page with
 * its own side panel, like a session with its sessions list, so the chrome
 * treatments can be judged with two side panels next to each other (the Crew
 * sidebar, then this page's panel). Opened from the prototype band; no nav
 * item, so the shell's default layout is unchanged.
 *
 * The page panel uses only the page's own tokens (bg-bg, border-border), so in
 * A · Shared frame it reads as part of the page panel, not the frame.
 */
import { useState } from 'react'

import { i18nT } from '../i18n/t'

const ITEMS = [1, 2, 3, 4, 5, 6]

export default function PrototypeSidePanelPage() {
  const [selected, setSelected] = useState(1)
  return (
    <div data-testid="prototype-two-panels-page" className="flex h-full min-h-0">
      <aside
        aria-label={i18nT('nav.prototype_two_panels_list')}
        className="flex w-60 shrink-0 flex-col gap-0.5 border-r border-border bg-bg p-2"
      >
        <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{i18nT('nav.prototype_two_panels_list')}</div>
        {ITEMS.map(n => (
          <button
            key={n}
            type="button"
            aria-pressed={selected === n}
            onClick={() => setSelected(n)}
            className={`h-8 rounded-lg px-2 text-left text-[13px] ${selected === n ? 'bg-bg-hover text-text-strong' : 'text-text hover:bg-bg-hover'}`}
          >
            {i18nT('nav.prototype_two_panels_item', { n })}
          </button>
        ))}
      </aside>
      <section className="min-w-0 flex-1 overflow-y-auto p-8">
        <h1 className="mb-2 text-lg font-semibold text-text-strong">{i18nT('nav.prototype_two_panels_item', { n: selected })}</h1>
        <p className="max-w-xl text-sm text-muted">{i18nT('nav.prototype_two_panels_body')}</p>
      </section>
    </div>
  )
}
