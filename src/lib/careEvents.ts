import type { CareEvent, CircleMember, MedicationAlert, Patient } from '../types'
import { clockOf } from './time'

export function shortTime(value: string | Date) {
  return clockOf(value instanceof Date ? value : new Date(value))
}

export function latestAlertEvent(alertId: string, events: CareEvent[]) {
  return [...events].reverse().find(event => event.alertId === alertId)
}

export function latestParentReply(alertId: string, events: CareEvent[]) {
  return [...events].reverse().find(event => event.alertId === alertId && event.kind === 'parent_replied')
}

export function parentReplyCategoryLabel(event: CareEvent) {
  if (event.replyCategory === 'not_taken') return 'Not confirmed · needs a check'
  if (event.replyCategory === 'later') return 'Later · not confirmed'
  if (event.replyCategory === 'other') return 'Other reply · needs a check'
  if (event.replyCategory === 'supply') return 'Supply issue · needs a check'
  if (event.replyCategory === 'felt_unwell') return 'Felt unwell · needs a check'
  if (event.replyCategory === 'taken') return 'Taken'
  return event.replyCategory?.replace('_', ' ') ?? 'Parent reply'
}

export function activeClaim(alertId: string, events: CareEvent[], currentTime: Date) {
  let claimIndex = -1
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].alertId === alertId && events[index].kind === 'claimed') {
      claimIndex = index
      break
    }
  }
  if (claimIndex < 0) return undefined
  const claim = events[claimIndex]
  const resolved = events.slice(claimIndex + 1).some(event =>
    event.alertId === alertId &&
    ['claim_lapsed', 'call_unanswered', 'parent_replied', 'family_confirmed', 'not_taken_recorded'].includes(event.kind)
  )
  if (resolved || currentTime.getTime() - Date.parse(claim.at) >= 20 * 60 * 1000) return undefined
  return claim
}

export function alertSourceLabel(
  alert: MedicationAlert,
  events: CareEvent[],
  patient?: Patient,
  members: CircleMember[] = [],
  memberId?: string,
) {
  const parentReply = latestParentReply(alert.id, events)
  if (parentReply) {
    if (!canMemberSeeParentReplies(patient, memberId)) return `Waiting for ${patient?.parentChannel.preferredName ?? 'the parent'} to agree to share with you`
    return `${patient?.parentChannel.preferredName ?? 'Parent'} wrote: "${parentReply.rawText ?? parentReply.text}" (${shortTime(parentReply.at)})`
  }
  const event = latestAlertEvent(alert.id, events)
  if (event?.kind === 'family_confirmed') {
    const member = members.find(item => (item.userId ?? item.id) === event.actorId)
    return `${member?.name ?? event.text.replace(/\s+confirmed\.?$/, '')} confirmed ${shortTime(event.at)}`
  }
  if (event?.kind === 'not_taken_recorded') {
    const member = members.find(item => (item.userId ?? item.id) === event.actorId)
    return `${member?.name ?? 'Family member'} recorded not taken ${shortTime(event.at)}`
  }
  if (event?.kind === 'reminder_sent') {
    return `Simulated reminder ${shortTime(event.at)} · No reply yet`
  }
  if (event?.kind === 'followup_sent') return `Simulated follow-up ${shortTime(event.at)} · No reply yet`
  if (event?.kind === 'claimed') return event.text
  if (event?.kind === 'claim_lapsed') return 'Claim lapsed'
  if (event?.kind === 'call_unanswered') return `${event.text} · No reply yet`
  if (event?.kind === 'escalated') return event.text
  if (alert.status === 'Confirmed' && alert.confirmedAt) {
    if (alert.confirmedBy?.startsWith('parent-')) return `${patient?.parentChannel.preferredName ?? 'Parent'} replied ${shortTime(alert.confirmedAt)}`
    const member = members.find(item => (item.userId ?? item.id) === alert.confirmedBy)
    return `${member?.name ?? 'Family member'} confirmed ${shortTime(alert.confirmedAt)}`
  }
  return 'No reply yet'
}

export function canMemberSeeParentReplies(patient: Patient | undefined, memberId: string | undefined) {
  return Boolean(patient && memberId && patient.parentChannel.sharing.sharedWith.includes(memberId))
}

export function eventTextForMember(event: CareEvent, patient: Patient | undefined, memberId: string | undefined) {
  // The current reminder engine is a simulation, including historical events with older wording.
  if (event.kind === 'reminder_sent' || event.kind === 'followup_sent') {
    if (/^simulated\b/i.test(event.text)) return event.text
    if (/^reminder sent\b/i.test(event.text)) return event.text.replace(/^reminder sent\b/i, 'Simulated reminder')
    return `Simulated: ${event.text}`
  }
  if (event.kind !== 'parent_replied' || canMemberSeeParentReplies(patient, memberId)) return event.text
  return `Waiting for ${patient?.parentChannel.preferredName ?? 'the parent'} to agree to share with you`
}
