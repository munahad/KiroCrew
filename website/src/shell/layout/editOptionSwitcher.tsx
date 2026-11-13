/**
 * Prototype switches (design exploration, not product UI): which Edit layout
 * approach to show, and which drag grid.
 *
 * A band ABOVE the app, in normal flow, so it pushes the whole shell down and
 * never covers any of it. It deliberately does not use Crew's tokens, font or
 * controls: reviewers must read it as a tool around the prototype, not as part
 * of the interface under review. Its fixed neutral palette reads the same on
 * every Crew theme for the same reason.
 *
 * Each segmented control is a native radio group (arrow keys move between
 * options, one tab stop), styled as segments.
 */
import { useId } from 'react'

import { i18nT } from '../../i18n/t'
import {
  DISCLOSURE_STYLES, EDIT_OPTIONS, GRID_STYLES, setDisclosure, setEditOption, setGridStyle, useDisclosure, useEditOption,
  useGridStyle,
} from '../../lib/editOption'

// Prototype-tool palette, intentionally outside the theme (see above).
const INK = '#262626'
const BAND = '#d9d9d9'

function Segments<T extends string>({ label, options, value, onChange, labelOf }: {
  label: string
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  labelOf: (v: T) => string
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <span id={id} className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      <div role="radiogroup" aria-labelledby={id} className="flex overflow-hidden rounded-md" style={{ border: `1.5px solid ${INK}` }}>
        {options.map((o, i) => {
          const on = o === value
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
                name={id}
                value={o}
                checked={on}
                onChange={() => onChange(o)}
                aria-label={labelOf(o)}
                className="sr-only"
              />
              {labelOf(o)}
            </label>
          )
        })}
      </div>
    </div>
  )
}

const OPTION_KEY = { drag: 'nav.layout_option_drag', panel: 'nav.layout_option_panel', preview: 'nav.layout_option_preview' } as const
const GRID_KEY = { drafting: 'nav.layout_grid_drafting', minimal: 'nav.layout_grid_minimal' } as const
const DISCLOSURE_KEY = { all: 'nav.layout_disclosure_all', gradual: 'nav.layout_disclosure_gradual' } as const

export function EditOptionSwitcher() {
  const option = useEditOption()
  const grid = useGridStyle()
  const disclosure = useDisclosure()
  return (
    <div
      data-testid="edit-option-switcher"
      className="relative z-[90] flex h-9 shrink-0 items-center justify-center gap-6 px-3 font-mono"
      style={{ background: BAND, color: INK, borderBottom: `1px solid ${INK}` }}
    >
      <Segments label={i18nT('nav.layout_option_label')} options={EDIT_OPTIONS} value={option} onChange={setEditOption} labelOf={o => i18nT(OPTION_KEY[o])} />
      {/* The second switch belongs to the option under review: the panel
          compares how it reveals its items; the others compare grids. */}
      {option === 'panel'
        ? <Segments label={i18nT('nav.layout_disclosure_label')} options={DISCLOSURE_STYLES} value={disclosure} onChange={setDisclosure} labelOf={d => i18nT(DISCLOSURE_KEY[d])} />
        : <Segments label={i18nT('nav.layout_grid_label')} options={GRID_STYLES} value={grid} onChange={setGridStyle} labelOf={g => i18nT(GRID_KEY[g])} />}
    </div>
  )
}
