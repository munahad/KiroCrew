/**
 * Prototype switch between the three Edit layout approaches (design
 * exploration, not product UI).
 *
 * A band ABOVE the app, in normal flow, so it pushes the whole shell down and
 * never covers any of it. It deliberately does not use Crew's tokens, font or
 * controls: reviewers must read it as a tool around the prototype, not as part
 * of the interface under review. Its fixed palette reads the same on every
 * Crew theme for the same reason.
 *
 * The segmented control is a native radio group (arrow keys move between
 * options, one tab stop), styled as segments.
 */
import { i18nT } from '../../i18n/t'
import { EDIT_OPTIONS, setEditOption, useEditOption, type EditOption } from '../../lib/editOption'

const LABEL_KEY: Record<EditOption, string> = {
  drag: 'nav.layout_option_drag',
  panel: 'nav.layout_option_panel',
  preview: 'nav.layout_option_preview',
}

// Prototype-tool palette, intentionally outside the theme (see above).
const INK = '#262626'
const BAND = '#d9d9d9'

export function EditOptionSwitcher() {
  const option = useEditOption()
  return (
    <div
      data-testid="edit-option-switcher"
      className="relative z-[90] flex h-9 shrink-0 font-mono items-center justify-center gap-3 px-3"
      style={{ background: BAND, color: INK, borderBottom: `1px solid ${INK}` }}
    >
      <span id="edit-option-label" className="text-[11px] font-semibold uppercase tracking-wider">
        {i18nT('nav.layout_option_label')}
      </span>
      <div
        role="radiogroup"
        aria-labelledby="edit-option-label"
        className="flex overflow-hidden rounded-md"
        style={{ border: `1.5px solid ${INK}` }}
      >
        {EDIT_OPTIONS.map((o, i) => {
          const on = o === option
          return (
            <label
              key={o}
              className="relative flex cursor-pointer items-center px-3 py-0.5 text-[12px] font-medium focus-within:outline focus-within:outline-2 focus-within:-outline-offset-4"
              style={{
                background: on ? INK : 'transparent',
                color: on ? BAND : INK,
                borderLeft: i ? `1.5px solid ${INK}` : undefined,
                outlineColor: on ? BAND : INK,
              }}
            >
              <input
                type="radio"
                name="edit-option"
                value={o}
                checked={on}
                onChange={() => setEditOption(o)}
                aria-label={i18nT(LABEL_KEY[o])}
                className="sr-only"
              />
              {i18nT(LABEL_KEY[o])}
            </label>
          )
        })}
      </div>
    </div>
  )
}
