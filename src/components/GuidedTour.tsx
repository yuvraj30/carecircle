import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useApp } from '../context'
import type { View } from '../types'
import { recordProductEvent } from '../lib/productMeasurement'
import './guided-tour.css'

type TourStep = { label: string; title: string; detail: string; view?: View; samplePath?: string }

const welcome: TourStep = {
  label: 'A LITTLE GUIDANCE',
  title: 'Welcome to CareCircle',
  detail: 'Take a short look around. We’ll guide you through the spaces that make care easier to share.',
}

const sharedSteps: TourStep[] = [
  { label: 'YOUR OVERVIEW', title: 'Start with today', detail: 'See what needs attention and find the next helpful action in one calm view.', view: 'today', samplePath: '/sample' },
  { label: 'THE CARE PLAN', title: 'Share the small things', detail: 'Tasks make it clear what needs doing and who is helping.', view: 'tasks', samplePath: '/sample/tasks' },
  { label: 'MEDICINES', title: 'Keep the plan together', detail: 'Review medicines, schedules and the supply your circle has recorded.', view: 'medicines', samplePath: '/sample/medicines' },
  { label: 'VISITS', title: 'Feel ready for visits', detail: 'Keep appointments and the questions you want to discuss in one place.', view: 'appointments', samplePath: '/sample/appointments' },
  { label: 'YOUR CIRCLE', title: 'Care is a team effort', detail: 'See the people in your circle and how they can share the work.', view: 'circle', samplePath: '/sample/circle' },
  { label: 'YOUR HISTORY', title: 'Look back together', detail: 'The timeline brings care updates together so everyone can catch up.', view: 'timeline', samplePath: '/sample/timeline' },
]

const signedInSteps: TourStep[] = [
  welcome,
  sharedSteps[0],
  { label: 'CARE PROFILE', title: 'A little about them', detail: 'Keep the details that help your family care consistently in the patient profile.', view: 'profile' },
  ...sharedSteps.slice(1, 4),
  { label: 'HEALTH LOG', title: 'Make a note', detail: 'Keep observations in one place to share with the people involved in care.', view: 'health' },
  { label: 'RECORDS', title: 'Keep important details close', detail: 'Find documents and care history in your shared records.', view: 'documents' },
  sharedSteps[5],
  { label: 'WEEKLY DIGEST', title: 'Catch up at a glance', detail: 'Look back on the week’s care activity together.', view: 'digest' },
  sharedSteps[4],
  { label: 'UPDATES', title: 'Stay in the loop', detail: 'Find updates from your circle and catch up when you have a moment.', view: 'notifications' },
  { label: 'YOUR ACCOUNT', title: 'Your details', detail: 'Review your account information in one place.', view: 'account' },
  { label: 'MAKE IT YOURS', title: 'Set your preferences', detail: 'Review your circle’s settings and choose what works for your family.', view: 'settings' },
  { label: 'HERE TO HELP', title: 'Help when you need it', detail: 'Find guidance and answers as you explore CareCircle.', view: 'help' },
]

const sampleSteps: TourStep[] = [
  welcome,
  ...sharedSteps,
  { label: 'TRY THE SAMPLE', title: 'Explore the parent phone', detail: 'Choose Parent phone in the navigation to try a simulated conversation. Nothing is sent.' },
]
const STATUS_EVENT = 'carecircle:tour-status'

function publishTourStatus(open: boolean) {
  document.documentElement.dataset.carecircleTourOpen = String(open)
  window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: { open } }))
}

/** Other guidance can use this to avoid competing with the tour. */
export function useGuidedTourActive() {
  const [active, setActive] = useState(() => document.documentElement.dataset.carecircleTourOpen === 'true')
  useEffect(() => {
    const sync = () => setActive(document.documentElement.dataset.carecircleTourOpen === 'true')
    window.addEventListener(STATUS_EVENT, sync)
    sync()
    return () => window.removeEventListener(STATUS_EVENT, sync)
  }, [])
  return active
}

export function GuidedTour() {
  const { state, actions } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [initializedKey, setInitializedKey] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const autoStarts = useRef(new Set<string>())
  const isSample = state.isSample
  const eligible = isSample
    ? location.pathname === '/sample' || location.pathname.startsWith('/sample/')
    : !state.isLoading && !!state.currentUser && Object.keys(state.circles).length > 0 && ['/app', '/medicines', '/circle'].includes(location.pathname)
  const storageKey = isSample ? 'carecircle-tour-sample-v1' : `carecircle-tour-v1:${state.currentUser?.id ?? ''}:${state.activeCircleId}`
  const steps = isSample ? sampleSteps : signedInSteps

  useEffect(() => {
    const check = () => setModalOpen(!!document.querySelector('[role="dialog"], dialog[open]'))
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'open'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!eligible || initializedKey === storageKey) return
    let seen = false
    try { seen = (isSample ? sessionStorage : localStorage).getItem(storageKey) === 'done' } catch { /* The tour remains available without storage. */ }
    setInitializedKey(storageKey)
    setStepIndex(0)
    setOpen(!seen)
    if (!seen && !autoStarts.current.has(storageKey)) {
      autoStarts.current.add(storageKey)
      recordProductEvent(state.currentUser?.id, isSample, 'tour_started')
    }
  }, [eligible, initializedKey, isSample, storageKey, state.currentUser?.id])

  useEffect(() => {
    const active = eligible && open && initializedKey === storageKey
    publishTourStatus(active)
    return () => { if (active) publishTourStatus(false) }
  }, [eligible, open, initializedKey, storageKey])

  useEffect(() => {
    if (!open || !eligible || modalOpen) return
    heading.current?.focus({ preventScroll: true })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finishTour()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, eligible, stepIndex, modalOpen])

  function finishTour() {
    try { (isSample ? sessionStorage : localStorage).setItem(storageKey, 'done') } catch { /* The user can still dismiss the tour. */ }
    setOpen(false)
  }

  function goToStep(index: number) {
    const next = steps[index]
    setStepIndex(index)
    if (!next.view) return
    if (isSample) {
      if (next.samplePath) navigate(next.samplePath)
    } else {
      // Direct workspace links force their own view; switch to the regular workspace first.
      if (location.pathname !== '/app') navigate('/app')
      actions.setView(next.view)
    }
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  if (!eligible || initializedKey !== storageKey || modalOpen || state.sessionExpired) return null
  if (!open) return <button type="button" className="cc-tour-launch" onClick={() => { recordProductEvent(state.currentUser?.id, isSample, 'tour_started'); setStepIndex(0); setOpen(true) }} aria-label="Start the CareCircle tour"><span aria-hidden="true">✳</span> Take a tour</button>

  const step = steps[stepIndex]
  const last = stepIndex === steps.length - 1
  return <aside className="cc-tour" role="region" aria-label="CareCircle guided tour">
    <div className="cc-tour-top"><span className="cc-tour-mark" aria-hidden="true">✳</span><span>{step.label}</span><button type="button" className="cc-tour-skip" onClick={finishTour} aria-label="Skip the tour">Skip tour <span aria-hidden="true">×</span></button></div>
    <div className="cc-tour-copy" aria-live="polite" aria-atomic="true"><h2 ref={heading} tabIndex={-1}>{step.title}</h2><p>{step.detail}</p></div>
    <div className="cc-tour-progress" aria-label={`Step ${stepIndex + 1} of ${steps.length}`}><span>STEP {stepIndex + 1} OF {steps.length}</span><div aria-hidden="true">{steps.map((_, index) => <i key={index} className={index <= stepIndex ? 'is-filled' : ''} />)}</div></div>
    <div className="cc-tour-actions"><button type="button" className="cc-tour-back" onClick={() => goToStep(stepIndex - 1)} disabled={stepIndex === 0}>Back</button><button type="button" className="cc-tour-next" onClick={() => { if (last) { recordProductEvent(state.currentUser?.id, isSample, 'tour_finished'); finishTour() } else goToStep(stepIndex + 1) }}>{last ? 'Finish tour' : stepIndex === 0 ? 'Show me around' : 'Next'} <span aria-hidden="true">→</span></button></div>
  </aside>
}
