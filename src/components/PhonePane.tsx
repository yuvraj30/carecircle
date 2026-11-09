import '../phone-refresh.css'
import { useState } from 'react'
import { useApp } from '../context'
import { parentConsentMessages } from '../constants/parentConsent'
import { FAMILY_MESSAGE_AUTO_REPLY } from '../constants/replyClassifier'
import { canMemberSeeParentReplies, shortTime } from '../lib/careEvents'
import { Button, Field } from './ui'
import { XMarkIcon } from './icons'
import { MedicinePhoto } from './MedicinePhoto'
import { BUILT_IN_MEDICINE_PHOTOS } from '../lib/medicinePhotos'
import type { CareEvent, Medication, MedicationPhoto } from '../types'
import { digestEvents, joinNames } from '../lib/weeklyDigest'

type PhoneMessage = {
  id: string
  at: string
  direction: 'in' | 'out'
  text: string
  medicinePhoto?: MedicationPhoto
  parentPhotoUrl?: string
  savedMedicine?: Medication
  parentPhotoEvent?: CareEvent
  judgement?: CareEvent
}

function displayDose(dose: string) {
  return dose.replace(/(\d)\s*(mg|mcg|g|ml)\b/i, '$1 $2')
}

export function PhonePane() {
  const { state, actions, now } = useApp()
  const [freeText, setFreeText] = useState('')
  const [choosingPhoto, setChoosingPhoto] = useState(false)
  const [clockOpen, setClockOpen] = useState(false)
  if (!state.phonePaneOpen) return null
  const patient = state.patients.find(item => item.id === state.activePatientId)
  if (!patient) return null

  const consentAt = patient.parentChannel.reminders.changedAt
  const eventMessages: PhoneMessage[] = []
  for (const event of state.careEvents.filter(item => item.patientId === patient.id && (
    item.kind === 'reminder_sent' ||
    item.kind === 'followup_sent' ||
    item.kind === 'parent_replied' ||
    item.kind === 'consent_changed' ||
    item.kind === 'member_added' ||
    item.kind === 'medicine_changed' ||
    item.kind === 'appointment_reminder' ||
    item.kind === 'refill_needed' ||
    item.kind === 'refill_done' ||
    item.kind === 'parent_medicine_photo' ||
    (item.kind === 'weekly_digest' && item.recipientIds?.includes(state.currentUser?.id ?? ''))
  ))) {
    if (event.kind === 'member_added') {
      const member = state.members.find(item => (item.userId ?? item.id) === event.memberId)
      eventMessages.push({ id: event.id, at: event.at, direction: 'out', text: `${member?.name ?? 'A family member'} has joined your family circle. May we share your replies with them? Reply YES or NO.` })
      continue
    }
    if (event.kind === 'consent_changed') {
      if (event.rawText && event.consentResponse) {
        eventMessages.push({ id: `${event.id}-reply`, at: event.at, direction: 'in', text: event.rawText })
        const isSharingReply = event.text.includes('reply sharing')
        const autoReply = isSharingReply
          ? event.consentResponse === 'agrees'
            ? 'Thank you. Your replies will be shared only with the family members named in the question.'
            : 'Thank you. Your replies will not be shared.'
          : event.consentResponse === 'agrees'
            ? 'Thank you. We will send your medicine reminders here. Reply STOP any time to pause them.'
            : event.consentResponse === 'declines'
              ? 'Thank you. We will not send medicine reminders.'
              : 'Reminder messages have been stopped.'
        eventMessages.push({ id: `${event.id}-auto`, at: event.at, direction: 'out', text: autoReply })
      }
      continue
    }
    if (event.kind === 'medicine_changed') {
      eventMessages.push({ id: event.id, at: event.at, direction: 'out', text: event.parentText ?? event.text })
      continue
    }
    if (event.kind === 'reminder_sent') {
      const alert = state.alerts.find(item => item.id === event.alertId)
      const medicine = state.medications.find(item => item.id === alert?.medicationId)
      const photo = medicine?.photos?.[0]
      const appearance = medicine?.appearance?.trim().replace(/[.!]+$/, '')
      const text = alert
        ? `${alert.medicationName} ${displayDose(alert.dose)}.${photo && appearance ? ` The ${appearance}.` : ''}${patient.parentChannel.familyNote ? ` ${patient.parentChannel.familyNote}` : ''}`
        : event.text
      eventMessages.push({ id: event.id, at: event.at, direction: 'out', text, medicinePhoto: photo })
      continue
    }
    if (event.kind === 'parent_medicine_photo') {
      const judgement = state.careEvents.find(item => item.kind === 'medicine_photo_judgement' && item.relatedEventId === event.id)
      eventMessages.push({
        id: event.id,
        at: event.at,
        direction: 'in',
        text: event.text,
        parentPhotoUrl: event.photoDataUrl,
        savedMedicine: state.medications.find(item => item.id === event.medicationId),
        parentPhotoEvent: event,
        judgement,
      })
      continue
    }
    if (event.kind === 'weekly_digest') {
      const recipientNames = (event.recipientIds ?? [])
        .map(id => state.members.find(member => (member.userId ?? member.id) === id)?.name.split(' ')[0])
        .filter((name): name is string => Boolean(name))
      const replyCount = digestEvents(state, event).filter(item => item.kind === 'parent_replied' && item.alertId).length
      eventMessages.push({
        id: event.id,
        at: event.at,
        direction: 'out',
        text: `This week we shared a summary with ${joinNames(recipientNames)}: you replied ${replyCount} times. You can reply STOP SHARING at any time.`,
      })
      continue
    }
    if (event.kind !== 'parent_replied') {
      eventMessages.push({ id: event.id, at: event.at, direction: 'out', text: event.text })
      continue
    }
    eventMessages.push({ id: event.id, at: event.at, direction: 'in', text: canMemberSeeParentReplies(patient, state.currentUser?.id) ? event.rawText ?? event.text : `Waiting for ${patient.parentChannel.preferredName} to agree to share with you` })
    let autoReply = event.parentText ?? ''
    if (!event.memberId && (event.replyCategory === 'felt_unwell' || event.replyCategory === 'other' || event.replyCategory === 'not_taken')) autoReply = FAMILY_MESSAGE_AUTO_REPLY
    if (event.replyCategory === 'pause') autoReply = 'Reminder messages are paused until tomorrow morning.'
    if (event.replyCategory === 'stop') autoReply = 'Reminder messages have been stopped.'
    if (event.replyCategory === 'stop_sharing') autoReply = 'Your replies will no longer be shared with family members.'
    if (event.replyCategory === 'who') {
      const sharedMembers = state.members.filter(member => patient.parentChannel.sharing.sharedWith.includes(member.userId ?? member.id))
      autoReply = sharedMembers.length
        ? `You agreed to share replies with ${sharedMembers.map(member => `${member.name} (${member.role}; ${member.role === 'view-only' ? 'shared logistics and permitted records' : 'logistics, replies, and permitted records'})`).join(', ')}.`
        : 'You have not agreed to share replies with any family members.'
    }
    if (autoReply) eventMessages.push({ id: `${event.id}-auto`, at: event.at, direction: 'out', text: autoReply })
  }
  const consentMessages = parentConsentMessages(patient.parentChannel.language, patient.preferredName || patient.name, state.members.filter(member => member.status === 'Active').map(member => member.name), Boolean(patient.parentChannel.aiReading))
  const conversation = [
    ...(consentAt && patient.parentChannel.reminders.status !== 'Not asked' ? [
      { id: 'consent-reminders', at: consentAt, direction: 'out' as const, text: consentMessages.reminders },
    ] : []),
    ...(patient.parentChannel.sharing.status !== 'Not asked' && patient.parentChannel.sharing.changedAt ? [
      { id: 'consent-sharing', at: patient.parentChannel.sharing.changedAt, direction: 'out' as const, text: consentMessages.sharing },
    ] : []),
    ...eventMessages,
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

  const replyTarget = state.careEvents
    .filter(event => event.patientId === patient.id && event.kind === 'reminder_sent' && event.alertId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map(event => state.alerts.find(alert => alert.id === event.alertId))
    .find(alert => alert && alert.status !== 'Confirmed' && alert.status !== 'Missed' && alert.status !== 'Not recorded')

  return <>
    <button className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => actions.togglePhonePane(false)} aria-label="Close parent messages" />
    <aside className="cc-phone-panel fixed z-40 inset-x-3 bottom-3 max-h-[88vh] lg:inset-y-4 lg:left-auto lg:right-4 lg:w-96 bg-[#f4f6f2] border-4 border-[#26343a] rounded-[2.2rem] shadow-2xl overflow-hidden flex flex-col" aria-label={`${patient.parentChannel.preferredName}'s WhatsApp conversation`}>
      <div className="cc-phone-head cc-phone-header px-4 py-3">
        <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-white">{patient.parentChannel.preferredName} · WhatsApp</p><p className="text-xs text-white/85">Care Circle reminders and replies</p></div><button onClick={() => actions.togglePhonePane(false)} className="p-2 rounded-lg text-white hover:bg-white/20" aria-label="Close"><XMarkIcon className="w-4 h-4" /></button></div>
        <div className="mt-3 rounded-2xl bg-white/95 p-3"><button type="button" className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-600" aria-expanded={clockOpen} onClick={() => setClockOpen(open => !open)}><span>Simulated time (prototype only)</span><span>{clockOpen ? 'Hide controls' : 'Show controls'}</span></button><p className="text-xs text-slate-500 mt-1">{now().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p><div className={'flex flex-wrap gap-1.5 mt-2' + (clockOpen ? '' : ' hidden')}><Button variant="secondary" className="min-h-8 px-2 py-1 text-xs" onClick={() => actions.advanceSimulatedTime(15)}>+15 min</Button><Button variant="secondary" className="min-h-8 px-2 py-1 text-xs" onClick={() => actions.advanceSimulatedTime(30)}>+30 min</Button><Button variant="secondary" className="min-h-8 px-2 py-1 text-xs" onClick={() => actions.advanceSimulatedTime(60)}>+1 h</Button><Button variant="secondary" className="min-h-8 px-2 py-1 text-xs" onClick={() => actions.advanceSimulatedTime(120)}>+2 h</Button><Button variant="secondary" className="min-h-8 px-2 py-1 text-xs" onClick={actions.jumpToNextReminder}>Jump to next reminder</Button><Button variant="secondary" className="min-h-8 px-2 py-1 text-xs" onClick={actions.jumpToSundayDigest}>Jump to Sunday 18:00</Button><Button variant="ghost" className="min-h-8 px-2 py-1 text-xs" onClick={actions.resetSimulatedTime}>Reset to now</Button></div></div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 cc-chat cc-phone-messages">
        {conversation.map(message => <div key={message.id} className={`flex ${message.direction === 'in' ? 'justify-start' : 'justify-end'}`}><div className={`${message.parentPhotoUrl ? 'max-w-full' : 'max-w-[85%]'} rounded-2xl px-3 py-2 shadow-sm ${message.direction === 'in' ? 'bg-white rounded-bl-md' : 'bg-[#d9f3df] rounded-br-md'}`}>{message.medicinePhoto && <MedicinePhoto photo={message.medicinePhoto} alt="Saved medicine reference" className="w-full h-32 rounded-xl mb-2" />}<p className="text-sm text-slate-700 leading-relaxed">{message.text}</p>{message.parentPhotoUrl && <div className="mt-3"><div className="grid grid-cols-2 gap-2"><div><p className="text-[10px] font-semibold text-slate-500 mb-1">{patient.parentChannel.preferredName} sent</p><img src={message.parentPhotoUrl} alt={`Medicine ${patient.parentChannel.preferredName} is holding`} className="w-full h-28 rounded-xl object-cover" /></div><div><p className="text-[10px] font-semibold text-slate-500 mb-1">Family saved</p>{message.savedMedicine?.photos?.[0] ? <MedicinePhoto photo={message.savedMedicine.photos[0]} alt="Family-saved medicine" className="w-full h-28 rounded-xl" /> : <div className="w-full h-28 rounded-xl bg-slate-100 flex items-center justify-center text-center text-xs text-slate-400 p-2">No family photo saved</div>}</div></div><p className="text-xs text-amber-800 bg-amber-50 rounded-xl p-2 mt-2">Care Circle cannot confirm these are the same medicine. Please compare them.</p>{message.judgement ? <div className="mt-2"><p className="text-xs font-semibold text-slate-700">{message.judgement.text}</p>{message.judgement.judgement === 'different' && message.parentPhotoEvent?.alertId && <Button variant="secondary" className="mt-2 w-full" onClick={() => actions.claimAlert(message.parentPhotoEvent!.alertId!)}>I'll call them</Button>}</div> : <div className="grid grid-cols-2 gap-2 mt-2"><Button variant="secondary" disabled={state.activeCircleRole === 'view-only'} onClick={() => actions.judgeParentMedicinePhoto(message.id, 'same')}>Looks the same</Button><Button variant="secondary" disabled={state.activeCircleRole === 'view-only'} onClick={() => actions.judgeParentMedicinePhoto(message.id, 'different')}>Looks different</Button></div>}</div>}<p className="text-[10px] text-slate-400 text-right mt-1">{shortTime(message.at)}</p></div></div>)}
      </div>
      <div className="cc-phone-compose bg-white border-t border-slate-200 p-4"><p className="text-xs font-semibold text-slate-600">Reply as {patient.parentChannel.preferredName}</p><div className="flex flex-wrap gap-2 mt-2">{(['Taken', 'Not taken', 'Le li', 'Nahi liya'] as const).map(reply => <Button key={reply} variant="secondary" className="px-3" disabled={!replyTarget || state.isLoading} onClick={() => replyTarget && actions.ingestParentReply(replyTarget.id, reply)}>{reply}</Button>)}</div><details className="cc-phone-more"><summary>More reply options</summary><div className="cc-phone-more-options">{(['Ran out', 'Later'] as const).map(reply => <Button key={reply} variant="secondary" className="px-3" disabled={!replyTarget || state.isLoading} onClick={() => replyTarget && actions.ingestParentReply(replyTarget.id, reply)}>{reply}</Button>)}{(['Not feeling well', 'Dizzy'] as const).map(reply => <Button key={reply} variant="secondary" className="px-3" disabled={state.isLoading} onClick={() => actions.ingestParentReply(undefined, reply)}>{reply}</Button>)}</div><Button variant="secondary" className="w-full mt-2" disabled={!replyTarget || state.isLoading} onClick={() => setChoosingPhoto(value => !value)}>Send a photo of what I'm holding</Button>{choosingPhoto && replyTarget && <div className="grid grid-cols-3 gap-2 mt-2">{BUILT_IN_MEDICINE_PHOTOS.map(sample => <Button key={sample.id} type="button" variant="secondary" className="h-auto p-1.5 flex-col" onClick={() => { actions.sendParentMedicinePhoto(replyTarget.id, sample.id, sample.dataUrl); setChoosingPhoto(false) }}><img src={sample.dataUrl} alt="" className="w-full h-16 object-cover rounded-lg" /><span className="text-[10px] mt-1">{sample.label}</span></Button>)}</div>}</details><div className="grid grid-cols-[1fr_auto] gap-2 items-end mt-3"><Field label="Free-text reply" value={freeText} onChange={event => setFreeText(event.target.value)} placeholder="Type a reply or command…" /><Button disabled={!freeText.trim() || state.isLoading} onClick={() => { actions.ingestParentReply(replyTarget?.id, freeText); setFreeText('') }}>Send</Button></div>{!replyTarget && <p className="text-xs text-slate-400 mt-2">No medicine reminder is waiting; general replies, consent and sharing commands still work.</p>}</div>
    </aside>
  </>
}
