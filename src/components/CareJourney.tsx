import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context'
import { dismissFor14Days, isDismissed } from '../lib/dismissals'
import { setupProgress } from '../lib/setupProgress'
import type { View } from '../types'
import { useGuidedTourActive } from './GuidedTour'
import { recordProductEvent } from '../lib/productMeasurement'
import { dismissDashboardNudge, isInvitationExpired } from '../lib/nudges'
import '../care-journey.css'

type JourneyStep = { id: string; label: string; complete: boolean; view: View }
// Keep only session-memory progress so returning from another page can recognise a first action.
const previousByScope = new Map<string, boolean[]>()

/** A small, truthful view of the foundations already in the active circle. */
export function CareJourney({ suppressSuggestion = false }: { suppressSuggestion?: boolean }) {
  const { state, actions, now } = useApp()
  const tourActive = useGuidedTourActive()
  const [hiddenInSession, setHiddenInSession] = useState<string[]>([])
  const [celebration, setCelebration] = useState<{ scope: string; text: string } | null>(null)
  const lastImpression = useRef('')
  const suggestionRef = useRef<HTMLDivElement>(null)
  const patientId = state.activePatientId
  const scope = `${state.currentUser?.id ?? 'guest'}:${state.activeCircleId}:${patientId}`
  const dismissKey = `care-journey:${scope}`
  const patient = state.patients.find(item => item.id === patientId)
  const otherMembers = state.members.filter(member => member.id !== state.currentUser?.id && member.userId !== state.currentUser?.id)
  const connected = otherMembers.some(member => member.status === 'Active')
  const currentDate = now()
  const invited = otherMembers.some(member => member.status === 'Invited' && !isInvitationExpired(member, currentDate))
  const invitationExpired = otherMembers.some(member => member.status === 'Invited' && isInvitationExpired(member, currentDate))
  const hasMedicine = state.medications.some(medicine => medicine.status !== 'Stopped' && (!medicine.patientId || medicine.patientId === patientId))
  const hasOwnedTask = state.tasks.some(task => task.patientId === patientId && Boolean(task.assigneeId))
  const hasVisit = state.appointments.some(visit => (!visit.patientId || visit.patientId === patientId) && visit.status !== 'Cancelled')
  const consent = patient?.parentChannel.reminders.status
  const hasConsent = consent === 'Agreed'
  const steps: JourneyStep[] = [
    { id: 'connect', label: 'Connect a helper', complete: connected, view: 'circle' },
    { id: 'medicine', label: 'Add a medicine', complete: hasMedicine, view: 'medicines' },
    ...(!state.isSample ? [{ id: 'consent', label: 'Agree to reminders', complete: hasConsent, view: 'profile' as View }] : []),
    { id: 'task', label: 'Share a task', complete: hasOwnedTask, view: 'tasks' },
    { id: 'visit', label: 'Plan a visit', complete: hasVisit, view: 'appointments' },
  ]
  const completed = steps.filter(step => step.complete).length
  const canInvite = state.activeCircleRole === 'coordinator'
  const canEdit = state.activeCircleRole !== 'view-only'
  const suggestion = state.isSample
    ? { title: 'See how care gets shared', detail: 'Explore an example task and see who is helping. This is fictional sample data.', label: 'Explore tasks', view: 'tasks' as View }
    : !connected && canInvite
      ? invited
        ? { title: 'Your invitation is waiting', detail: 'Share the invitation link with your helper. They connect after they accept.', label: 'View circle', view: 'circle' as View }
        : invitationExpired
          ? { title: 'Create a new invitation link', detail: 'The previous link has expired or is unavailable. Create a new one if they still want to join.', label: 'View circle', view: 'circle' as View }
        : { title: 'Make your first connection', detail: 'Create and share an invitation link with someone you trust.', label: 'Open circle', view: 'circle' as View }
      : !hasMedicine && canEdit
        ? { title: 'Add the first medicine', detail: 'Keep the family’s medicine instructions together.', label: 'Open medicines', view: 'medicines' as View }
        : consent === 'Not asked' && canInvite
          ? { title: 'Talk about reminders', detail: 'Review the simulated reminder request together and ask for their agreement.', label: 'Review request', view: 'profile' as View }
          : consent === 'Asked' && canInvite
            ? { title: 'Waiting for an answer', detail: 'The simulated reminder request is awaiting a response. Review its status in the patient profile.', label: 'Review request', view: 'profile' as View }
        : !hasOwnedTask && canEdit
          ? { title: 'Give one task an owner', detail: 'A named helper makes the next step easier to coordinate.', label: 'Open care plan', view: 'tasks' as View }
          : !hasVisit && canEdit
            ? { title: 'Prepare for the next visit', detail: 'Add an appointment to keep its details with the care plan.', label: 'Open visits', view: 'appointments' as View }
            : { title: 'Explore your care circle', detail: 'See the people and care updates available to you.', label: 'View circle', view: 'circle' as View }

  // Count only recorded activity, not care quality or medication adherence.
  const currentTime = currentDate.getTime()
  const weekEvents = state.careEvents.filter(event => event.patientId === patientId && Date.parse(event.at) >= currentTime - 7 * 24 * 60 * 60 * 1000 && Date.parse(event.at) <= currentTime)
  const completedTaskCount = new Set(weekEvents.filter(event => event.kind === 'task_completed').map(event => event.taskId || event.id)).size
  const helpersCount = new Set(weekEvents.filter(event => event.actorType === 'member' && event.actorId && ['task_accepted', 'task_taken', 'task_completed', 'family_confirmed', 'not_taken_recorded', 'refill_done'].includes(event.kind)).map(event => event.actorId)).size
  const upcomingVisitCount = state.appointments.filter(visit => (!visit.patientId || visit.patientId === patientId) && ['Upcoming', 'Confirmed'].includes(visit.status) && Date.parse(visit.datetime) >= currentTime).length
  const visible = !tourActive && !state.isLoading && Boolean(patient) && !hiddenInSession.includes(dismissKey) && (state.isSample || !isDismissed(dismissKey, now()))

  useEffect(() => {
    if (!visible || suppressSuggestion || celebration?.scope === scope || state.isSample || !suggestionRef.current || typeof IntersectionObserver === 'undefined') return
    const impression = `${scope}:${suggestion.view}:${suggestion.title}`
    if (lastImpression.current === impression) return
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) return
      if (lastImpression.current !== impression) {
        lastImpression.current = impression
        recordProductEvent(state.currentUser?.id, false, 'nudge_shown')
      }
      observer.disconnect()
    }, { threshold: 0.5 })
    observer.observe(suggestionRef.current)
    return () => observer.disconnect()
  }, [visible, suppressSuggestion, celebration, scope, suggestion.view, suggestion.title, state.currentUser?.id, state.isSample])

  // Celebrate a change made in this session, never pre-existing or fictitious achievements.
  useEffect(() => {
    if (state.isLoading || !patientId || state.isSample) return
    const values = [connected, hasMedicine, hasConsent, hasOwnedTask, hasVisit]
    const previous = previousByScope.get(scope)
    if (previous) {
      const index = values.findIndex((value, position) => value && !previous[position])
      const messages = ['Your first helper is connected.', 'Your first medicine is in place.', 'Reminder agreement is recorded.', 'A care task has an owner.', 'A visit is in the plan.']
      if (index >= 0) setCelebration({ scope, text: messages[index] })
    }
    previousByScope.set(scope, values)
  }, [scope, state.isLoading, state.isSample, patientId, connected, hasMedicine, hasConsent, hasOwnedTask, hasVisit])

  if (!visible) return null

  function hide() {
    if (!suppressSuggestion && celebration?.scope !== scope && lastImpression.current === `${scope}:${suggestion.view}:${suggestion.title}`) recordProductEvent(state.currentUser?.id, state.isSample, 'nudge_dismissed')
    if (!suppressSuggestion && celebration?.scope !== scope) dismissDashboardNudge(state, 'care-journey-suggestion', now())
    setHiddenInSession(current => [...current, dismissKey])
    if (!state.isSample) dismissFor14Days(dismissKey, now())
  }

  return <section className="cc-journey" aria-labelledby="care-journey-title">
    <div className="cc-journey-heading">
      <div><span className="cc-journey-kicker">{state.isSample ? 'EXPLORE THE SAMPLE' : 'BUILD YOUR CIRCLE'}</span><h2 id="care-journey-title">{state.isSample ? 'A little care, shared' : 'Make care feel lighter'}</h2></div>
      <button type="button" className="cc-journey-hide" onClick={hide}>{state.isSample ? 'Hide' : 'Hide for 14 days'}</button>
    </div>
    <div className={'cc-journey-body' + (suppressSuggestion ? ' cc-journey-body-progress-only' : '')}>
      {!suppressSuggestion && <div ref={suggestionRef} className="cc-journey-suggestion" aria-live="polite"><span className="cc-journey-spark" aria-hidden="true">✳</span><div>{celebration?.scope === scope ? <><p className="cc-journey-label">A MOMENT TO RECOGNISE</p><h3>{celebration.text}</h3><p>One more thing in place for your circle.</p><button type="button" className="cc-journey-action" onClick={() => setCelebration(null)}>Continue <span aria-hidden="true">→</span></button></> : <><p className="cc-journey-label">A THOUGHTFUL NEXT STEP</p><h3>{suggestion.title}</h3><p>{suggestion.detail}</p><button type="button" className="cc-journey-action" onClick={() => { recordProductEvent(state.currentUser?.id, state.isSample, 'nudge_accepted'); actions.setView(suggestion.view) }}>{suggestion.label}<span aria-hidden="true"> ↗</span></button></>}</div></div>}
      <div className="cc-journey-progress"><div className="cc-journey-progress-head"><span>{state.isSample ? 'In this example' : 'Care foundations'}</span><strong>{completed} of {steps.length} in place</strong></div><div className="cc-journey-track" role="progressbar" aria-label="Care foundations in place" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={completed}><span style={{ width: `${completed / steps.length * 100}%` }} /></div><ul>{steps.map(step => <li key={step.id}><button type="button" onClick={() => actions.setView(step.view)}><span className={'cc-journey-step-icon' + (step.complete ? ' is-complete' : '')} aria-hidden="true">{step.complete ? '✓' : '○'}</span><span>{step.label}</span><span className="cc-journey-step-status">{step.complete ? 'In place' : step.id === 'connect' && invited ? 'Invited' : step.id === 'connect' && invitationExpired ? 'Link expired' : step.id === 'consent' && consent === 'Asked' ? 'Awaiting reply' : step.id === 'consent' && (consent === 'Declined' || consent === 'Withdrawn') ? 'Not agreed' : 'Explore'}</span></button></li>)}</ul></div>
    </div>
    <details className="cc-journey-recap"><summary>Care recap <span>Recorded activity</span></summary><div className="cc-journey-recap-grid"><div><strong>{completedTaskCount}</strong><span>{completedTaskCount === 1 ? 'task completion' : 'task completions'} in the last 7 days</span></div><div><strong>{helpersCount}</strong><span>{helpersCount === 1 ? 'person' : 'people'} recorded care actions in the last 7 days</span></div><div><strong>{upcomingVisitCount}</strong><span>upcoming {upcomingVisitCount === 1 ? 'visit' : 'visits'}</span></div></div><p>{state.isSample ? 'This recap uses fictional sample activity.' : 'Counts reflect recorded actions, not a measure of health or medication adherence.'}</p></details>
    <details className="cc-journey-milestones"><summary>Care milestones</summary><ul>{setupProgress(state).milestones.map(item => <li key={item.id}><span aria-hidden="true">{item.complete ? '✓' : '○'}</span> {item.title}<small>{item.complete ? 'In place' : 'Ahead'}</small></li>)}</ul>{state.isSample && <p>Milestones shown are fictional sample activity.</p>}</details>
  </section>
}
