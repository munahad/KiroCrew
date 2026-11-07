import { useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, CircleUserRound, Lightbulb, Lock, LogOut, Settings2, Smartphone } from 'lucide-react'

import Modal from '../../components/Modal'
import { Btn } from '../../components/ui'
import { Popover, PopoverAnchor, PopoverContent } from '../../components/ui/popover'
import { i18nT } from '../../i18n/t'
import { sendFeedback, useLayoutEditing } from '../../lib/shellLayout'
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
 * comes first, then configuration (Settings, Customize agents, Customize
 * sidebar), then device and connection (phone, remote
 * switching), then Sign out. Remote switching and Sign out are prototype
 * mocks: they explain what they would do and change nothing. The flyout is a
 * Radix popover, portaled to the overlay root so the rail's `overflow-hidden`
 * cannot clip it.
 */
export function RailSettingsFlyout({ settings, customize, collapsed, activePath, badge, phone, onNavigate }: {
  settings: FlyoutRoute
  customize: FlyoutRoute
  collapsed: boolean
  activePath: string
  badge?: ReactNode
  /** Present when phone connect can render. */
  phone?: { open: () => void }
  onNavigate?: () => void
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [mock, setMock] = useState<'sign-out' | 'remote' | null>(null)
  const anchor = useRef<HTMLDivElement>(null)
  // While editing the layout, "You" shows it is locked in place.
  const editing = useLayoutEditing()

  const isOn = (path: string) => activePath === path || activePath.startsWith(path + '/')
  const go = (path: string) => { setOpen(false); onNavigate?.(); navigate(path) }
  const openMock = (which: 'sign-out' | 'remote') => { setOpen(false); setMock(which) }

  return (<>
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverAnchor asChild>
        <div ref={anchor}>
          <NavItem
            path={settings.path}
            label={i18nT('nav.profile_menu_name')}
            icon={<ProfileAvatar size={collapsed ? 22 : 20} />}
            active={open || isOn(settings.path) || isOn(customize.path)}
            collapsed={collapsed}
            // Clicking the avatar opens the menu.
            onClickOverride={() => setOpen(o => !o)}
            badge={editing
              ? <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-bg border border-border text-muted" title={i18nT('nav.layout_locked_title')} aria-label={i18nT('nav.layout_locked_title')}><Lock size={9} /></span>
              : badge}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="right"
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
        <FlyoutRow icon={<Lightbulb size={16} />} label={i18nT('nav.send_feedback')} onClick={() => { setOpen(false); sendFeedback() }} />
        <FlyoutRow icon={customize.icon} label={i18nT('nav.profile_customize_agents')} active={isOn(customize.path)} onClick={() => go(customize.path)} />
        <FlyoutRow icon={<Settings2 size={16} />} label={i18nT('nav.rail_customize')} onClick={() => { setOpen(false); openRailCustomize() }} />
        <div aria-hidden="true" className="my-1 h-px bg-border" />
        {phone && <FlyoutRow icon={<Smartphone size={16} />} label={i18nT('app.connect_your_phone')} onClick={() => { setOpen(false); phone.open() }} />}
        <FlyoutRow icon={<ArrowLeftRight size={16} />} label={i18nT('nav.profile_switch_remote')} onClick={() => openMock('remote')} />
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
    <MockDialog
      open={mock === 'remote'}
      title={i18nT('nav.profile_remote_title')}
      body={i18nT('nav.profile_remote_body')}
      onClose={() => setMock(null)}
    />
  </>)
}
