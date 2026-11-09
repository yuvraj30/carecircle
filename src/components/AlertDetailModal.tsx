import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context'
import { XMarkIcon, ClockIcon, ShieldCheckIcon, UserIcon, ChevronDownIcon } from './icons'
import { AlertSourceStatus } from './AlertSourceStatus'
import type { MedicationAlert } from '../types'
import { activeClaim, canMemberSeeParentReplies, latestParentReply, parentReplyCategoryLabel, shortTime } from '../lib/careEvents'
import { useGate } from '../auth/Gate'
import { Button } from './ui'
import { clockLabel as fmt12h } from '../lib/time'


function fmtDatetime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3" style={{ borderBottom: '1px solid #E2ECE3' }}>
      <span className="text-sm text-slate-500 flex-shrink-0 w-36">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-right">{children}</span>
    </div>
  )
}

export function AlertDetailModal() {
  const { state, actions, now } = useApp()
  const gate = useGate()
  const { alertDetailId, currentUser, alerts, patients, activePatientId } = state
  const activePatient = patients.find(p => p.id === activePatientId)
  const alert = alerts.find(a => a.id === alertDetailId)
  const [assignTo, setAssignTo] = useState('')
  const [notTakenMode, setNotTakenMode] = useState(false)
  const [unansweredMode, setUnansweredMode] = useState(false)
  const [notTakenReason, setNotTakenReason] = useState('')
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') actions.closeAlertDetail() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  if (!alert) return null

  const isCoordinator = state.activeCircleRole === 'coordinator'
  const isAssignee = currentUser?.id === alert.assignedTo
  const canAssign = isCoordinator && (alert.status === 'Unconfirmed' || alert.status === 'Assigned')
  const canConfirm = state.activeCircleRole !== 'view-only' && (isAssignee || isCoordinator || (state.activeCircleRole === 'caregiver' && !alert.assignedTo)) && (alert.status === 'Assigned' || alert.status === 'In Progress' || alert.status === 'Unconfirmed')
  const claim = activeClaim(alert.id, state.careEvents, now())
  const claimMember = state.members.find(member => (member.userId ?? member.id) === claim?.actorId)
  const isClaimant = claim?.actorId === currentUser?.id
  const canClaim = state.activeCircleRole !== 'view-only' && !claim && (alert.status === 'Assigned' || alert.status === 'In Progress' || alert.status === 'Unconfirmed')
  const parentReply = latestParentReply(alert.id, state.careEvents)
  const assistantReading = parentReply ? [...state.careEvents].reverse().find(event => event.kind === 'reply_interpreted' && event.relatedEventId === parentReply.id && event.interpretation?.source === 'assistant') : undefined
  const thankableEvent = [...state.careEvents].reverse().find(event =>
    event.alertId === alert.id &&
    (event.kind === 'family_confirmed' || event.kind === 'claimed') &&
    event.actorType === 'member' &&
    event.actorId !== currentUser?.id
  )
  const thankedEvent = thankableEvent
    ? state.careEvents.find(event => event.kind === 'thanks_sent' && event.relatedEventId === thankableEvent.id)
    : undefined
  const thankableMember = state.members.find(member => (member.userId ?? member.id) === thankableEvent?.actorId)

  const assigneeUser = state.members.find(member => (member.userId ?? member.id) === alert.assignedTo)
  const confirmedByUser = state.members.find(member => (member.userId ?? member.id) === alert.confirmedBy)

  const assignablePeople = state.members.filter(member => member.status === 'Active' && Boolean(member.userId))

  function handleAssign() {
    if (!assignTo) return
    actions.assignAlert(alert!.id, assignTo)
    setAssignTo('')
  }

  function handleConfirm() {
    gate.requireAccount(() => actions.showConfirm({
      title: 'Record family confirmation',
      message: `Record that you confirmed ${alert!.medicationName} ${alert!.dose} with ${activePatient?.parentChannel.preferredName ?? 'the parent'}?`,
      confirmLabel: 'I confirmed it with them',
      variant: 'primary',
      onConfirm: () => actions.confirmAlert(alert!.id),
    }), `confirm-dose:${alert!.id}`)
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={actions.closeAlertDetail}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md z-10 overflow-y-auto max-h-[90vh]">
        {/* Header strip */}
        <div
          className="px-5 pt-5 pb-4"
          style={{ borderBottom: '1px solid #E2ECE3', background: 'linear-gradient(135deg, #EAF4EB 0%, #F8F8F0 100%)' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertSourceStatus alert={alert} />
              </div>
              <h2 id="alert-title" className="text-lg font-semibold text-slate-800">
                {alert.medicationName}
              </h2>
              <p className="text-slate-500 text-sm">{alert.dose} · {fmt12h(alert.scheduledTime)}{alert.scheduledDate === new Date(now().getTime() - now().getTimezoneOffset() * 60000).toISOString().slice(0, 10) ? ' today' : ', ' + fmtDate(alert.scheduledDate)}</p>
            </div>
            <button
              ref={closeRef}
              onClick={actions.closeAlertDetail}
              className="p-2 rounded-xl text-slate-400 hover:bg-white hover:text-slate-600 transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <XMarkIcon className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Details */}
        <div className="px-5 pb-2">
          <DetailRow label="Scheduled time">
            <span className="flex items-center gap-1.5">
              <ClockIcon className="w-3.5 h-3.5 text-slate-400" />
              {fmt12h(alert.scheduledTime)}, {fmtDate(alert.scheduledDate)}
            </span>
          </DetailRow>
          <DetailRow label="Source">
            <span className="flex items-center gap-1.5">
              <ShieldCheckIcon className="w-3.5 h-3.5 text-slate-400" />
              {alert.source}
            </span>
          </DetailRow>
          <DetailRow label="Created">
            {fmtDatetime(alert.createdAt)}
          </DetailRow>

          {assigneeUser && (
            <DetailRow label="Assigned to">
              <span className="flex items-center gap-1.5">
                <span
                  className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-white text-[9px] font-semibold"
                  style={{ backgroundColor: assigneeUser.color }}
                >
                  {assigneeUser.initials}
                </span>
                {assigneeUser.name}
              </span>
            </DetailRow>
          )}

          {confirmedByUser && alert.confirmedAt && (
            <DetailRow label="Confirmed by">
              <span className="flex items-center gap-1.5">
                <span
                  className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-white text-[9px] font-semibold"
                  style={{ backgroundColor: confirmedByUser.color }}
                >
                  {confirmedByUser.initials}
                </span>
                {confirmedByUser.name} at {fmtDatetime(alert.confirmedAt)}
              </span>
            </DetailRow>
          )}

          {alert.notes && (
            <div className="py-3">
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1.5">Notes</p>
              <p className="text-sm text-slate-600 leading-relaxed">{alert.notes}</p>
            </div>
          )}
          {parentReply && (
            <div className="my-3 rounded-xl bg-slate-50 border border-slate-100 p-4">
              {canMemberSeeParentReplies(activePatient, state.currentUser?.id) && parentReply.rawText ? <><p className="text-sm font-semibold text-slate-800">{activePatient?.parentChannel.preferredName ?? 'Parent'} wrote: “{parentReply.rawText}” ({shortTime(parentReply.at)}).</p>{parentReply.replyCategory !== 'taken' && <span className="inline-flex mt-2 rounded-full bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600">{parentReplyCategoryLabel(parentReply)}</span>}
                {parentReply.replyCategory === 'felt_unwell' && <><p className="text-sm text-slate-600 mt-2">{activePatient?.parentChannel.preferredName ?? 'Parent'} mentioned how they feel. Care Circle cannot assess this. Please call them.</p><div className="flex flex-wrap gap-2 mt-3"><button onClick={() => actions.claimAlert(alert.id)} className="min-h-10 px-4 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700">I'll call them</button><button onClick={() => actions.addReplyToNextAppointment(alert.id)} className="min-h-10 px-4 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700">Add to doctor visit notes</button></div></>}
                {parentReply.replyCategory === 'supply' && <><p className="text-sm text-slate-600 mt-2">{activePatient?.parentChannel.preferredName ?? 'Parent'} said they have run out of {alert.medicationName}.</p><button onClick={() => actions.createRefillTask(alert.id)} className="mt-3 min-h-10 px-4 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700">Create refill task</button></>}</> : <p className="text-sm font-semibold text-slate-700">Waiting for {activePatient?.parentChannel.preferredName ?? 'the parent'} to agree to share with you</p>}
              {assistantReading && canMemberSeeParentReplies(activePatient, state.currentUser?.id) && <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3"><p className="text-[11px] font-semibold text-slate-500">Read by an assistant · a suggestion only</p><p className="text-sm text-slate-700 mt-1">{assistantReading.interpretation?.summary}</p><p className="text-xs text-slate-500 mt-1">It may mean “{(assistantReading.interpretation?.category ?? 'other').replace('_', ' ')}”. Their exact words above are the record; nothing was confirmed or changed.</p>{assistantReading.interpretation?.category === 'supply' && <button onClick={() => actions.createRefillTask(alert.id)} className="mt-2 min-h-10 px-4 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700">Create refill task</button>}{assistantReading.interpretation?.category === 'felt_unwell' && <button onClick={() => actions.claimAlert(alert.id)} className="mt-2 min-h-10 px-4 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700">I'll call them</button>}</div>}
            </div>
          )}
          {thankableEvent && (
            <div className="my-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
              {thankedEvent
                ? <p className="text-sm text-slate-600">Thanks sent to {thankableMember?.name ?? 'your family member'}.</p>
                : <Button variant="secondary" disabled={state.activeCircleRole === 'view-only'} onClick={() => actions.thankCareEvent(thankableEvent.id)}>Thank {thankableMember?.name ?? 'them'}</Button>}
            </div>
          )}
        </div>

        {/* Actions */}
        {alert.status !== 'Confirmed' && alert.status !== 'Missed' && alert.status !== 'Not recorded' && (
          <div className="px-5 pb-5 pt-3 space-y-3" style={{ borderTop: '1px solid #F1F5F9' }}>
            {claim ? <div className="rounded-xl bg-amber-50 border border-amber-100 p-3"><p className="text-sm font-semibold text-amber-800">{claimMember?.name ?? claim.text.replace(' is calling them', '')} is calling them</p>{isClaimant ? <div className="space-y-2 mt-3"><button onClick={() => gate.requireAccount(() => { actions.confirmAlert(alert.id); actions.closeAlertDetail() }, `confirm-dose:${alert.id}`)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[#2D8A5E]">They took it (I confirmed it with them)</button>{!unansweredMode ? <button onClick={() => setUnansweredMode(true)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200">Couldn't reach them</button> : <div className="space-y-2"><button onClick={() => { actions.recordCallUnanswered(alert.id, 'call_later'); actions.closeAlertDetail() }} className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200">Call again later</button><button onClick={() => { actions.recordCallUnanswered(alert.id, 'ask_backup'); actions.closeAlertDetail() }} className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200">Ask the backup</button><button onClick={() => { actions.recordCallUnanswered(alert.id, 'not_reachable'); actions.closeAlertDetail() }} className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200">Mark not reachable</button></div>}{!notTakenMode ? <button onClick={() => setNotTakenMode(true)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200">Record not taken</button> : <div className="rounded-xl bg-white border border-slate-200 p-3"><label className="text-xs font-medium text-slate-700">Reason or note<input value={notTakenReason} onChange={event => setNotTakenReason(event.target.value)} className="mt-1.5 w-full min-h-10 px-3 rounded-lg border border-slate-200 text-sm" /></label><button disabled={!notTakenReason.trim()} onClick={() => { actions.recordNotTaken(alert.id, notTakenReason); actions.closeAlertDetail() }} className="mt-2 w-full py-2 rounded-lg bg-slate-700 text-white text-xs font-semibold disabled:opacity-50">Record not taken</button></div>}</div> : <p className="text-xs text-amber-700 mt-1">The claim pauses follow-up steps for 20 minutes.</p>}</div> : canClaim && <button onClick={() => actions.claimAlert(alert.id)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50">I'll call them</button>}
            {/* Assign section */}
            {canAssign && !claim && (
              <div>
                <p className="text-xs text-slate-500 mb-2 font-medium">
                  {alert.status === 'Assigned' ? 'Reassign follow-up' : 'Assign follow-up to'}
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <select
                      value={assignTo}
                      onChange={e => setAssignTo(e.target.value)}
                      className="w-full appearance-none text-sm px-3 py-2.5 pr-8 rounded-xl border text-slate-700 bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-[#2B6B50]"
                      style={{ borderColor: assignTo ? '#2B6B50' : '#E2E8F0' }}
                      aria-label="Select family member to assign"
                    >
                      <option value="">Select family member…</option>
                      {assignablePeople.map(member => (
                        <option key={member.id} value={member.userId}>{member.name} ({member.relationship || member.role})</option>
                      ))}
                    </select>
                    <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                  <button
                    onClick={handleAssign}
                    disabled={!assignTo}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ backgroundColor: '#2B6B50' }}
                  >
                    Assign
                  </button>
                </div>
              </div>
            )}

            {/* Confirm button */}
            {canConfirm && !claim && (
              <>
                <button
                  onClick={handleConfirm}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-colors"
                  style={{ backgroundColor: '#2D8A5E' }}
                >
                  I confirmed it with them
                </button>
                {!notTakenMode ? (
                  <button onClick={() => setNotTakenMode(true)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50">Record not taken</button>
                ) : (
                  <div className="rounded-xl bg-slate-50 p-3">
                    <label className="text-xs font-medium text-slate-700">Reason or note
                      <input value={notTakenReason} onChange={e => setNotTakenReason(e.target.value)} placeholder="e.g. Parent replied that it was not taken" className="mt-1.5 w-full min-h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-700" />
                    </label>
                    <div className="flex justify-end gap-2 mt-2">
                      <button onClick={() => setNotTakenMode(false)} className="text-xs font-semibold text-slate-500 px-3 py-2">Cancel</button>
                      <button disabled={!notTakenReason.trim()} onClick={() => { actions.recordNotTaken(alert.id, notTakenReason); actions.closeAlertDetail() }} className="text-xs font-semibold text-white bg-slate-700 rounded-lg px-3 py-2 disabled:opacity-50">Record not taken</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Role notice */}
            {!canAssign && !canConfirm && (
              <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-slate-50">
                <UserIcon className="w-4 h-4 text-slate-400" />
                <p className="text-xs text-slate-500">
                  {alert.status === 'Assigned' && alert.assignedTo !== currentUser?.id
                    ? `Assigned to ${assigneeUser?.name}. You can confirm once they accept.`
                    : 'No actions available for your role.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Confirmed state */}
        {alert.status === 'Confirmed' && (
          <div className="px-5 pb-5 pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
              <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#16A34A' }}>
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-emerald-800">Response recorded</p>
                <AlertSourceStatus alert={alert} />
              </div>
            </div>
          </div>
        )}
        {(alert.status === 'Confirmed' || alert.status === 'Missed') && state.activeCircleRole !== 'view-only' && (
          <div className="px-5 pb-5">
            <Button variant="ghost" className="w-full" onClick={() => actions.correctAlertRecord(alert.id)}>Not right? Correct this</Button>
          </div>
        )}
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50"><p className="text-xs text-slate-500 leading-relaxed">Care Circle does not contact emergency services. In an emergency, call your local emergency number.</p></div>
      </div>
    </div>
  )
}
