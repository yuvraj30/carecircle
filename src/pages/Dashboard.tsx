import '../dashboard-refresh.css'
import '../dashboard-calm.css'
import { focusTask } from '../lib/taskNavigation'
import { useApp } from '../context'
import { CalendarIcon, CheckCircleIcon, ChevronRightIcon, PillIcon, ClockIcon } from '../components/icons'
import { AlertSourceStatus } from '../components/AlertSourceStatus'
import { Button, Card } from '../components/ui'
import { canMemberSeeParentReplies, eventTextForMember, shortTime } from '../lib/careEvents'
import { useEffect, useRef, useState } from 'react'
import type { CareEvent, CareTask, Appointment, Medication, MedicationAlert, View } from '../types'
import { deriveStage, isNewInvitee } from '../lib/stage'
import { dismissDashboardNudge, isNudgeCooldownActive, prioritizedDashboardNudge } from '../lib/nudges'
import { CareJourney } from '../components/CareJourney'
import { useGuidedTourActive } from '../components/GuidedTour'
import { recordProductEvent } from '../lib/productMeasurement'
import { clockLabel as fmt12h, clockOf, dayAndClock, lateBy } from '../lib/time'
function dueLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value || 'No due date' : dayAndClock(date)
}
function TaskStatus({ task }: { task: CareTask }) {
  const label = task.status === 'Completed' ? 'Done' : task.response === 'Declined' ? 'Declined' : task.status === 'In progress' ? 'In progress' : task.response === 'Accepted' ? 'Accepted' : task.assigneeId ? 'Awaiting response' : 'Needs an owner'
  return <span className={'cc-status ' + (task.status === 'Completed' ? 'cc-status-done' : task.response === 'Declined' ? 'cc-status-warning' : task.assigneeId ? 'cc-status-pending' : 'cc-status-neutral')}>{label}</span>
}

function NewInviteeWelcome() {
  const { state, actions } = useApp()
  const joined = [...state.careEvents].reverse().find(event =>
    event.kind === 'member_added' &&
    (event.memberId === state.currentUser?.id || event.targetId === state.currentUser?.id)
  )
  const inviter = state.members.find(member => (member.userId ?? member.id) === joined?.actorId)
    ?? state.members.find(member => member.role === 'coordinator')
  const task = state.tasks.find(item => item.patientId === state.activePatientId && item.assigneeId === state.currentUser?.id && item.status !== 'Completed')
    ?? state.tasks.find(item => item.patientId === state.activePatientId && !item.assigneeId && item.status !== 'Completed')
  const canRespond = Boolean(task && (!task.assigneeId || task.assigneeId === state.currentUser?.id) && task.response === 'Waiting')
  return <div className="max-w-2xl mx-auto space-y-5"><header className="cc-page-hero"><div><span className="cc-page-hero-eyebrow">Welcome to the circle</span><h1>{inviter?.name ?? 'The coordinator'} invited you</h1><p>Start with one care task. You can explore the rest of the circle after responding.</p></div></header>{task ? <Card className="p-6"><p className="text-xs font-semibold text-slate-400">One task to start</p><h2 className="text-lg font-semibold text-slate-800 mt-2">{task.title}</h2><p className="text-sm text-slate-500 mt-2">{task.description}</p><p className="text-xs text-slate-400 mt-3">Due {dueLabel(task.due)}</p><div className="flex gap-2 mt-5">{canRespond ? <><Button onClick={() => actions.respondToTask(task.id, 'Accepted')}>Accept</Button><Button variant="secondary" onClick={() => actions.respondToTask(task.id, 'Declined', 'Not available')}>Decline</Button></> : <p className="text-sm text-slate-500">This task is already in progress.</p>}</div></Card> : <Card className="p-6"><p className="text-sm text-slate-500">There is no open task assigned to you yet.</p></Card>}</div>
}
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const CLOSING_KINDS: CareEvent['kind'][] = ['family_confirmed', 'task_completed', 'refill_done']

// Who closed care items this week. Listed by name, never ranked or scored.
function HelpedThisWeek({ patientId }: { patientId: string }) {
  const { state, now } = useApp()
  const since = now().getTime() - WEEK_MS
  const counts = new Map<string, number>()
  for (const event of state.careEvents) {
    if (event.patientId !== patientId || event.actorType !== 'member' || !CLOSING_KINDS.includes(event.kind) || Date.parse(event.at) < since) continue
    counts.set(event.actorId, (counts.get(event.actorId) ?? 0) + 1)
  }
  const rows = [...counts].map(([id, closed]) => ({ id, closed, member: state.members.find(member => (member.userId ?? member.id) === id) }))
    .filter(row => row.member)
    .sort((a, b) => a.member!.name.localeCompare(b.member!.name))
  return <section className="cc-helped" aria-labelledby="helped-heading">
    <h2 id="helped-heading">Who closed items this week</h2>
    {rows.length ? <ul>{rows.map(row => <li key={row.id}><span className="cc-avatar cc-avatar-small">{row.member!.initials}</span><span>{row.member!.name}</span><span className="cc-helped-count">{row.closed} {row.closed === 1 ? 'item' : 'items'}</span></li>)}</ul>
      : <p className="cc-side-empty">When someone confirms a dose, finishes a task or restocks a medicine, it shows here.</p>}
  </section>
}

// One line in place of the four glance tiles: each part links to where it is handled.
function TodaySummary({ alerts, meds, tasks, nextAppt, time, onView, onAppt }: {
  alerts: MedicationAlert[]
  meds: Medication[]
  tasks: CareTask[]
  nextAppt?: Appointment
  time: Date
  onView: (view: View) => void
  onAppt: () => void
}) {
  const waiting = meds.filter(medicine => {
    const alert = alerts.find(item => item.medicationId === medicine.id)
    return alert && alert.status !== 'Confirmed' && alert.status !== 'Missed'
  }).length
  const open = tasks.filter(task => task.status !== 'Completed').length
  const days = nextAppt ? Math.round((Date.UTC(new Date(nextAppt.datetime).getFullYear(), new Date(nextAppt.datetime).getMonth(), new Date(nextAppt.datetime).getDate()) - Date.UTC(time.getFullYear(), time.getMonth(), time.getDate())) / 86400000) : null
  const low = meds.filter(medicine => medicine.stock <= medicine.refillThreshold)
  const parts: { key: string; label: string; onClick: () => void }[] = [
    { key: 'doses', label: waiting ? waiting + (waiting === 1 ? ' dose waiting for a reply' : ' doses waiting for a reply') : 'No doses waiting', onClick: () => onView('medicines') },
    { key: 'tasks', label: open + (open === 1 ? ' task open' : ' tasks open'), onClick: () => onView('tasks') },
    { key: 'visit', label: days === null ? 'No visit booked' : days === 0 ? 'Visit today' : days === 1 ? 'Visit tomorrow' : 'Visit in ' + days + ' days', onClick: () => nextAppt ? onAppt() : onView('appointments') },
  ]
  if (low.length) parts.push({ key: 'stock', label: low.length === 1 ? low[0].name + ' running low' : low.length + ' medicines running low', onClick: () => onView('medicines') })
  return <nav className="cc-summary" aria-label="Today in brief"><ul>
    {parts.map(part => <li key={part.key}><button type="button" className={part.key === 'stock' ? 'cc-summary-warn' : ''} onClick={part.onClick}>{part.label}<ChevronRightIcon className="w-4 h-4" aria-hidden="true" /></button></li>)}
  </ul></nav>
}

export function Dashboard() {
  const { state, actions, now } = useApp()
  const [taskFilter, setTaskFilter] = useState<'all' | 'needs' | 'waiting' | 'handling'>('all')
  const { activePatientId, alerts, tasks, medications, appointments } = state
  const patient = state.patients.find(item => item.id === activePatientId)
  const time = now()
  const today = time.getFullYear() + '-' + String(time.getMonth() + 1).padStart(2, '0') + '-' + String(time.getDate()).padStart(2, '0')
  const todayAlerts = alerts.filter(alert => alert.scheduledDate === today && (!alert.patientId || alert.patientId === activePatientId))
  const openTasks = tasks.filter(task => task.patientId === activePatientId && task.status !== 'Completed').sort((a, b) => (Date.parse(a.due) || Infinity) - (Date.parse(b.due) || Infinity))
  const followups = todayAlerts.filter(alert => ['Unconfirmed', 'Assigned', 'In Progress', 'Missed', 'Not recorded'].includes(alert.status))
  const count = openTasks.length + followups.length
  const nextAppt = appointments.filter(item => (!item.patientId || item.patientId === activePatientId) && ['Upcoming', 'Confirmed'].includes(item.status) && Date.parse(item.datetime) >= time.getTime()).sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime))[0]
  const events = state.careEvents.filter(event => event.patientId === activePatientId).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  const firstReply = [...events].reverse().find(event => event.kind === 'parent_replied' && event.alertId)
  const replyAlert = alerts.find(alert => alert.id === firstReply?.alertId)
  const memberFor = (id?: string) => state.members.find(member => (member.userId ?? member.id) === id)
  const activeMeds = medications.filter(medicine => medicine.status !== 'Stopped' && (!medicine.patientId || medicine.patientId === activePatientId)).sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime))
  // Order by urgency: every dose follow-up first (earliest, so most overdue, first), then tasks with
  // no owner, then the rest by due date. Doses are never cut off; tasks fill up to three rows.
  const doseItems = [...followups].sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime)).map(alert => ({ kind: 'alert' as const, alert }))
  const taskItems = [...openTasks].sort((a, b) => Number(Boolean(a.assigneeId)) - Number(Boolean(b.assigneeId))).slice(0, Math.max(0, 3 - doseItems.length)).map(task => ({ kind: 'task' as const, task }))
  const attention = [...doseItems, ...taskItems]
  const allAttention = [...doseItems, ...openTasks.map(task => ({ kind: 'task' as const, task }))]
  const isUrgent = (item: (typeof attention)[number]) => item.kind === 'alert' ? item.alert.status === 'Missed' || lateBy(item.alert.scheduledDate, item.alert.scheduledTime, time) > 0 : !item.task.assigneeId || item.task.response === 'Declined'
  const filteredAttention = (taskFilter === 'all' ? attention : allAttention).filter(item => taskFilter === 'all' || (item.kind === 'task' ? taskFilter === 'needs' ? !item.task.assigneeId || item.task.response === 'Declined' : taskFilter === 'waiting' ? !!item.task.assigneeId && item.task.response === 'Waiting' : item.task.response === 'Accepted' : taskFilter === 'needs' ? !item.alert.assignedTo && !['Missed', 'Not recorded'].includes(item.alert.status) : taskFilter === 'handling' ? item.alert.status === 'In Progress' : item.alert.status === 'Assigned'))
  const shownTaskIds = new Set(attention.flatMap(item => item.kind === 'task' ? [item.task.id] : []))
  const shownMedIds = new Set(attention.flatMap(item => item.kind === 'alert' ? [item.alert.medicationId] : []))
  const planMeds = activeMeds.filter(medicine => !shownMedIds.has(medicine.id))
  const planTasks = tasks.filter(task => task.patientId === activePatientId && !shownTaskIds.has(task.id)).slice(0, 6)
  const openAppointment = () => { if (nextAppt) { actions.setView('appointments'); actions.openAppointmentDetail(nextAppt.id) } }
  const greeting = time.getHours() < 12 ? 'Good morning' : time.getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = state.currentUser?.name.split(' ')[0] ?? ''
  const stage = deriveStage(state)
  const [, refreshSuggestions] = useState(0)
  const tourActive = useGuidedTourActive()
  const nudge = tourActive ? undefined : prioritizedDashboardNudge(state, time)
  const nudgeRef = useRef<HTMLElement>(null)
  const visibleNudgeKey = nudge ? `${state.activeCircleId}:${state.activePatientId}:${nudge.id}` : ''
  useEffect(() => {
    const node = nudgeRef.current
    if (!node || !nudge || typeof IntersectionObserver === 'undefined') return
    let recorded = false
    const observer = new IntersectionObserver(entries => {
      if (!recorded && entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) {
        recorded = true
        recordProductEvent(state.currentUser?.id, state.isSample, 'nudge_shown')
      }
    }, { threshold: 0.5 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [visibleNudgeKey, state.currentUser?.id, state.isSample])
  const dismiss = (id: string) => {
    dismissDashboardNudge(state, id, time)
    refreshSuggestions(current => current + 1)
    recordProductEvent(state.currentUser?.id, state.isSample, 'nudge_dismissed')
  }
  const patientTasks = tasks.filter(task => task.patientId === activePatientId)
  const hasCarePlan = activeMeds.length > 0 || patientTasks.length > 0
  if (isNewInvitee(state)) return <NewInviteeWelcome />
  return <div className="cc-dashboard">
    <header className="cc-calm-hero cc-page-hero">
      <div className="cc-calm-hero-copy"><p className="cc-calm-eyebrow">{greeting}{firstName ? ', ' + firstName : ''} <span>·</span> {time.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</p><h1>Care, together.</h1><p>{patient ? `A little clarity for ${patient.name}’s care.` : 'Choose a patient to see their care.'}</p></div>
      <div className="cc-calm-hero-person"><span className="cc-avatar cc-avatar-large">{patient?.initials || 'CC'}</span><span><small>CARING FOR</small><strong>{patient?.name || 'Choose a patient'}</strong><span>{state.circleName}</span></span></div>
    </header>
    {patient?.parentChannel.reminders.status === 'Withdrawn' && <div className="cc-consent-note"><b>{patient.parentChannel.preferredName} asked to stop reminders.</b><p>Reminder messages are paused. A coordinator may send a new consent message.</p></div>}
    <div className="cc-calm-main-grid">
      <section className="cc-calm-attention" aria-labelledby="attention-heading">
        <div className="cc-calm-section-heading"><div><span className="cc-calm-kicker">YOUR CARE OVERVIEW</span><h2 id="attention-heading">Care to review</h2><p>{count ? `${count} ${count === 1 ? 'item' : 'items'} on your list` : 'Your list is clear for now'}</p></div><button className="cc-calm-text-link" type="button" onClick={() => actions.setView('tasks')}>All tasks <span aria-hidden="true">↗</span></button></div>
        {count > 0 && <div className="cc-calm-breakdown" aria-label={`${followups.length} medicine items to review today and ${openTasks.length} open tasks`}><div className="cc-calm-bar" aria-hidden="true"><span className="cc-calm-bar-medicine" style={{ width: `${followups.length / count * 100}%` }} /><span className="cc-calm-bar-task" style={{ width: `${openTasks.length / count * 100}%` }} /></div><div className="cc-calm-legend"><span><i className="cc-calm-dot-medicine" />{followups.length} medicine {followups.length === 1 ? 'item' : 'items'} today</span><span><i className="cc-calm-dot-task" />{openTasks.length} open {openTasks.length === 1 ? 'task' : 'tasks'}</span></div>{followups.length > 0 && <p className="cc-calm-simulation">Reminder activity is simulated.</p>}</div>}
        <details className="cc-calm-filters"><summary>Filter items {taskFilter !== 'all' && <span>· Active</span>}</summary><div className="cc-filters" aria-label="Filter care items">{([['all','All'],['needs','Needs an owner'],['waiting','Awaiting response'],['handling','Being handled']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={taskFilter === value} onClick={() => setTaskFilter(value)}>{label}</button>)}</div></details>
        <div className="cc-calm-items">{state.commitError ? <div className="cc-calm-empty"><ClockIcon className="w-6 h-6" /><strong>Some changes are not saved</strong><p>Use Retry in the banner before relying on the latest update.</p></div> : !hasCarePlan && !followups.length ? <div className="cc-calm-empty"><PillIcon className="w-6 h-6" /><strong>Start with one small step</strong><p>Add a medicine or a care task when you are ready.</p><button type="button" className="cc-calm-text-link" onClick={() => actions.setView('medicines')}>Open medicines ↗</button></div> : attention.length === 0 ? <div className="cc-calm-empty"><CheckCircleIcon className="w-6 h-6" /><strong>No items to review</strong><p>No open tasks. No medicine items to review today.</p></div> : filteredAttention.length === 0 ? <div className="cc-calm-empty"><strong>No items match this filter</strong><p>Choose another filter to see more.</p></div> : filteredAttention.map(item => {
          const isTask = item.kind === 'task'
          const id = isTask ? item.task.id : item.alert.id
          const owner = memberFor(isTask ? item.task.assigneeId : item.alert.assignedTo)
          const title = isTask ? item.task.title : item.alert.medicationName
          return <article className={'cc-calm-row' + (isUrgent(item) ? ' is-attention' : '')} key={item.kind + id}>
            <span className="cc-calm-row-icon" aria-hidden="true">{isTask ? <CheckCircleIcon className="w-5 h-5" /> : <PillIcon className="w-5 h-5" />}</span>
            <div className="cc-calm-row-copy"><div className="cc-calm-row-title"><h3>{title}</h3><span>{isTask ? 'Task' : 'Medicine'}</span></div><p>{isTask ? `${dueLabel(item.task.due)} · ${owner?.name || 'Needs an owner'}` : `Today · ${fmt12h(item.alert.scheduledTime)}${['Missed', 'Not recorded'].includes(item.alert.status) ? '' : ` · ${owner?.name || 'Needs an owner'}`}`}</p><div className="cc-calm-row-status">{isTask ? <TaskStatus task={item.task} /> : item.alert.status === 'Not recorded' ? <><span className="cc-status cc-status-warning">Not recorded</span><p className="cc-calm-unrecorded">No response recorded; a reminder may not have been sent.</p></> : <AlertSourceStatus alert={item.alert} />}</div></div>
            <button type="button" className="cc-calm-row-action" onClick={() => { if (isTask) { focusTask(id); actions.setView('tasks') } else actions.openAlertDetail(id) }} aria-label={`${isTask || ['Missed', 'Not recorded'].includes(item.alert.status) ? 'View details for' : 'Follow up on'} ${title}`}><span>{isTask ? 'View' : ['Missed', 'Not recorded'].includes(item.alert.status) ? 'Details' : 'Follow up'}</span><span aria-hidden="true">↗</span></button>
          </article>
        })}</div>
        {taskFilter !== 'all' && <p className="cc-filter-note">Showing all open items matching this filter.</p>}
        {count > attention.length && taskFilter === 'all' && <button type="button" className="cc-calm-more" onClick={() => actions.setView('tasks')}>See all {openTasks.length} tasks <span aria-hidden="true">→</span></button>}
      </section>
      <aside className="cc-calm-next" aria-labelledby="next-visit-heading"><div className="cc-calm-next-icon" aria-hidden="true"><CalendarIcon className="w-6 h-6" /></div><span className="cc-calm-kicker">A LITTLE AHEAD</span><h2 id="next-visit-heading">Next visit</h2>{nextAppt ? <><p className="cc-calm-date">{new Date(nextAppt.datetime).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</p><h3>{nextAppt.type}</h3><p>{clockOf(new Date(nextAppt.datetime))}{nextAppt.location || nextAppt.doctor ? ` · ${nextAppt.location || nextAppt.doctor}` : ''}</p><button type="button" className="cc-calm-next-action" onClick={openAppointment}>Prepare for visit <span aria-hidden="true">↗</span></button></> : <><p className="cc-calm-next-empty">No upcoming visit on the calendar.</p><button type="button" className="cc-calm-next-action" onClick={() => actions.setView('appointments')}>View visits <span aria-hidden="true">↗</span></button></>}</aside>
    </div>
    {state.isSample && <details className="cc-sample-tip"><summary>New here? Try the care loop</summary><p>Open the simulated parent phone, send a reply, then return to Today to see the change. Nothing is sent or saved.</p><Button variant="secondary" onClick={() => actions.togglePhonePane(true)}>Open parent phone</Button></details>}
    {firstReply?.rawText && patient && canMemberSeeParentReplies(patient, state.currentUser?.id) && !state.dismissedFirstReplyPatientIds.includes(patient.id) && <Card className="cc-first-reply"><div><strong>{patient.parentChannel.preferredName} replied for the first time</strong><p>“{firstReply.rawText}” · {replyAlert?.medicationName ?? 'Medicine reminder'} · {shortTime(firstReply.at)}</p></div><Button variant="ghost" onClick={() => actions.dismissFirstReply(patient.id)}>Dismiss</Button></Card>}
    {nudge && <section ref={nudgeRef} className="cc-insight cc-dash-nudge" aria-label="Suggested next step"><div className="cc-insight-icon" aria-hidden="true"><ClockIcon className="w-5 h-5" /></div><div className="cc-insight-copy"><span className="cc-kicker">SUGGESTED FOR YOUR CIRCLE</span><h2>{nudge.title}</h2><p>{nudge.detail}</p><div className="cc-insight-actions">{nudge.primaryLabel && <Button onClick={() => { recordProductEvent(state.currentUser?.id, state.isSample, 'nudge_accepted'); if (nudge.action === 'resend-consent' && patient) actions.sendParentConsent(patient.id); else if (nudge.view) actions.setView(nudge.view) }}>{nudge.primaryLabel}</Button>}<Button variant="ghost" onClick={() => dismiss(nudge.id)}>{nudge.secondaryLabel}</Button></div></div></section>}
    <CareJourney suppressSuggestion={Boolean(nudge) || isNudgeCooldownActive(state, time)} />
    <details className="cc-calm-details"><summary>More care details <span aria-hidden="true">+</span></summary><div className="cc-calm-details-content">
    <TodaySummary alerts={todayAlerts} meds={activeMeds} tasks={patientTasks} nextAppt={nextAppt} time={time} onView={view => actions.setView(view)} onAppt={openAppointment} />
    <div className="cc-dashboard-grid">
      <div className="cc-main-column">
        {(planMeds.length > 0 || planTasks.length > 0) && <section className="cc-surface cc-plan" aria-labelledby="responsibility-heading">
          <div className="cc-section-heading"><h2 id="responsibility-heading">Who is doing what</h2></div>
          <div className="cc-table-scroll"><table className="cc-care-table"><thead><tr><th>Activity</th><th>Responsible</th><th>Due</th><th>Status</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>
            {planMeds.map(medicine => {
              const alert = todayAlerts.find(item => item.medicationId === medicine.id)
              const owner = memberFor(alert?.confirmedBy || alert?.assignedTo || patient?.primaryCaregiverId)
              return <tr key={'medicine-' + medicine.id}><td><div className="cc-activity"><span className="cc-icon-tile"><PillIcon className="w-5 h-5" /></span><div><strong>{medicine.name}</strong><span>Medicine schedule</span></div></div></td><td><div className="cc-table-owner">{owner && <span className="cc-avatar cc-avatar-small">{owner.initials}</span>}{owner?.name || 'Unassigned'}</div></td><td>{fmt12h(medicine.scheduleTime)}<span className="cc-secondary-line">Today</span></td><td>{alert ? <AlertSourceStatus alert={alert} /> : <span className="cc-status cc-status-neutral">No reminder sent</span>}</td><td><button className="cc-row-action" aria-label={'View ' + medicine.name} onClick={() => alert ? actions.openAlertDetail(alert.id) : actions.setView('medicines')}><ChevronRightIcon className="w-4 h-4" /></button></td></tr>
            })}
            {planTasks.map(task => {
              const owner = memberFor(task.assigneeId)
              return <tr key={'task-' + task.id}><td><div className="cc-activity"><span className="cc-icon-tile"><CheckCircleIcon className="w-5 h-5" /></span><div><strong>{task.title}</strong><span>Care task</span></div></div></td><td><div className="cc-table-owner">{owner && <span className="cc-avatar cc-avatar-small">{owner.initials}</span>}{owner?.name || 'Unassigned'}</div></td><td>{dueLabel(task.due)}</td><td><TaskStatus task={task} /></td><td><button className="cc-row-action" aria-label={'View ' + task.title} onClick={() => actions.setView('tasks')}><ChevronRightIcon className="w-4 h-4" /></button></td></tr>
            })}
          </tbody></table></div>
        </section>}
      </div>
      <aside className="cc-side-column cc-surface">
        {patient && stage >= 4 && <HelpedThisWeek patientId={activePatientId} />}
        <section className="cc-latest" aria-labelledby="latest-update-heading"><h2 id="latest-update-heading">Latest update</h2>{events[0] ? <><div className="cc-update-note">{eventTextForMember(events[0], patient, state.currentUser?.id)}</div><p className="cc-event-meta"><ClockIcon className="w-4 h-4" />{memberFor(events[0].actorId)?.name || (events[0].actorType === 'parent' ? patient?.parentChannel.preferredName : 'CareCircle')} · {dayAndClock(new Date(events[0].at))}</p><button className="cc-text-link" onClick={() => actions.setView('timeline')}>View care timeline <ChevronRightIcon className="w-4 h-4" /></button></> : <p className="cc-side-empty">Care updates will appear here as your circle records activity.</p>}</section>
      </aside>
    </div>
    </div></details>
  </div>
}
