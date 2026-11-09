import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../context'
import {
  HomeIcon, CalendarIcon, PillIcon, ClipboardIcon, FolderIcon,
  ArrowPathIcon, ArrowRightOnRectangleIcon, HeartIcon, UserIcon,
  CheckCircleIcon, UsersIcon, BellIcon,
} from './icons'
import type { View } from '../types'
import { unreadCareEvents } from '../lib/notifications'
import { deriveStage } from '../lib/stage'
import { Button } from './ui'

export const NAV_GROUPS: { primary: View; label: string; Icon: React.ComponentType<{ className?: string }>; views: View[]; stage: number }[] = [
  { primary: 'today', label: 'Today', Icon: HomeIcon, views: ['today'], stage: 1 },
  { primary: 'profile', label: 'Patient', Icon: UserIcon, views: ['profile'], stage: 1 },
  { primary: 'tasks', label: 'Care plan', Icon: CheckCircleIcon, views: ['tasks', 'medicines', 'appointments', 'health'], stage: 1 },
  { primary: 'documents', label: 'Records', Icon: FolderIcon, views: ['documents', 'timeline', 'digest'], stage: 3 },
  { primary: 'circle', label: 'Circle', Icon: UsersIcon, views: ['circle', 'notifications'], stage: 4 },
]

const VIEW_LABELS: Partial<Record<View, string>> = {
  tasks: 'Tasks', medicines: 'Medicines', appointments: 'Appointments', health: 'Health Log',
  documents: 'Documents', timeline: 'Timeline', digest: 'Weekly digest', circle: 'Care Circle', notifications: 'Notifications',
}

export function Layout({ children }: { children: ReactNode }) {
  const { state, actions } = useApp()
  const { currentUser, view, patients, activePatientId } = state
  const authorizedCircles = Object.values(state.circles).filter(circle =>
    circle.members.some(member => member?.userId === currentUser?.id && member.status === 'Active')
  )
  const unreadCount = unreadCareEvents(state).length
  const stage = deriveStage(state)
  const visibleGroups = NAV_GROUPS.filter(group => group.stage <= stage)
  const moreGroups = NAV_GROUPS.filter(group => group.stage > stage)
  const mobileGroup = NAV_GROUPS.find(group => group.views.includes(view))
  const [moreOpen, setMoreOpen] = useState(false)
  const [retryingCommit, setRetryingCommit] = useState(false)
  const openView = (target: View) => { actions.setView(target); setMoreOpen(false) }
  const retryCommit = async () => {
    setRetryingCommit(true)
    try { await actions.retryCommit() } finally { setRetryingCommit(false) }
  }
  useEffect(() => { window.scrollTo({ top: 0 }) }, [view])

  return (
    <div className="cc-shell flex min-h-screen" style={{ backgroundColor: '#FAF8F3' }}>

      {/* ── Desktop sidebar ── */}
      <aside
        className="cc-sidebar hidden lg:flex flex-col w-64 fixed inset-y-0 left-0 z-20"
        style={{ backgroundColor: '#FFFEFB', borderRight: '1px solid #E3E8E0' }}
      >
        {/* Brand */}
        <div className="cc-shell-brand px-5 py-4" style={{ borderBottom: '1px solid #E3E8E0' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#DEEDE7' }}>
              <HeartIcon className="w-6 h-6 text-[#346B63]" />
            </div>
            <div>
              <div className="font-bold text-slate-800 text-xl leading-tight">CareCircle</div>
              <div className="text-xs text-slate-500">Family caregiving</div>
            </div>
          </div>
          <label className="block mt-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Care circle
            <select
              className="mt-1.5 w-full min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm normal-case tracking-normal text-slate-700"
              value={state.activeCircleId}
              onChange={e => actions.switchCircle(e.target.value)}
            >
              {authorizedCircles.map(circle => {
                const membership = circle.members.find(member => member?.userId === currentUser?.id && member.status === 'Active')
                return <option key={circle.id} value={circle.id}>{circle.id === state.activeCircleId ? state.circleName : circle.name} · {membership?.role}</option>
              })}
            </select>
          </label>
        </div>

        {/* ── Patient switcher ── */}
        <div className="cc-shell-patients px-4 pt-4 pb-3" style={{ borderBottom: '1px solid #E3E8E0' }}>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5 px-1">Caring for</p>
          <div className="space-y-1.5">
            {patients.filter(patient => !patient.archived).map(patient => {
              const isActive = patient.id === activePatientId
              return (
                <button
                  key={patient.id}
                  onClick={() => !isActive && actions.switchPatient(patient.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                    isActive
                      ? 'shadow-sm'
                      : 'hover:bg-slate-50'
                  }`}
                  style={isActive ? { backgroundColor: `${patient.accentColor}18`, border: `1.5px solid ${patient.accentColor}50` } : { border: '1.5px solid transparent' }}
                  aria-pressed={isActive}
                  aria-label={`Switch to ${patient.name}'s care profile`}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                    style={{ backgroundColor: patient.accentColor }}
                  >
                    {patient.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold truncate ${isActive ? 'text-slate-800' : 'text-slate-600'}`}>
                      {patient.name}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      Age {patient.age} · {patient.conditions[0]}
                    </p>
                  </div>
                  {isActive && (
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: patient.accentColor }}
                      aria-hidden="true"
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Nav */}
        <nav className="cc-shell-navigation flex-1 px-3 mt-3 space-y-0.5 overflow-y-auto min-h-0" aria-label="Main navigation">
          {visibleGroups.map(group => {
            const active = group.views.includes(view)
            const Icon = group.Icon
            return <div key={group.primary}><button onClick={() => openView(group.primary)} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all text-left" style={active ? { backgroundColor: '#E9F1EC', color: '#346B63' } : { color: '#597069' }} aria-current={view === group.primary ? 'page' : undefined}><Icon className="w-5 h-5 flex-shrink-0" />{group.label}{group.primary === 'circle' && unreadCount > 0 && <span className="ml-auto text-xs">{unreadCount}</span>}</button>{active && group.views.length > 1 && <div className="cc-sub-nav">{group.views.map(target => <button key={target} onClick={() => openView(target)} aria-current={view === target ? 'page' : undefined}>{VIEW_LABELS[target]}</button>)}</div>}</div>
          })}
          <button onClick={() => setMoreOpen(value => !value)} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-left text-slate-500 hover:bg-slate-50" aria-expanded={moreOpen}>More <span className="ml-auto">{moreOpen ? '−' : '+'}</span></button>
          {moreOpen && <div className="rounded-xl bg-slate-50 p-2 space-y-1">{moreGroups.map(group => <button key={group.primary} onClick={() => openView(group.primary)} className="w-full text-left rounded-lg px-3 py-2 text-sm text-slate-600">{group.label}</button>)}{(['account', 'settings', 'help'] as View[]).map(target => <button key={target} onClick={() => openView(target)} className="w-full text-left rounded-lg px-3 py-2 text-sm text-slate-600 capitalize">{target}</button>)}</div>}
        </nav>

        {/* Bottom */}
        <div className="cc-shell-footer px-3 pb-4 space-y-1" style={{ borderTop: '1px solid #E3E8E0', paddingTop: '12px' }}>
          <button
            onClick={actions.resetDemo}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
          >
            <ArrowPathIcon className="w-4 h-4 flex-shrink-0" />
            Reload care data
          </button>
          <button
            onClick={actions.signOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4 flex-shrink-0" />
            Sign out
          </button>

          {/* Current user */}
          <div className="rounded-xl px-3 py-3 mt-1" style={{ backgroundColor: '#F2F4EE' }}>
            <div className="flex items-center gap-2.5 mb-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                style={{ backgroundColor: currentUser?.color }}
              >
                {currentUser?.initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800 truncate">{currentUser?.name}</p>
                <p className="text-[11px] text-slate-500 capitalize">{currentUser?.role} · {currentUser?.relation}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <header
        className="cc-shell-mobile-header lg:hidden fixed top-0 left-0 right-0 z-20 flex items-center px-4 h-14"
        style={{ backgroundColor: '#FFFEFB', borderBottom: '1px solid #E3E8E0' }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#DEEDE7' }}>
            <HeartIcon className="w-3.5 h-3.5 text-[#346B63]" />
          </div>
          <span className="font-semibold text-slate-800 text-sm flex-shrink-0">CareCircle</span>
          {/* Mobile patient switcher */}
          <div className="flex gap-1.5 ml-2 overflow-x-auto">
            {patients.filter(p => !p.archived).map(p => {
              const isActive = p.id === activePatientId
              return (
                <button
                  key={p.id}
                  onClick={() => !isActive && actions.switchPatient(p.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex-shrink-0"
                  style={
                    isActive
                      ? { backgroundColor: `${p.accentColor}22`, color: p.accentColor, border: `1.5px solid ${p.accentColor}50` }
                      : { backgroundColor: '#F2F4EE', color: '#64748B', border: '1.5px solid #E3E8E0' }
                  }
                  aria-pressed={isActive}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0"
                    style={{ backgroundColor: p.accentColor }}
                  >
                    {p.initials[0]}
                  </span>
                  {p.name.split(' ')[0]}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          <button
            onClick={actions.resetDemo}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
            aria-label="Reload care data"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 lg:ml-64 pt-14 lg:pt-0 pb-20 lg:pb-0 min-h-screen min-w-0">
        <header className="cc-shell-topbar hidden lg:flex h-16 items-center justify-between px-8 xl:px-10 bg-white border-b border-slate-200/80 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
              style={{ backgroundColor: patients.find(p => p.id === activePatientId)?.accentColor }}
            >
              {patients.find(p => p.id === activePatientId)?.initials}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{patients.find(p => p.id === activePatientId)?.name}</p>
              <p className="text-[11px] text-slate-400">Active care profile</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => actions.setView('notifications')} className="relative p-2 rounded-xl text-slate-500 hover:bg-slate-100" aria-label={`${unreadCount} unread notifications`}>
              <BellIcon className="w-5 h-5" />
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-amber-100 text-amber-700 text-[10px] flex items-center justify-center">{unreadCount}</span>}
            </button>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Circle role</span>
            <div className="flex items-center gap-2 rounded-full bg-slate-100 py-1.5 pl-1.5 pr-3">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                style={{ backgroundColor: currentUser?.color }}
              >
                {currentUser?.initials}
              </div>
              <span className="text-xs font-semibold text-slate-700 capitalize">{state.activeCircleRole}</span>
            </div>
          </div>
        </header>
        <div className="w-full max-w-[1440px] mx-auto px-4 py-6 lg:px-8 xl:px-10 lg:py-8">
          <div className="cc-prototype-note" role="note"><strong>Prototype:</strong> WhatsApp messages are simulated. Reminders advance only while the app is open; do not rely on this for real care.</div>
          {state.commitError && <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert"><span><b>Not saved</b> — {state.commitError.message}</span><Button variant="secondary" disabled={retryingCommit} onClick={retryCommit}>{retryingCommit ? 'Retrying…' : 'Retry'}</Button></div>}
          {mobileGroup && mobileGroup.views.length > 1 && <nav className="cc-subtabs lg:hidden" aria-label="Section">{mobileGroup.views.map(target => <button key={target} type="button" onClick={() => openView(target)} aria-current={view === target ? 'page' : undefined}>{VIEW_LABELS[target]}</button>)}</nav>}
          {children}
        </div>
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav
        className="cc-shell-mobile-nav lg:hidden fixed bottom-0 left-0 right-0 z-20 flex overflow-x-auto"
        style={{ backgroundColor: '#FFFEFB', borderTop: '1px solid #E3E8E0' }}
        aria-label="Mobile navigation"
      >
        {visibleGroups.map(group => {
          const active = group.views.includes(view)
          const Icon = group.Icon
          return (
            <button
              key={group.primary}
              type="button"
              onClick={() => openView(group.primary)}
              className={`cc-tab flex-1 min-w-0 flex flex-col items-center gap-1 py-2 ${active ? 'text-[#14574A]' : 'text-slate-500'}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="cc-tab-icon"><Icon className="w-5 h-5" />{group.primary === 'circle' && unreadCount > 0 && <span className="cc-tab-dot" aria-label={`${unreadCount} unread`}>{unreadCount}</span>}</span>
              <span className="text-[12px] font-semibold">{group.label}</span>
            </button>
          )
        })}
        <button type="button" onClick={() => setMoreOpen(value => !value)} className="cc-tab flex-1 min-w-0 flex flex-col items-center gap-1 py-2 text-slate-500" aria-expanded={moreOpen}><span className="cc-tab-icon text-xl">•••</span><span className="text-[12px] font-semibold">More</span></button>
      </nav>
      {moreOpen && <div className="lg:hidden fixed bottom-16 inset-x-3 z-30 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"><div className="grid grid-cols-2 gap-2">{moreGroups.map(group => <Button key={group.primary} variant="secondary" onClick={() => openView(group.primary)}>{group.label}</Button>)}{(['account', 'settings', 'help'] as View[]).map(target => <Button key={target} variant="ghost" className="capitalize" onClick={() => openView(target)}>{target}</Button>)}</div></div>}
    </div>
  )
}
