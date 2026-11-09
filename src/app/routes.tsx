import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router'
import { useEffect } from 'react'
import { Workspace } from '../App'
import { AppProvider, useApp } from '../context'
import { CreateAccount, ForgotPassword, Invitation, Login, PasswordSuccess, SetPassword, VerifyEmail } from '../pages/AuthFlow'
import { Onboarding } from '../pages/Onboarding'
import { useAuthStatus } from '../auth/AuthStatus'
import { GateProvider } from '../auth/Gate'
import { PublicLanding, SampleShell } from '../pages/Public'
import { Dashboard } from '../pages/Dashboard'
import { Medicines } from '../pages/Medicines'
import { CareCircle, Tasks } from '../pages/Management'
import { Appointments } from '../pages/Appointments'
import { Timeline } from '../pages/Timeline'
import { SessionExpiredOverlay } from '../components/SessionExpiredOverlay'
import { GuidedTour } from '../components/GuidedTour'
import { ProductMeasurementObserver } from '../components/ProductMeasurement'

function AppProviderRoute() {
  return <GateProvider><AppProvider><Outlet /><GuidedTour /><ProductMeasurementObserver /><SessionExpiredOverlay /></AppProvider></GateProvider>
}

function SampleProviderRoute() {
  return <GateProvider sample><AppProvider sample><SampleShell /></AppProvider></GateProvider>
}

function LandingRoute() {
  const auth = useAuthStatus()
  if (auth.loading) return <PublicLanding />
  if (auth.user) return <Navigate to="/app" replace />
  return <PublicLanding />
}

function WorkspaceSkeleton() {
  return <div className="min-h-screen bg-stone-50 p-6 lg:p-10 animate-pulse"><div className="max-w-6xl mx-auto space-y-5"><div className="h-10 w-64 rounded-xl bg-slate-200" /><div className="grid md:grid-cols-3 gap-4">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-36 rounded-3xl bg-white border border-slate-200" />)}</div><div className="h-72 rounded-3xl bg-white border border-slate-200" /></div></div>
}

function ProtectedWorkspace() {
  const { state } = useApp()
  if (state.isLoading) return <WorkspaceSkeleton />
  if (!state.currentUser) return <Navigate to="/login" replace />
  return Object.keys(state.circles).length ? <Workspace /> : <Navigate to="/onboarding" replace />
}

function DirectWorkspace({ view }: { view: 'medicines' | 'circle' }) {
  const { state, actions } = useApp()
  const location = useLocation()
  useEffect(() => {
    if (!state.isLoading && state.currentUser && Object.keys(state.circles).length && state.view !== view) actions.setView(view)
  }, [actions, state.circles, state.currentUser, state.isLoading, state.view, view])
  if (state.isLoading) return <WorkspaceSkeleton />
  if (!state.currentUser) return <Navigate to="/login" replace />
  if (!Object.keys(state.circles).length) {
    const action = new URLSearchParams(location.search).get('action') ?? ''
    return <Navigate to={`/onboarding?returnTo=${encodeURIComponent(location.pathname)}&action=${encodeURIComponent(action)}`} replace />
  }
  return <Workspace />
}

export const router = createBrowserRouter([{
  children: [
    { path: '/', Component: LandingRoute },
    {
      Component: SampleProviderRoute,
      children: [
        { path: '/sample', Component: Dashboard },
        { path: '/sample/medicines', Component: Medicines },
        { path: '/sample/circle', Component: CareCircle },
        { path: '/sample/tasks', Component: Tasks },
        { path: '/sample/appointments', Component: Appointments },
        { path: '/sample/timeline', Component: Timeline },
      ],
    },
    {
      Component: AppProviderRoute,
      children: [
        { path: '/login', Component: Login },
        { path: '/create-account', Component: CreateAccount },
        { path: '/verify-email', Component: VerifyEmail },
        { path: '/forgot-password', Component: ForgotPassword },
        { path: '/set-password', Component: SetPassword },
        { path: '/password-success', Component: PasswordSuccess },
        { path: '/invite/:status', Component: Invitation },
        { path: '/onboarding', Component: Onboarding },
        { path: '/app', Component: ProtectedWorkspace },
        { path: '/medicines', element: <DirectWorkspace view="medicines" /> },
        { path: '/circle', element: <DirectWorkspace view="circle" /> },
      ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
}
])
