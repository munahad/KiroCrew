import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeftToLine, GripVertical, PanelLeft } from 'lucide-react'
import { GithubIcon, DiscordIcon } from '../../components/BrandIcon'
import type { getThemeBranding } from '../../themeBranding'
import { i18nT } from '../../i18n/t'
import { uiLocation } from '../../uiLocations/uiLocation'
import { useGuideRevealScope } from '../../guide/GuideRevealScope'
import { OverlayPortal } from '../../components/overlayRoot'
import { useNavTip } from './navTip'
import { LOGO_ITEM, useLayoutEditing } from '../../lib/shellLayout'
import { FixedLock, FixedLockLabel } from '../layout/fixedLock'
import { ItemMoreButton, useLayoutItemProps } from '../layout/keyboardMove'
import { useDragOnlyEditing } from '../layout/dragOnlyEdit'
import { startItemDrag } from '../layout/barItems'

/** Glyph inside the nav-rail header's expand/collapse button — the same
 *  load-proof contract as MobileNavGlyph, with the rail's own geometry. When
 *  the rail is collapsed the logo is the button's ONLY visible content (the
 *  bot name is unmounted), so a 404 on the avatar asset, a blocked request or
 *  a hung fetch used to leave an invisible control that still toggled the
 *  rail when clicked. A PanelLeft glyph therefore fills the box by default,
 *  the swap to the logo happens only on the img's own `load` event, and
 *  `error` reverts it. `loadedSrc` records WHICH src loaded so a branding or
 *  theme swap falls back until the new asset proves itself. `boxClass` is the
 *  theme-overridable size (`branding.logoClass`, else w-10 collapsed / w-7
 *  expanded) and is applied to BOTH the fallback and the img so the swap never
 *  moves the button's geometry; the hover tilt and `transition-all` classes
 *  live on the img exactly as before. The img stays mounted (display:none)
 *  while hidden so the browser still fetches it. A sibling rather than a
 *  generalisation of MobileNavGlyph: that component's literal `w-6 h-6` box is
 *  pinned by narrowFirstBaseline.test.ts, while this box is a runtime
 *  expression. */
export function RailHeaderGlyph({ avatar, boxClass, iconSize }: { avatar: string; boxClass: string; iconSize: number }) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const showLogo = !!avatar && loadedSrc === avatar
  return (
    <>
      {!showLogo && (
        <span data-testid="rail-header-fallback" className={`${boxClass} flex items-center justify-center shrink-0 transition-all duration-300 group-hover:rotate-[-8deg]`} aria-hidden="true">
          <PanelLeft size={iconSize} />
        </span>
      )}
      {!!avatar && (
        <img src={avatar} alt="" aria-hidden="true" onLoad={() => setLoadedSrc(avatar)} onError={() => setLoadedSrc(null)} className={`${boxClass} rounded-md shrink-0 object-contain transition-all duration-300 group-hover:rotate-[-8deg] ${showLogo ? '' : 'hidden'}`} />
      )}
    </>
  )
}

/** The rail header: the brand mark that is also the collapse toggle. */
export function RailBrandToggle({ effectiveCollapsed, toggleNav, avatar, branding, botName }: {
  effectiveCollapsed: boolean
  toggleNav: () => void
  avatar: string
  branding: ReturnType<typeof getThemeBranding>
  botName: string
}) {
  // The rail's guide scope (`shell.nav-rail`): open while it shows labels.
  useGuideRevealScope('shell.nav-rail', !effectiveCollapsed)
  // Collapsed, the logo is the only expand control and carries no text, so it
  // gets the same instant hover/focus label as the collapsed nav rows (#25743).
  const { tip, tipOn, rowRef, showTip, hideTip, dismissTip, pointerProps } = useNavTip<HTMLButtonElement>(effectiveCollapsed)
  /*
   * mb-1.5 (6px) + the container's gap-0.5 (2px) = 8px between the
   * header and the first nav item, without widening the 2px item gaps.
   */
  return (
    <div className={`relative flex items-center mb-1.5 ${effectiveCollapsed ? 'justify-center' : ''}`}>
      {/* One persistent click target that toggles the rail. The logo
          never unmounts, so there is no swap across collapse/expand; its
          size (w-7 ↔ w-9) and collapsed nudge (mt-1) both animate over
          duration-300, so the mark glides between states rather than
          jumping. Only the brand text + collapse arrow
          animate — fading in on expand and out on collapse via
          AnimatePresence. No hover tint on the row; on hover only the
          logo rotates (group-hover). */}
      {/* No overflow-hidden here: the logo's hover-rotate paints a few
          px past its box, and clipping it looked cut off. Rotation is a
          transform so it doesn't affect the header's layout height
          (row height tracks the logo, collapse-icon alignment
          unchanged); horizontal spill on collapse is still clipped by
          the rail (motion.nav) and the brand text clips itself via
          `truncate`.
          Logo is DUAL-SIZE: w-7 (28px) expanded — 1px card border +
          pt-2 + 14 puts the header row's center on the 23px shared
          control baseline — and w-9 (36px) collapsed, centered in the
          icon strip and nudged down (mt-1) so both its symmetric inset
          and its top clear the rail's rounded-xl corner, which clips
          anything that reaches it; the mt-1 animates (transition-[margin]
          duration-300) in lockstep with the glyph's size transition so
          the flip is a glide, not a jump (a branding logoClass overrides
          both). The collapse arrow pins to top-[6px] rather than centering
          in the row — so its center stays on the
          23px shared control baseline (chat title row, its sessions
          toggle, and the activity strip icons) while the two-line
          brand block makes the row taller. */}
      <button
        type="button"
        // Expanded: right padding reserves the collapse icon's own room, so a
        // tight row truncates the wordmark instead of drawing the icon over it.
        className={`group relative flex items-center gap-2 w-full p-0 bg-transparent border-none cursor-pointer text-left ${effectiveCollapsed ? 'justify-center' : 'pr-5'}`}
        onClick={() => { dismissTip(); toggleNav() }}
        {...pointerProps}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
        title={effectiveCollapsed ? i18nT('app.expand_sidebar') : i18nT('app.collapse_sidebar')}
        aria-label={effectiveCollapsed ? i18nT('app.expand_sidebar') : i18nT('app.collapse_sidebar')}
        aria-expanded={!effectiveCollapsed}
        // The guide's 'shell.nav-toggle' names the desktop collapse button
        // (RailHeader); this phone drawer header only keeps the ref.
        ref={rowRef}
      >
        <span className={`flex items-center gap-2.5 min-w-0 transition-[margin] duration-300 ${effectiveCollapsed ? 'mt-1' : ''}`}>
          <RailHeaderGlyph avatar={avatar} boxClass={branding?.logoClass ?? (effectiveCollapsed ? 'w-9 h-9' : 'w-7 h-7')} iconSize={effectiveCollapsed ? 24 : 18} />
          <AnimatePresence initial={false}>
            {!effectiveCollapsed && (
              <motion.span
                key="brand-text"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6, transition: { duration: 0.12, ease: 'easeIn' } }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="text-[13px] font-bold tracking-[.14em] uppercase whitespace-nowrap truncate min-w-0"
              >
                {/* Last word of the bot name carries the accent (KIRO
                    CREW: muted brand, accent product); single-word names
                    render all-muted. */}
                {botName.includes(' ') ? (
                  <>
                    <span className="text-muted">{botName.slice(0, botName.lastIndexOf(' ') + 1)}</span>
                    <span className="text-accent/90">{botName.slice(botName.lastIndexOf(' ') + 1)}</span>
                  </>
                ) : (
                  <span className="text-muted">{botName}</span>
                )}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        {/* Arrow is ABSOLUTE (out of flex flow), pinned to the right.
            If it were a flex child it would reserve ~16px on the right
            from frame 1 of expand — but the rail is still at collapsed
            width (74px) for that frame, so logo + gap + arrow overflowed
            and the logo got crammed/clipped against the arrow (the
            "blink"). Absolute-positioning removes that reserved space, so
            the logo stays put and the arrow just fades in at the edge. */}
        <AnimatePresence initial={false}>
          {!effectiveCollapsed && (
            <motion.span
              key="collapse-arrow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.18, ease: 'easeOut', delay: 0.12 } }}
              exit={{ opacity: 0, transition: { duration: 0.12, ease: 'easeIn' } }}
              className="absolute right-0 top-[6px] h-4 flex items-center text-muted pointer-events-none"
            >
              {/* Arrow-to-edge, as on main: the rail collapses to an icon
                  rail rather than hiding. Back/Forward is its own sidebar row
                  now, not beside this icon, so it no longer reads as a third
                  Back arrow. */}
              <ArrowLeftToLine size={15} />
            </motion.span>
          )}
        </AnimatePresence>
        {effectiveCollapsed && tip && <OverlayPortal>
          <div
            data-testid="rail-expand-tip"
            className={`fixed flex items-center px-3 rounded-md bg-card border border-border shadow-lg text-text text-sm font-medium z-[9999] pointer-events-none whitespace-nowrap transition-opacity duration-150 ${tipOn ? 'opacity-100' : 'opacity-0'}`}
            style={{ top: tip.top, left: tip.left + tip.width + 4, height: tip.height }}
          >
            {i18nT('app.expand_sidebar')}
          </div>
        </OverlayPortal>}
      </button>
    </div>
  )
}

/** The bot name as the header draws it: the last word in the accent. */
function BrandText({ botName }: { botName: string }) {
  return (
    <span className="text-[13px] font-bold tracking-[.14em] uppercase whitespace-nowrap truncate min-w-0">
      {botName.includes(' ') ? (
        <>
          <span className="text-muted">{botName.slice(0, botName.lastIndexOf(' ') + 1)}</span>
          <span className="text-accent/90">{botName.slice(botName.lastIndexOf(' ') + 1)}</span>
        </>
      ) : (
        <span className="text-muted">{botName}</span>
      )}
    </span>
  )
}

/** The logo at the sidebar's head. In option 1's edit mode (checkpoint 56) it
 *  is an item like any other: a drag handle and a ⋯ menu (Move to Top bar,
 *  Remove) on hover or focus, draggable to the top bar, and the keyboard path
 *  of every item (Space to pick up, Delete to remove). Outside it, the logo
 *  opens a collapsed sidebar, as in production (checkpoint 57). `onExpand`: a
 *  click while collapsed, where the logo is the only way to open it. */
function EditableLogo({ collapsed, onExpand, children }: { collapsed: boolean; onExpand?: () => void; children: React.ReactNode }) {
  const on = useDragOnlyEditing()
  const label = i18nT('nav.layout_locked_logo')
  const kbd = useLayoutItemProps(LOGO_ITEM, 'sidebar', label)
  if (!on) return <>{children}</>
  return (
    <div data-testid="sidebar-logo-item" className={`group/edit relative flex min-w-0 items-center gap-1 ${collapsed ? '' : 'flex-1'}`}>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- `kbd` makes it a focusable button with its keyboard path */}
      <div
        {...kbd}
        draggable
        onDragStart={e => startItemDrag(e, LOGO_ITEM)}
        onClick={collapsed ? onExpand : undefined}
        className="flex min-w-0 flex-1 items-center gap-1 rounded-md outline-none cursor-grab active:cursor-grabbing [&_*]:cursor-grab hover:bg-bg-hover focus-visible:ring-2 focus-visible:ring-accent"
      >
        {!collapsed && <GripVertical size={12} aria-hidden="true" className="shrink-0 text-muted opacity-0 group-hover/edit:opacity-100 group-focus-within/edit:opacity-100" />}
        {children}
      </div>
      <ItemMoreButton id={LOGO_ITEM} zone="sidebar" label={label} inline />
    </div>
  )
}

/**
 * The desktop sidebar's header: the optional logo, and the collapse button
 * as its own control, drawn as production Crew draws it (checkpoint 57): the
 * arrow-to-edge glyph at 15px, muted, at the header's right edge on the
 * row's 23px control baseline, no hover tint; hovering the header tilts the
 * logo. Collapsed with the logo in the sidebar, the logo is the only control
 * and clicking it expands the sidebar, as in production. With the logo
 * removed or in a bar, a collapsed sidebar shows an expand button instead,
 * so it can always be opened. Expanded, the collapse button always shows.
 * The phone drawer keeps RailBrandToggle.
 */
export function RailHeader({ effectiveCollapsed, toggleNav, avatar, branding, botName, showLogo }: {
  effectiveCollapsed: boolean
  toggleNav: () => void
  avatar: string
  branding: ReturnType<typeof getThemeBranding>
  botName: string
  showLogo: boolean
}) {
  useGuideRevealScope('shell.nav-rail', !effectiveCollapsed)
  // Collapsed, the control carries no text: the same instant hover label as
  // the collapsed nav rows (#25743).
  const { tip, tipOn, rowRef, showTip, hideTip, dismissTip, pointerProps } = useNavTip<HTMLButtonElement>(effectiveCollapsed)
  const label = effectiveCollapsed ? i18nT('app.expand_sidebar') : i18nT('app.collapse_sidebar')
  const editing = useLayoutEditing()
  const dragEditing = useDragOnlyEditing()
  const fixedRef = useRef<HTMLSpanElement>(null)
  // Collapsed with the logo: the logo alone opens the sidebar.
  const logoToggles = showLogo && effectiveCollapsed
  const toggle = () => { dismissTip(); toggleNav() }
  const tipProps = { ...pointerProps, onMouseEnter: showTip, onMouseLeave: hideTip, onFocus: showTip, onBlur: hideTip }
  const expandTip = effectiveCollapsed && tip && (
    <OverlayPortal>
      <div
        data-testid="rail-expand-tip"
        className={`fixed flex items-center px-3 rounded-md bg-card border border-border shadow-lg text-text text-sm font-medium z-[9999] pointer-events-none whitespace-nowrap transition-opacity duration-150 ${tipOn ? 'opacity-100' : 'opacity-0'}`}
        style={{ top: tip.top, left: tip.left + tip.width + 4, height: tip.height }}
      >
        {i18nT('app.expand_sidebar')}
      </div>
    </OverlayPortal>
  )
  const glyph = (
    <span data-layout-logo className={`flex items-center gap-2.5 min-w-0 ${effectiveCollapsed ? '' : 'flex-1 pl-0.5'}`}>
      <RailHeaderGlyph avatar={avatar} boxClass={branding?.logoClass ?? (effectiveCollapsed ? 'w-9 h-9' : 'w-7 h-7')} iconSize={effectiveCollapsed ? 24 : 18} />
      {!effectiveCollapsed && <BrandText botName={botName} />}
    </span>
  )
  return (
    // `group`: hovering the header tilts the logo (RailHeaderGlyph), production's hover look.
    <div data-testid="sidebar-header" className={`group relative flex mb-1.5 ${effectiveCollapsed ? 'flex-col items-center gap-1 mt-1' : 'items-center gap-2 min-h-7'}`}>
      {showLogo && (
        <EditableLogo collapsed={effectiveCollapsed} onExpand={toggle}>
          {dragEditing || !logoToggles ? glyph : (
            // Collapsed, the logo opens the sidebar, as in production. Expanded
            // it is not a second button: the collapse button does that, and
            // two controls with one name would read as a duplicate.
            <button
              type="button"
              onClick={toggle}
              {...tipProps}
              title={label}
              aria-label={i18nT('app.expand_sidebar')}
              aria-expanded={false}
              data-testid="sidebar-logo-toggle"
              className="flex min-w-0 items-center p-0 bg-transparent border-none cursor-pointer text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              // shortcut: the guide's 'shell.nav-toggle' stays on the collapse
              // button only (one spread per location), so it is unnamed while the
              // logo alone opens a collapsed sidebar; move it if the guide needs it.
              ref={rowRef}
            >
              {glyph}
              {expandTip}
            </button>
          )}
        </EditableLogo>
      )}
      {!showLogo && !effectiveCollapsed && <span className="flex-1" />}
      {!logoToggles && (
        // Editing (any option): the button is fixed; a faded lock where a
        // handle would sit says so on hover or focus (note 20).
        <span ref={fixedRef} className={`group/fixed relative flex shrink-0 items-center ${editing ? 'gap-0.5' : ''} ${effectiveCollapsed ? '' : 'self-start -mr-1.5'}`}>
          {editing && <FixedLock className={effectiveCollapsed ? 'absolute -left-3.5 top-1/2 -translate-y-1/2' : ''} labelSide="none" />}
          {/* Note 27: the label to the button's right, so the sidebar's left edge never clips it. */}
          {editing && <FixedLockLabel anchor={fixedRef} />}
          <button
            type="button"
            onClick={toggle}
            {...tipProps}
            title={label}
            aria-label={editing ? (effectiveCollapsed ? i18nT('nav.layout_fixed_expand') : i18nT('nav.layout_fixed_collapse')) : effectiveCollapsed ? i18nT('app.expand_sidebar') : i18nT('app.collapse_sidebar')}
            aria-expanded={!effectiveCollapsed}
            data-testid="sidebar-collapse-toggle"
            // Production's arrow: muted, no hover tint; its 28px box keeps the
            // glyph's centre on the header's 14px line (production's top-[6px] h-4).
            className={`flex items-center justify-center w-7 h-7 shrink-0 rounded-md bg-transparent border-none cursor-pointer text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${effectiveCollapsed ? 'hover:text-text' : ''}`}
            {...uiLocation('shell.nav-toggle', rowRef)}
          >
            {effectiveCollapsed ? <PanelLeft size={16} aria-hidden="true" /> : <ArrowLeftToLine size={15} aria-hidden="true" />}
            {expandTip}
          </button>
        </span>
      )}
    </div>
  )
}

export function RailCommunityLinks({ effectiveCollapsed, setReportProblemOpen }: {
  effectiveCollapsed: boolean
  setReportProblemOpen: (open: boolean) => void
}) {
  /*
   * Community row — a leading GitHub mark, then two links on ONE
   * line separated by a middot, then the icon-only Discord link.
   *
   * This line is tight by construction, and the numbers are
   * MEASURED against real font advance widths, not estimated.
   * The rail is 236px, which leaves a 143px text group after the
   * mark, the Discord icon and padding; the middot plus its gaps
   * costs ~10-15px depending on family.
   *
   * CRITICAL: size this against the WIDEST font the user can pick,
   * not the default. `useZoom` lets them set --font-body to sans
   * (Space Grotesk), mono (JetBrains Mono) or system (-apple-system),
   * and mono is ~20% wider. A 12px row measured only against Space
   * Grotesk truncates for every mono user.
   *
   * "Star us · Report issue" at 12px, measured:
   * Space Grotesk   114.0px against a 132.8px budget — 18.7 spare
   * JetBrains Mono  136.8px against a 127.8px budget — 9.0 OVER
   * Rather than shrink the type for everyone or drop the Discord
   * link, mono alone is tightened to -0.05em, which brings it to
   * 125.4px (+3.0 spare). That rule lives in index.css keyed on
   * html[data-font-family="mono"] via the `rail-community-links`
   * class, and its measurement table is there. Mono's margin is only
   * ~3px, so ANY copy growth here must be re-measured IN MONO first.
   *
   * The separator is a middot because " / " is wider, and the row's
   * right padding is trimmed for the same budget reason.
   *
   * The mark sits 2px from the text (ml-0.5) while the middot keeps
   * 4px gaps. That asymmetry is an OPTICAL correction, not an
   * oversight: github-mark.svg is a circle filling its whole 16x16
   * viewBox (no internal padding), and a circle beside a capital "S"
   * curves away from it, so an equal metric gap reads as a wider
   * one. Matching the middot's 4px here looked detached. Font and
   * letter-spacing are deliberately NOT overridden — the row
   * inherits --font-body and letter-spacing:normal from body, so it
   * follows the user's own font choice like everything else.
   *
   * Order of yielding under pressure is deliberate: "Star us" and
   * the middot are shrink-0, so a longer locale (Spanish's "Informar
   * de un problema") ellipsizes the TAIL of the second link rather
   * than mangling both. Both links keep a title tooltip, so a
   * clipped label is still readable on hover.
   *
   * One mark for two links is correct — both destinations ARE
   * GitHub. It is decorative (BrandGlyph is aria-hidden) and each
   * link carries its own descriptive aria-label, since "Star us"
   * alone names no target. Hidden while the rail is collapsed (folds
   * away via max-height so the collapse stays smooth).
   */
  return (
    <div {...(effectiveCollapsed ? { inert: '' } : {})} className={`overflow-hidden transition-all duration-200 ${effectiveCollapsed ? 'max-h-0 opacity-0' : 'max-h-16 opacity-100 mt-1'}`}>
      <div className="flex items-center border-t border-border pl-3 pr-0.5 pt-2.5 pb-0.5 whitespace-nowrap">
        {/* pl-3 puts the mark on the same 12px x-offset as the
            nav-item icons above. No `gap` on this row ON PURPOSE: a row
            gap applies between ALL THREE children (mark, links,
            Discord), so pairing it with ml-0.5 would silently double
            the mark-to-text distance to 6px and cost 4px the budget
            below never accounts for. Spacing is explicit per child instead. */}
        <span className="flex items-center shrink-0 text-muted"><GithubIcon size={15} /></span>
        {/* `flex-wrap`: in a locale where "Star us" and "Report issue" together
            outrun the rail (the pseudolocale does, and so will any long-word
            language), the second link drops to its own line with the full
            row width instead of truncating to a third of itself. */}
        <div className="rail-community-links flex flex-wrap items-center gap-x-[5px] gap-y-0.5 flex-1 min-w-0 ml-1.5 text-[12px]">
          <a href="https://github.com/kirodotdev/KiroCrew" target="_blank" rel="noopener noreferrer" title={i18nT('app.star_kirocrew_on_github')} aria-label={i18nT('app.star_kirocrew_on_github')} className="shrink-0 rounded text-muted hover:text-text transition-colors">{i18nT('app.star_us')}</a>
          <span aria-hidden="true" className="shrink-0 opacity-40">·</span>
          {/* "Report issue" opens the SAME diagnostics flow as Settings ›
              About › Support rather than linking to the bare issue list.
              A user who reaches for this link is reporting a failure, and
              an empty issue form loses exactly what triage needs (logs +
              crash reports); the collector scrubs secrets, zips them, and
              still ends at a pre-filled GitHub issue, so the old
              destination is reachable WITH evidence attached. A <button>
              (not an <a>) because it no longer navigates — styled to match
              its sibling link so the row's width budget above is unchanged. */}
          <button type="button" onClick={() => setReportProblemOpen(true)} title={i18nT('app.report_a_problem_with_diagnostics')} aria-label={i18nT('app.report_a_problem_with_diagnostics')} {...uiLocation('shell.report-problem')} className="min-w-0 overflow-hidden text-ellipsis rounded text-muted hover:text-text transition-colors cursor-pointer bg-transparent border-0 p-0 text-[12px]">{i18nT('app.report_issue')}</button>
        </div>
        <a href="https://kiro.dev/discord/" target="_blank" rel="noopener noreferrer" title={i18nT('app.discord_community')} aria-label={i18nT('app.kiro_discord_community')} className="flex items-center justify-center ml-1 w-6 h-6 rounded-md text-muted hover:text-text hover:bg-bg-hover transition-colors shrink-0"><DiscordIcon size={15} /></a>
      </div>
    </div>
  )
}
