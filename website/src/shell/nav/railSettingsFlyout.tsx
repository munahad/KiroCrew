import { useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Bug, ChevronRight, CircleUserRound, ExternalLink, Lightbulb, LogOut, Settings2, Smartphone } from 'lucide-react'
import { DiscordIcon, GithubIcon } from '../../components/BrandIcon'

import Modal from '../../components/Modal'
import { Btn } from '../../components/ui'
import { Popover, PopoverAnchor, PopoverContent } from '../../components/ui/popover'
import { i18nT } from '../../i18n/t'
import { sendFeedback } from '../../lib/shellLayout'
import { surfaceLabel } from '../../surfaces/registry'
import { NAV_ITEMS } from './navItems'
import { RemoteCrewList } from '../layout/remoteCrews'
import type { AppShell } from '../appShell'
import { NavItem } from './navRow'

/** Window event that opens the rail customize modal from outside the rail groups. */
export const OPEN_RAIL_CUSTOMIZE_EVENT = 'mc:open-rail-customize'
export const openRailCustomize = () => window.dispatchEvent(new Event(OPEN_RAIL_CUSTOMIZE_EVENT))

interface FlyoutRoute { path: string; label: string; icon: ReactNode }

function FlyoutRow({ icon, label, onClick, active }: { icon: ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm bg-transparent border-none cursor-pointer ${active ? 'bg-bg-hover text-text' : 'text-text hover:bg-bg-hover'}`}
    >
      <span className="w-4 h-4 flex items-center justify-center shrink-0 text-muted">{icon}</span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
    </button>
  )
}

/** A generic person mark: Crew has no per-user identity yet, so the prototype draws a placeholder. */
function ProfileAvatar({ size }: { size: number }) {
  return (
    <span className="flex items-center justify-center rounded-full bg-accent/15 text-accent shrink-0" style={{ width: size, height: size }}>
      <CircleUserRound size={Math.round(size * 0.8)} />
    </span>
  )
}

/** A confirmation for a prototype-only action: it explains, then does nothing. */
function MockDialog({ open, title, body, confirm, onClose }: { open: boolean; title: string; body: string; confirm?: string; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth={420}
      footer={(
        <div className="flex w-full items-center justify-end gap-2">
          {confirm && <Btn onClick={onClose}>{i18nT('nav.profile_cancel')}</Btn>}
          <Btn primary onClick={onClose}>{confirm ?? i18nT('nav.profile_ok')}</Btn>
        </div>
      )}
    >
      <p className="m-0 text-sm text-text">{body}</p>
      <p className="mt-3 mb-0 rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-muted">{i18nT('nav.profile_prototype_note')}</p>
    </Modal>
  )
}

/**
 * The rail's one permanent row (design exploration): the user's avatar,
 * opening a profile menu, the pattern Claude, Slack and Codex use. Who you are
 * comes first, then configuration (Settings, Customize, Edit layout), then
 * device and connection (phone, remote switching), then help and community
 * (Send feedback, Report issue, GitHub, Discord), then Sign out. The row shows
 * a chevron so it reads as opening a menu. Switch remote… opens the real
 * Crews list; Sign out is a prototype mock that explains and changes nothing. The flyout is a
 * Radix popover, portaled to the overlay root so the rail's `overflow-hidden`
 * cannot clip it.
 */
/** A menu row that opens an outside page in a new tab, marked with an arrow-out icon. */
function FlyoutLink({ icon, label, href, title }: { icon: ReactNode; label: string; href: string; title: string }) {
  return (
    <a
      role="menuitem"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-text no-underline hover:bg-bg-hover"
    >
      <span className="w-4 h-4 flex items-center justify-center shrink-0 text-muted">{icon}</span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      <ExternalLink size={12} aria-hidden="true" className="text-muted shrink-0" />
    </a>
  )
}

export function RailSettingsFlyout({ settings, customize, collapsed, activePath, badge, phone, onNavigate, reportProblem, compact }: {
  settings: FlyoutRoute
  customize: FlyoutRoute
  collapsed: boolean
  activePath: string
  badge?: ReactNode
  /** Present when phone connect can render. */
  phone?: { open: () => void }
  onNavigate?: () => void
  /** Opens the Report a problem flow (diagnostics, then a pre-filled issue). */
  reportProblem?: () => void
  /** Placed in a bar by Edit layout: an avatar button, with the menu opening
   *  below it (top bar) or above it (bottom bar) instead of to the side. */
  compact?: 'top' | 'bottom'
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [mock, setMock] = useState<'sign-out' | 'remote' | null>(null)
  const anchor = useRef<HTMLDivElement>(null)

  const isOn = (path: string) => activePath === path || activePath.startsWith(path + '/')
  const go = (path: string) => { setOpen(false); onNavigate?.(); navigate(path) }
  const openMock = (which: 'sign-out' | 'remote') => { setOpen(false); setMock(which) }

  return (<>
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverAnchor asChild>
        <div ref={anchor}>
          {compact ? (
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              aria-label={i18nT('nav.profile_menu_label')}
              aria-haspopup="menu"
              aria-expanded={open}
              title={i18nT('nav.profile_menu_name')}
              className="relative flex items-center justify-center w-7 h-7 rounded-full bg-transparent border-none cursor-pointer hover:bg-bg-hover"
            >
              <ProfileAvatar size={20} />
              {badge}
            </button>
          ) : (
          <NavItem
            path={settings.path}
            label={i18nT('nav.profile_menu_name')}
            icon={<ProfileAvatar size={collapsed ? 22 : 20} />}
            active={open || isOn(settings.path) || isOn(customize.path)}
            collapsed={collapsed}
            // Clicking the avatar opens the menu.
            onClickOverride={() => setOpen(o => !o)}
            // A chevron says this row opens a menu to the side, not a page.
            // Collapsed, the strip has no room, so only the row's badge shows.
            badge={collapsed ? badge : <span className="inline-flex items-center gap-1">{badge}<ChevronRight size={14} aria-hidden="true" className={`text-muted transition-transform ${open ? 'translate-x-0.5' : ''}`} /></span>}
          />
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        side={compact === 'top' ? 'bottom' : compact === 'bottom' ? 'top' : 'right'}
        align="end"
        sideOffset={10}
        variant="list"
        className="w-64"
        role="menu"
        aria-label={i18nT('nav.profile_menu_label')}
        // A press on the avatar itself is its own toggle, not an outside click.
        onInteractOutside={e => { if (anchor.current?.contains(e.target as Node)) e.preventDefault() }}
      >
        {/* Who you are, before what you can do. */}
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <ProfileAvatar size={32} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-text">{i18nT('nav.profile_menu_name')}</div>
            <div className="truncate text-[12px] text-muted">{i18nT('nav.profile_menu_status')}</div>
          </div>
        </div>
        <div aria-hidden="true" className="my-1 h-px bg-border" />
        <FlyoutRow icon={settings.icon} label={settings.label} active={isOn(settings.path)} onClick={() => go(settings.path)} />
        <FlyoutRow icon={customize.icon} label={i18nT('nav.profile_customize_agents')} active={isOn(customize.path)} onClick={() => go(customize.path)} />
        <FlyoutRow icon={<Settings2 size={16} />} label={i18nT('nav.rail_customize')} onClick={() => { setOpen(false); openRailCustomize() }} />
        <div aria-hidden="true" className="my-1 h-px bg-border" />
        {phone && <FlyoutRow icon={<Smartphone size={16} />} label={i18nT('app.connect_your_phone')} onClick={() => { setOpen(false); phone.open() }} />}
        <FlyoutRow icon={<ArrowLeftRight size={16} />} label={i18nT('nav.profile_switch_remote')} onClick={() => openMock('remote')} />
        <div aria-hidden="true" className="my-1 h-px bg-border" />
        {/* Help and community: feedback, problem reports and the project's
            public places, gathered from the top bar pill and the old sidebar
            footer links. */}
        <div className="px-2.5 pt-1 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">{i18nT('nav.profile_help_heading')}</div>
        <FlyoutRow icon={<Lightbulb size={16} />} label={i18nT('nav.send_feedback')} onClick={() => { setOpen(false); sendFeedback() }} />
        {reportProblem && <FlyoutRow icon={<Bug size={16} />} label={i18nT('app.report_issue')} onClick={() => { setOpen(false); reportProblem() }} />}
        <FlyoutLink icon={<GithubIcon size={15} />} label={i18nT('app.star_kirocrew_on_github')} href="https://github.com/kirodotdev/KiroCrew" title={i18nT('app.star_kirocrew_on_github')} />
        <FlyoutLink icon={<DiscordIcon size={15} />} label={i18nT('app.discord_community')} href="https://kiro.dev/discord/" title={i18nT('app.kiro_discord_community')} />
        <div aria-hidden="true" className="my-1 h-px bg-border" />
        <FlyoutRow icon={<LogOut size={16} />} label={i18nT('nav.profile_sign_out')} onClick={() => openMock('sign-out')} />
      </PopoverContent>
    </Popover>
    <MockDialog
      open={mock === 'sign-out'}
      title={i18nT('nav.profile_sign_out_title')}
      body={i18nT('nav.profile_sign_out_body')}
      confirm={i18nT('nav.profile_sign_out')}
      onClose={() => setMock(null)}
    />
    {/* "Switch remote…" is real: the same Crews list the switcher shows. */}
    <Modal
      open={mock === 'remote'}
      onClose={() => setMock(null)}
      title={i18nT('nav.profile_remote_title')}
      maxWidth={420}
    >
      <p className="m-0 mb-3 text-sm text-muted">{i18nT('nav.profile_remote_body')}</p>
      <RemoteCrewList onDone={() => setMock(null)} />
    </Modal>
  </>)
}

/**
 * The profile menu wherever Edit layout puts it: a row in the sidebar, or an
 * avatar button in the top or bottom bar. Reads its routes and actions from
 * the shell, so every placement opens the same menu.
 */
export function ShellProfileMenu({ shell, collapsed = false, compact }: {
  shell: Pick<AppShell, 'activePath' | 'updateAvailable' | 'hasRenderableMobileConnect' | 'setMobileConnectOpen' | 'closeMobileNav' | 'setReportProblemOpen'>
  collapsed?: boolean
  compact?: 'top' | 'bottom'
}) {
  const s = NAV_ITEMS.find(n => n.id === 'settings')!
  const cap = NAV_ITEMS.find(n => n.id === 'capabilities')!
  const dot = compact ? 'absolute top-0.5 right-0.5 w-2 h-2 bg-accent rounded-full' : collapsed ? 'absolute top-1 right-1 w-2 h-2 bg-accent rounded-full z-10' : 'absolute top-1/2 -translate-y-1/2 right-2 w-2 h-2 bg-accent rounded-full z-10'
  const badge = shell.updateAvailable
    ? <span title={i18nT('app.update_available')} role="status" aria-label={i18nT('app.update_available_2')} className={dot} />
    : undefined
  return (
    <RailSettingsFlyout
      settings={{ path: s.path, label: surfaceLabel(s), icon: s.icon }}
      customize={{ path: cap.path, label: surfaceLabel(cap), icon: cap.icon }}
      collapsed={collapsed}
      activePath={shell.activePath}
      badge={badge}
      phone={shell.hasRenderableMobileConnect ? { open: () => shell.setMobileConnectOpen(true) } : undefined}
      onNavigate={shell.closeMobileNav}
      reportProblem={() => shell.setReportProblemOpen(true)}
      compact={compact}
    />
  )
}
