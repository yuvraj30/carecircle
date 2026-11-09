import { Link, NavLink, Outlet, useNavigate, useSearchParams } from 'react-router'
import { useEffect, useState } from 'react'
import { useAuthStatus } from '../auth/AuthStatus'
import { Button, Card, Dialog } from '../components/ui'
import { HeartIcon, PillIcon, UsersIcon, HomeIcon, ChatBubbleIcon, CheckCircleIcon, CalendarIcon } from '../components/icons'
import { useApp } from '../context'
import { GuidedTour } from '../components/GuidedTour'
import { AlertDetailModal } from '../components/AlertDetailModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { PhonePane } from '../components/PhonePane'
import { ToastContainer } from '../components/ToastContainer'
import type { View } from '../types'

export function PublicLanding() {
  const auth = useAuthStatus()
  return <main className="cc-welcome">
    <header className="cc-welcome-nav"><Link to="/" className="cc-welcome-brand"><span><HeartIcon className="w-5 h-5" /></span>CareCircle</Link><Link className="cc-welcome-login" to="/login">Log in <span aria-hidden="true">↗</span></Link></header>
    <div className="cc-welcome-grid"><section className="cc-welcome-copy"><span className="cc-welcome-kicker"><span /> CARE, TOGETHER</span><h1>Care feels lighter<br /><em>when it's shared.</em></h1><p>One thoughtful place for medicines, everyday tasks and the people who help.</p><div className="cc-welcome-actions"><Link to="/sample" className="cc-welcome-primary">Explore a sample day <span aria-hidden="true">↗</span></Link><Link to="/create-account" className="cc-welcome-secondary">Create my circle <span aria-hidden="true">→</span></Link></div><div className="cc-welcome-footnote"><span>✳</span><p>The sample is fictional. Nothing is saved or sent.</p></div></section>
    <aside className="cc-welcome-art" aria-label="An example of a shared care overview"><div className="cc-welcome-art-top"><span>YOUR CIRCLE</span><span>AN EXAMPLE</span></div><div className="cc-welcome-art-title"><span className="cc-welcome-avatar">L</span><div><small>CARING FOR</small><strong>Lakshmi</strong></div><span className="cc-welcome-art-dot">✳</span></div><div className="cc-welcome-art-list"><div><i className="cc-art-icon">✓</i><span><strong>Today's care</strong><small>Shared with your family</small></span><b>01</b></div><div><i className="cc-art-icon cc-art-icon-gold">↗</i><span><strong>A little help</strong><small>Know who is following up</small></span><b>02</b></div><div><i className="cc-art-icon cc-art-icon-peach">♡</i><span><strong>In their words</strong><small>Stay close to what matters</small></span><b>03</b></div></div><div className="cc-welcome-art-bottom"><span>Care is a shared journey.</span><span>✳</span></div></aside></div>
    <footer className="cc-welcome-disclaimer">CareCircle supports coordination. It does not diagnose, prescribe, change doses or contact emergency services.</footer>{auth.loading && <span className="sr-only">Checking sign-in status</span>}
  </main>
}

// The sample is routed by URL, but dashboard buttons ask the app to switch views. Pages the sample
// has are opened by address; the rest explain that they live in the family's own circle.
const SAMPLE_PATHS: Partial<Record<View, string>> = { today: '/sample', medicines: '/sample/medicines', circle: '/sample/circle', tasks: '/sample/tasks', appointments: '/sample/appointments', timeline: '/sample/timeline' }
const VIEW_NAMES: Partial<Record<View, [title: string, noun: string]>> = {
  tasks: ['Care tasks are in your own circle', 'care tasks'],
  appointments: ['Appointments are in your own circle', 'appointments'],
  timeline: ['The care timeline is in your own circle', 'the care timeline'],
  documents: ['Records are in your own circle', 'records'],
  digest: ['The weekly digest is in your own circle', 'the weekly digest'],
}

const SAMPLE_NAV: [string, string, typeof HomeIcon][] = [
  ['/sample', 'Today', HomeIcon],
  ['/sample/medicines', 'Medicines', PillIcon],
  ['/sample/tasks', 'Tasks', CheckCircleIcon],
  ['/sample/appointments', 'Visits', CalendarIcon],
  ['/sample/circle', 'Circle', UsersIcon],
]

export function SampleShell() {
  const { state, actions } = useApp()
  const navigate = useNavigate()
  const [ownCircleView, setOwnCircleView] = useState<View | null>(null)
  useEffect(() => {
    if (state.view === 'today') return
    const path = SAMPLE_PATHS[state.view]
    if (path) navigate(path)
    else setOwnCircleView(state.view)
    const appointmentId = state.view === 'appointments' ? state.appointmentDetailId : null
    actions.setView('today')
    if (appointmentId) actions.openAppointmentDetail(appointmentId)
  }, [actions, navigate, state.view, state.appointmentDetailId])
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const action = searchParams.get('action')
    const alertId = action?.startsWith('confirm-dose:') ? action.slice('confirm-dose:'.length) : ''
    if (alertId && state.alertDetailId !== alertId) {
      actions.openAlertDetail(alertId)
      const next = new URLSearchParams(searchParams)
      next.delete('action')
      setSearchParams(next, { replace: true })
    }
  }, [actions, searchParams, setSearchParams, state.alertDetailId])
  return <div className="cc-sample-shell min-h-screen">
    <div className="cc-sample-notice">Sample — nothing is saved or sent</div>
    <header className="cc-sample-header sticky top-0 z-20">
      <div className="max-w-[1440px] mx-auto px-4 lg:px-8 h-16 flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2 mr-auto"><span className="w-9 h-9 rounded-xl bg-[#DEEDE7] flex items-center justify-center"><HeartIcon className="w-5 h-5 text-[#346B63]" /></span><strong className="text-slate-800">CareCircle sample</strong></Link>
        <nav className="hidden md:flex items-center gap-1" aria-label="Sample navigation">
          {SAMPLE_NAV.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/sample'} className={({ isActive }) => `flex items-center gap-2 min-h-11 px-3 rounded-xl text-sm font-semibold ${isActive ? 'bg-[#E9F1EC] text-[#346B63]' : 'text-slate-500'}`}><Icon className="w-4 h-4" />{label}</NavLink>)}
        </nav>
        <span className="hidden md:block"><Button variant="ghost" onClick={() => actions.togglePhonePane()}><ChatBubbleIcon className="w-4 h-4" /> Parent phone</Button></span>
      </div>
    </header>
    <main className="max-w-[1440px] mx-auto px-4 pt-6 pb-28 md:pb-8 lg:px-8 lg:py-8"><Outlet /></main>
    {/* Phones: the same bottom tab bar the signed-in app uses, so the header never runs off the screen. */}
    <nav className="cc-sample-bottom md:hidden fixed bottom-0 inset-x-0 z-20 flex" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Sample navigation">
      {SAMPLE_NAV.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/sample'} className={({ isActive }) => `cc-tab flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-2 ${isActive ? 'text-[#14574A]' : 'text-slate-500'}`}><span className="cc-tab-icon"><Icon className="w-5 h-5" /></span><span className="text-[12px] font-semibold">{label}</span></NavLink>)}
      <button type="button" onClick={() => actions.togglePhonePane()} className={`cc-tab flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-2 ${state.phonePaneOpen ? 'text-[#14574A]' : 'text-slate-500'}`} aria-pressed={state.phonePaneOpen}><span className="cc-tab-icon"><ChatBubbleIcon className="w-5 h-5" /></span><span className="text-[12px] font-semibold">Parent phone</span></button>
    </nav>
    {state.alertDetailId && <AlertDetailModal />}
    {state.confirmConfig && <ConfirmModal />}
    <PhonePane />
    <ToastContainer />
    <GuidedTour />
    {ownCircleView && <Dialog title={VIEW_NAMES[ownCircleView]?.[0] ?? 'This page is in your own circle'} onClose={() => setOwnCircleView(null)}>
      <p className="text-sm text-slate-600">The sample shows Today, Medicines, Tasks, Visits and Circle. Log in or create an account to open {VIEW_NAMES[ownCircleView]?.[1] ?? 'this page'} for your own family.</p>
      <div className="grid grid-cols-2 gap-3 mt-5">
        <Link to="/login"><Button className="w-full">Log in</Button></Link>
        <Link to="/create-account"><Button variant="secondary" className="w-full">Create account</Button></Link>
      </div>
      <button type="button" className="cc-text-link mt-3" onClick={() => setOwnCircleView(null)}>Keep exploring the sample</button>
    </Dialog>}
  </div>
}
