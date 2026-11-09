import { useApp } from '../context'
import { visiblePersonSymptoms } from '../lib/personReplies'
import { shortTime } from '../lib/careEvents'
import { focusTask } from '../lib/taskNavigation'
import { Button } from './ui'

/** Person-level replies must not appear as a response to an arbitrary dose. */
export function SymptomFollowup() {
  const { state, actions, now } = useApp()
  const patient = state.patients.find(item => item.id === state.activePatientId)
  const replies = visiblePersonSymptoms(state.careEvents, patient, state.currentUser?.id)
    .filter(reply => !state.tasks.some(task => task.id === `person-check-in-${reply.id}` && task.status === 'Completed'))
  if (!patient || !replies.length) return null

  return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 space-y-4" aria-labelledby="person-replies-heading">
    <div><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Shared with you</p><h2 id="person-replies-heading" className="text-lg font-semibold text-slate-900 mt-1">A message to follow up</h2><p className="text-sm text-slate-700 mt-1">These words are not linked to a specific medicine. CareCircle cannot assess how someone is feeling.</p></div>
    {replies.map(reply => {
      const taskId = `person-check-in-${reply.id}`
      const task = state.tasks.find(item => item.id === taskId)
      return <article key={reply.id} className="rounded-2xl bg-white p-4 border border-amber-100">
        <p className="text-sm text-slate-800"><strong>{patient.parentChannel.preferredName} wrote:</strong> “{reply.rawText}”</p>
        <p className="text-xs text-slate-500 mt-1">{new Date(reply.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {shortTime(reply.at)}</p>
        {task ? <div className="flex flex-wrap items-center gap-3 mt-3"><span className="text-sm text-slate-700">Check-in task: {task.status}</span><Button variant="secondary" onClick={() => { focusTask(task.id); actions.setView('tasks') }}>View task</Button></div>
          : <Button variant="secondary" className="mt-3" disabled={state.activeCircleRole === 'view-only' || state.isLoading || Boolean(state.commitError)} onClick={() => { const due = now(); const localDue = new Date(due.getTime() - due.getTimezoneOffset() * 60000).toISOString().slice(0, 16); actions.saveTask({ id: taskId, patientId: patient.id, title: `Check in with ${patient.parentChannel.preferredName}`, assigneeId: '', due: localDue, priority: 'High', status: 'To do', response: 'Waiting', description: 'Contact them and agree on a next step. This task is not a medical assessment.', comments: [] }) }}>Create check-in task</Button>}
      </article>
    })}
  </section>
}
