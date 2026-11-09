import type { CareEvent, ParentReplyCategory, Patient } from '../types'
import { canMemberSeeParentReplies } from './careEvents'

// A general symptom is not evidence about any particular medicine or dose.
// Keep it person-level even if it followed a reminder in the conversation.
export function replyAlertId(category: ParentReplyCategory, alertId: string | undefined, sharingReply: boolean) {
  return sharingReply || category === 'felt_unwell' ? undefined : alertId
}

export function visiblePersonSymptoms(events: CareEvent[], patient: Patient | undefined, memberId: string | undefined) {
  if (!patient || !canMemberSeeParentReplies(patient, memberId)) return []
  return events.filter(event => event.patientId === patient.id && event.kind === 'parent_replied' && event.replyCategory === 'felt_unwell' && !event.alertId && Boolean(event.rawText))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}
