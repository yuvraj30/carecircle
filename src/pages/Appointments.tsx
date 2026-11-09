import '../appointments-refresh.css'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useApp } from '../context'
import { useGate } from '../auth/Gate'
import { XMarkIcon, CalendarIcon, ClockIcon, PlusIcon } from '../components/icons'
import type { Appointment } from '../types'
import { Button, Dialog, Field, SelectField, TextAreaField } from '../components/ui'

function fmtFull(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function daysUntil(iso: string, currentTime: Date) {
  const date = new Date(iso)
  const days = Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate())) / 86400000)
  if (days < 0) return 'Past due'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

const STATUS_STYLE: Record<Appointment['status'], { bg: string; text: string; label: string }> = {
  Upcoming: { bg: '#EAF3EB', text: '#386F52', label: 'Upcoming' },
  Confirmed: { bg: '#D1FAE5', text: '#065F46', label: 'Confirmed' },
  Completed: { bg: '#F1F5F9', text: '#475569', label: 'Completed' },
  Cancelled: { bg: '#FEE2E2', text: '#991B1B', label: 'Cancelled' },
}

function ApptDetail({ appt, onClose, onEdit }: { appt: Appointment; onClose: () => void; onEdit: () => void }) {
  const { state, actions, now } = useApp()
  const navigate = useNavigate()
  const gate = useGate()
  const [visitNote, setVisitNote] = useState('')
  const [followUp, setFollowUp] = useState('')
  const style = STATUS_STYLE[appt.status]
  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="appt-title"
    >
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="ccv-dialog relative bg-white rounded-2xl shadow-xl w-full max-w-md z-10 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div
          className="px-5 pt-5 pb-4 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #e6f2e8 0%, #f8f6eb 100%)', borderBottom: '1px solid #e2ebe3' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <span
                className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-3"
                style={{ backgroundColor: style.bg, color: style.text }}
              >
                {style.label}
              </span>
              <h2 id="appt-title" className="text-lg font-semibold text-slate-800">{appt.type}</h2>
              <p className="text-slate-600 text-sm">{appt.doctor} · {appt.specialty}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:bg-white/60 hover:text-slate-600 transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Details */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
          {[
            { label: 'Date & Time', value: fmtFull(appt.datetime) },
            { label: 'Location', value: appt.location },
            { label: 'Specialty', value: appt.specialty },
            { label: 'Doctor', value: appt.doctor },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start justify-between gap-4 py-2.5" style={{ borderBottom: '1px solid #F8FAFC' }}>
              <span className="text-sm text-slate-500 flex-shrink-0 w-32">{label}</span>
              <span className="text-sm font-medium text-slate-800 text-right">{value}</span>
            </div>
          ))}

          <div className="cc-visit-guide"><strong>Prepare together</strong><p>Agree who will accompany the parent, arrange transport, and collect questions or records before the visit.</p><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { onClose(); actions.setView('tasks') }}>Review care tasks</Button>{state.activeCircleRole === 'coordinator' && ['Upcoming', 'Confirmed'].includes(appt.status) && <Button variant="ghost" onClick={() => gate.requireAccount(() => { onClose(); navigate('/circle?action=invite-member') }, 'invite-member')}>Invite someone to help prepare</Button>}</div></div>
          {appt.status === 'Completed' && <div className="cc-visit-guide" role="status"><strong>Visit recorded as completed</strong><p>{appt.visitNotes?.length ? `${appt.visitNotes.length} ${appt.visitNotes.length === 1 ? 'note is' : 'notes are'} saved for your circle.` : 'Add a note below if there is an outcome or follow-up to share.'}</p></div>}
          {appt.notes && (
            <div className="pt-3">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Notes</p>
              <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl px-3 py-3">{appt.notes}</p>
            </div>
          )}

          {appt.preparationNotes && (
            <div className="pt-3">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Preparation</p>
              <div className="rounded-xl px-3 py-3" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                <p className="text-sm text-amber-800 leading-relaxed">{appt.preparationNotes}</p>
              </div>
            </div>
          )}
          <div className="pt-3">
            <TextAreaField label="Completed visit note" value={visitNote} onChange={e => setVisitNote(e.target.value)} placeholder="Record the outcome and any agreed follow-up…" />
            <Button className="mt-3" disabled={!visitNote.trim() || state.activeCircleRole === 'view-only'} onClick={() => { const timestamp = now(); actions.saveAppointment({ ...appt, status: 'Completed', visitNotes: [...(appt.visitNotes ?? []), { id: `note-${timestamp.getTime()}`, text: visitNote.trim(), author: state.accountProfile.name, timestamp: timestamp.toISOString() }] }); setVisitNote('') }}>Save completed visit note</Button>
          </div>
          {state.activeCircleRole === 'coordinator' && <div className="cc-visit-followup"><strong>Turn a follow-up into a task</strong><p>Write an action agreed by the family or clinician. The task starts unassigned.</p><Field label="Follow-up action" value={followUp} onChange={event => setFollowUp(event.target.value)} placeholder="For example, arrange transport" /><Button variant="secondary" className="mt-3" disabled={!followUp.trim()} onClick={() => { const created = now(); const due = new Date(Math.max(created.getTime(), Date.parse(appt.datetime) || created.getTime())); const localDue = new Date(due.getTime() - due.getTimezoneOffset() * 60000).toISOString().slice(0, 16); actions.saveTask({ id: crypto.randomUUID(), title: followUp.trim(), patientId: appt.patientId || state.activePatientId, assigneeId: '', due: localDue, priority: 'Medium', status: 'To do', response: 'Waiting', description: `Follow-up for ${appt.type}`, comments: [], history: [] }); setFollowUp('') }}>Create unassigned task</Button></div>}
          {appt.visitNotes?.map(note => <div key={note.id} className="rounded-xl bg-slate-50 p-3 text-sm"><b>Visit note · {note.author}</b><p className="text-slate-600 mt-1">{note.text}</p>{note.documentId && <button onClick={() => { actions.setView('documents'); actions.openDocumentDetail(note.documentId!) }} className="text-xs font-semibold text-[#2B6B50] mt-2">Open linked document</button>}</div>)}
          <div className="flex gap-2 pt-4">
            <Button variant="secondary" disabled={state.activeCircleRole === 'view-only'} onClick={() => actions.saveAppointment({ ...appt, preparationComplete: !appt.preparationComplete })}>{appt.preparationComplete ? 'Preparation complete' : 'Mark preparation complete'}</Button>
            <Button variant="secondary" disabled={state.activeCircleRole === 'view-only'} onClick={onEdit}>Edit</Button>
            <Button variant="ghost" disabled={state.activeCircleRole === 'view-only'} onClick={() => actions.showConfirm({ title: 'Cancel appointment?', message: 'The appointment remains in history as Cancelled.', confirmLabel: 'Cancel appointment', variant: 'danger', onConfirm: () => actions.saveAppointment({ ...appt, status: 'Cancelled' }) })}>Cancel appointment</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Appointments() {
  const { state, actions, now } = useApp()
  const { appointments, appointmentDetailId } = state
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Appointment | null>(null)
  const selectedAppt = appointments.find(a => a.id === appointmentDetailId)

  const upcoming = appointments.filter(a => (!a.patientId || a.patientId === state.activePatientId) && (a.status === 'Upcoming' || a.status === 'Confirmed')).sort((a,b) => Date.parse(a.datetime) - Date.parse(b.datetime))
  const past = appointments.filter(a => (!a.patientId || a.patientId === state.activePatientId) && (a.status === 'Completed' || a.status === 'Cancelled'))

  function ApptCard({ appt }: { appt: Appointment }) {
    const date = new Date(appt.datetime)
    return <button type="button" className="ccv-visit" onClick={() => actions.openAppointmentDetail(appt.id)} aria-label={`${appt.type} with ${appt.doctor} on ${fmtDate(appt.datetime)}`}>
      <div className="ccv-visit-top"><span className="ccv-type"><span className="ccv-type-icon"><CalendarIcon className="w-4 h-4" /></span> CARE VISIT</span><span className={`ccv-status ${appt.status === 'Cancelled' ? 'ccv-cancelled' : ''}`}>{appt.status}</span></div>
      <div className="ccv-visit-main"><div className="ccv-date"><span>{date.toLocaleDateString('en-IN', { month: 'short' })}</span><strong>{date.getDate()}</strong></div><div className="ccv-visit-name"><h3>{appt.type}</h3><p>{appt.doctor}{appt.specialty ? ` · ${appt.specialty}` : ''}</p></div></div>
      <div className="ccv-visit-meta"><span><ClockIcon className="w-4 h-4" />{fmtTime(appt.datetime)}</span><span>{appt.location}</span></div>
      <div className="ccv-visit-foot"><span>{['Upcoming', 'Confirmed'].includes(appt.status) ? daysUntil(appt.datetime, now()) : appt.status}</span><strong>View visit <span aria-hidden="true">↗</span></strong></div>
    </button>
  }

  return (
    <div className="ccv-page">
      <header className="ccv-hero cc-page-hero"><div><span className="ccv-eyebrow">YOUR CIRCLE / VISITS</span><h1>Better prepared, together.</h1><p>A little preparation makes room for what matters.</p></div><Button disabled={state.activeCircleRole === 'view-only'} onClick={() => setAdding(true)}><PlusIcon className="w-4 h-4" /> Add visit</Button></header>
      <div className="ccv-overview"><div><span>COMING UP</span><strong>{upcoming.length}</strong><small>{upcoming.length === 1 ? 'visit' : 'visits'}</small></div><div><span>PREPARED</span><strong>{upcoming.filter(a => a.preparationComplete).length}</strong><small>ready for a visit</small></div><div><span>ON RECORD</span><strong>{past.length}</strong><small>completed or cancelled</small></div><p>Keep the details in one place, so the whole circle can be ready.</p></div>
      <section className="ccv-section" aria-labelledby="upcoming-heading"><div className="ccv-section-head"><div><span>YOUR SCHEDULE</span><h2 id="upcoming-heading">Upcoming visits</h2></div><span>{upcoming.length} {upcoming.length === 1 ? 'visit' : 'visits'}</span></div>
        {upcoming.length ? <div className="ccv-grid">{upcoming.map(a => <ApptCard key={a.id} appt={a} />)}</div> : <div className="ccv-empty"><span className="ccv-empty-icon"><CalendarIcon className="w-5 h-5" /></span><strong>Nothing scheduled yet</strong><p>When you add a visit, it will appear here.</p>{state.activeCircleRole !== 'view-only' && <Button variant="secondary" onClick={() => setAdding(true)}>Add a visit</Button>}</div>}
      </section>
      {past.length > 0 && <section className="ccv-section" aria-labelledby="past-heading"><div className="ccv-section-head"><div><span>CARE HISTORY</span><h2 id="past-heading">Past visits</h2></div><span>{past.length} {past.length === 1 ? 'visit' : 'visits'}</span></div><div className="ccv-grid">{past.map(a => <ApptCard key={a.id} appt={a} />)}</div></section>}

      {selectedAppt && (
        <ApptDetail
          appt={selectedAppt}
          onClose={() => actions.openAppointmentDetail(null)}
          onEdit={() => { setEditing(selectedAppt); actions.openAppointmentDetail(null) }}
        />
      )}
      {adding && <AppointmentForm onClose={() => setAdding(false)} onSave={appt => { actions.saveAppointment(appt); setAdding(false) }} />}
      {editing && <AppointmentForm initial={editing} onClose={() => setEditing(null)} onSave={appt => { actions.saveAppointment(appt); setEditing(null) }} />}
    </div>
  )
}

function AppointmentForm({ initial, onClose, onSave }: { initial?: Appointment; onClose: () => void; onSave: (appt: Appointment) => void }) {
  const { now } = useApp()
  const [form, setForm] = useState<Appointment>(() => {
    if (initial) return initial
    const createdAt = now()
    const appointmentTime = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000)
    appointmentTime.setHours(10, 30, 0, 0)
    return { id: `appt-${createdAt.getTime()}`, type: '', doctor: '', specialty: '', location: '', datetime: new Date(appointmentTime.getTime() - appointmentTime.getTimezoneOffset() * 60000).toISOString().slice(0, 16), status: 'Upcoming', preparationNotes: '', reminder: '1 day before', preparationComplete: false, visitNotes: [] }
  })
  const set = <K extends keyof Appointment>(key: K, value: Appointment[K]) => setForm(current => ({ ...current, [key]: value }))
  return <Dialog title={initial ? 'Edit appointment' : 'Add appointment'} onClose={onClose} wide><div className="grid sm:grid-cols-2 gap-4"><Field label="Visit type" value={form.type} onChange={e => set('type', e.target.value)} /><Field label="Doctor" value={form.doctor} onChange={e => set('doctor', e.target.value)} /><Field label="Specialty" value={form.specialty} onChange={e => set('specialty', e.target.value)} /><Field label="Location or virtual link" value={form.location} onChange={e => set('location', e.target.value)} /><Field label="Date and time" type="datetime-local" value={form.datetime.slice(0, 16)} onChange={e => set('datetime', e.target.value)} /><SelectField label="Reminder" value={form.reminder} onChange={e => set('reminder', e.target.value)}><option>1 day before</option><option>2 days before</option><option>1 week before</option></SelectField><div className="sm:col-span-2"><TextAreaField label="Preparation notes" value={form.preparationNotes ?? ''} onChange={e => set('preparationNotes', e.target.value)} /></div></div><div className="flex justify-end gap-2 mt-6"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!form.type || !form.doctor || !form.location} onClick={() => onSave(form)}>Save appointment</Button></div></Dialog>
}
