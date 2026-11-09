import '../secondary-consistency.css'
import '../records-refresh.css'
import { useApp } from '../context'
import { BellIcon } from '../components/icons'
import { Button, Card, EmptyState, PageHeader } from '../components/ui'
import { eventTextForMember } from '../lib/careEvents'
import { eventTargetView, relevantCareEvents, unreadCareEvents } from '../lib/notifications'
import { buildWeeklyDigest, joinNames, type WeeklyDigestData } from '../lib/weeklyDigest'
import { summarizeForVisit, templateSummary, type VisitFacts } from '../lib/assistant'
import { useState, type ReactNode } from 'react'

export function Notifications() {
  const { state, actions } = useApp()
  const events = relevantCareEvents(state)
  const unread = unreadCareEvents(state)
  const readIds = new Set(state.notifications.filter(receipt => receipt.userId === state.currentUser?.id).map(receipt => receipt.eventId))

  return <div className="space-y-6">
    <PageHeader title="Notifications" subtitle={`${unread.length} unread updates in ${state.circleName}`} action={<Button variant="secondary" disabled={!unread.length} onClick={() => actions.markNotification(unread.map(event => event.id))}>Mark all read</Button>} />
    {!events.length ? <EmptyState title="No new activity." detail="Relevant updates will appear here." /> : <Card className="overflow-hidden">
      {events.map(event => {
        const patient = state.patients.find(item => item.id === event.patientId)
        const read = readIds.has(event.id)
        return <button key={event.id} onClick={() => { actions.markNotification(event.id); if (event.patientId !== state.activePatientId) actions.switchPatient(event.patientId); actions.setView(eventTargetView(event)) }} className={`cc-notice-row w-full flex items-start gap-4 p-5 border-b border-slate-100 text-left ${read ? '' : 'is-unread'}`}>
          <BellIcon className="w-5 h-5 cc-secondary-link mt-0.5" />
          <span className="flex-1"><b className="text-sm text-slate-800">{eventTextForMember(event, patient, state.currentUser?.id)}</b><span className="block text-xs text-slate-400 mt-1">{new Date(event.at).toLocaleString('en-IN')}</span></span>
          <span className={read ? 'text-xs text-slate-500' : 'cc-unread'}>{read ? 'Read' : 'New'}</span>
        </button>
      })}
    </Card>}
  </div>
}

export function Digest() {
  const { state, actions } = useApp()
  const digestEvent = state.careEvents
    .filter(event =>
      event.kind === 'weekly_digest' &&
      event.patientId === state.activePatientId &&
      event.recipientIds?.includes(state.currentUser?.id ?? '')
    )
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]
  const patient = state.patients.find(item => item.id === state.activePatientId)

  if (!digestEvent || patient?.parentChannel.sharing.status !== 'Agreed') {
    return <div className="space-y-6"><PageHeader title="Weekly digest" subtitle="Seven days of recorded Care Circle activity" /><EmptyState title="No weekly digest available." detail="A digest is generated only when reply sharing is agreed and the scheduled delivery time has passed." /></div>
  }

  const digest = buildWeeklyDigest(state, digestEvent)
  const recipients = (digestEvent.recipientIds ?? []).map(id => state.members.find(member => (member.userId ?? member.id) === id)?.name).filter((name): name is string => Boolean(name))
  const replyGapText = digest.replies === 0
    ? `No replies recorded this week.${digest.noReplyDays.length ? ` No replies recorded on ${joinNames(digest.noReplyDays)}.` : ''}`
    : digest.noReplyDays.length
      ? `No replies recorded on ${joinNames(digest.noReplyDays)}.`
      : ''

  return <div className="space-y-6">
    <PageHeader title={`${patient?.parentChannel.preferredName ?? 'Parent'}'s weekly digest`} subtitle={`Generated ${new Date(digestEvent.at).toLocaleString('en-IN')} · Shared with ${joinNames(recipients)}`} />
    <Card className="p-6 space-y-5">
      <div className="cc-digest-intro"><strong>What needs attention</strong><p>{state.tasks.filter(task => task.patientId === state.activePatientId && task.status !== 'Completed').length} open tasks · {state.tasks.filter(task => task.patientId === state.activePatientId && task.status !== 'Completed' && !task.assigneeId).length} without an owner</p><Button variant="secondary" onClick={() => actions.setView('tasks')}>Review open tasks</Button></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <DigestStat label="Reminders sent" value={digest.remindersSent} />
        <DigestStat label={`Replies from ${patient?.parentChannel.preferredName ?? 'parent'}`} value={digest.replies} detail={`${digest.takenReplies} recorded as “taken”`} />
        <DigestStat label="Times with no reply yet" value={digest.noReplyYet} />
        <DigestStat label="Doses confirmed by family" value={digest.familyConfirmed} />
        <DigestStat label="Calls claimed" value={digest.callsClaimed} />
      </div>
      {replyGapText && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{replyGapText}</p>}
      <DigestSection title={`Quoted replies from ${patient?.parentChannel.preferredName ?? 'parent'} that were not “taken”`}>
        {digest.quotedReplies.length ? digest.quotedReplies.map(reply => <p key={reply} className="text-sm text-slate-700">“{reply}”</p>) : <p className="text-sm text-slate-400">None recorded.</p>}
      </DigestSection>
      <DigestSection title="Tasks completed"><p className="text-sm text-slate-700">{digest.tasksCompleted}</p></DigestSection>
      <DigestSection title="Refills">
        {digest.refillEvents.length ? digest.refillEvents.map(event => <p key={event.id} className="text-sm text-slate-700">{event.text}</p>) : <p className="text-sm text-slate-400">No refill activity recorded.</p>}
      </DigestSection>
      <DigestSection title="Medicine changes">
        {digest.medicineChanges.length ? digest.medicineChanges.map(event => <p key={event.id} className="text-sm text-slate-700">{event.text}</p>) : <p className="text-sm text-slate-400">No medicine changes recorded.</p>}
      </DigestSection>
      <DigestSection title="Appointments next week">
        {digest.upcomingAppointments.length ? digest.upcomingAppointments.map(appointment => <p key={appointment.id} className="text-sm text-slate-700">{new Date(appointment.datetime).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {appointment.type} with {appointment.doctor}</p>) : <p className="text-sm text-slate-400">No appointments scheduled for next week.</p>}
      </DigestSection>
      <div className="rounded-2xl border border-slate-200 p-4">
        <p className="font-semibold text-slate-800">Questions for the next doctor visit</p>
        <div className="space-y-2 mt-3">{digest.questions.length ? digest.questions.map(question => <p key={question} className="text-sm text-slate-700">• {question}</p>) : <p className="text-sm text-slate-400">No quoted non-taken replies, refill activity, or medicine changes were recorded.</p>}</div>
        <Button className="mt-4" disabled={!digest.questions.length || state.activeCircleRole === 'view-only'} onClick={() => actions.addDigestToVisitNotes(digestEvent.id)}>Add all to visit notes</Button>
      </div>
      <VisitSummaryPanel digest={digest} patientName={patient?.parentChannel.preferredName ?? 'the parent'} />
      <p className="text-sm text-slate-500 border-t border-slate-100 pt-4">This summary is based on replies recorded in Care Circle. It does not tell you how {patient?.parentChannel.preferredName ?? 'the parent'} is.</p>
    </Card>
  </div>
}

// Drafts visit wording from counts and the parent's own quoted words. It is shown in an editable box and
// saved only when the person presses "Add to ... notes".
function VisitSummaryPanel({ digest, patientName }: { digest: WeeklyDigestData; patientName: string }) {
  const { state, actions, now } = useApp()
  const [text, setText] = useState('')
  const [source, setSource] = useState<'assistant' | 'template' | ''>('')
  const [busy, setBusy] = useState(false)
  const appointment = state.appointments
    .filter(item => item.patientId === state.activePatientId && (item.status === 'Upcoming' || item.status === 'Confirmed'))
    .sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime))[0]
  const facts: VisitFacts = {
    patient: patientName,
    replies: digest.replies,
    takenReplies: digest.takenReplies,
    noReplyDays: digest.noReplyDays,
    quotedReplies: digest.quotedReplies,
    familyConfirmed: digest.familyConfirmed,
    tasksCompleted: digest.tasksCompleted,
    refills: digest.refillEvents.map(event => event.text),
    medicineChanges: digest.medicineChanges.map(event => event.text),
    appointments: digest.upcomingAppointments.map(item => `${item.type} with ${item.doctor}`),
  }
  const write = async () => {
    setBusy(true)
    const result = state.isSample ? { text: templateSummary(facts), source: 'template' as const } : await summarizeForVisit(state.activeCircleId, facts)
    setText(result.text)
    setSource(result.source)
    setBusy(false)
  }
  const addToNotes = () => {
    if (!appointment || !text.trim()) return
    actions.saveAppointment({ ...appointment, visitNotes: [...(appointment.visitNotes ?? []), { id: crypto.randomUUID(), text: text.trim(), author: state.currentUser?.name ?? 'Family member', timestamp: now().toISOString() }] })
    setText('')
    setSource('')
  }
  return <div className="rounded-2xl border border-slate-200 p-4">
    <p className="font-semibold text-slate-800">Summary for the next visit</p>
    <p className="text-xs text-slate-500 mt-1">Pressing Write sends these counts and any quoted replies to an assistant service to draft the wording. Nothing is saved until you add it to the visit notes.</p>
    <Button variant="secondary" className="mt-3" disabled={busy || state.activeCircleRole === 'view-only'} onClick={write}>{busy ? 'Writing…' : text ? 'Write again' : 'Write a summary'}</Button>
    {text && <>
      <textarea className="mt-3 w-full min-h-40 rounded-xl border border-slate-200 p-3 text-sm text-slate-700" value={text} onChange={event => setText(event.target.value)} aria-label="Summary for the next visit" />
      <p className="text-xs text-slate-500 mt-1">{source === 'assistant' ? 'Drafted by an assistant from the counts above. Edit it freely.' : 'Plain wording built from the counts above. Edit it freely.'}</p>
      <Button className="mt-3" disabled={!appointment || state.activeCircleRole === 'view-only'} onClick={addToNotes}>{appointment ? `Add to ${appointment.type} notes` : 'No upcoming appointment to add it to'}</Button>
    </>}
  </div>
}

function DigestStat({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return <div className="cc-stat rounded-2xl p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="text-3xl font-bold text-slate-800 mt-1">{value}</p>{detail && <p className="text-xs text-slate-500 mt-1">{detail}</p>}</div>
}

function DigestSection({ title, children }: { title: string; children: ReactNode }) {
  return <div className="cc-digest-section"><p className="text-sm font-bold text-slate-800 mb-2">{title}</p><div className="space-y-2">{children}</div></div>
}
