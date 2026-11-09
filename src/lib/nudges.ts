import type { AppState, CircleMember, View } from '../types'
import { dismissFor14Days, isDismissed } from './dismissals'

export type DashboardNudge = {
  id: string
  title: string
  detail: string
  primaryLabel?: string
  secondaryLabel: string
  view?: View
  action?: 'resend-consent'
}

const DAY = 24 * 60 * 60 * 1000
// Keep sample data out of persistent storage, and preserve the same behaviour if storage is blocked.
const sessionDismissedUntil = new Map<string, number>()
const sessionCooldownUntil = new Map<string, number>()

function scopeFor(state: AppState) {
  return state.isSample ? 'sample' : `${state.currentUser?.id ?? 'guest'}:${state.activeCircleId}:${state.activePatientId}`
}

/** A supplied invalid expiry cannot establish that an invitation link still works. */
export function isInvitationExpired(member: Pick<CircleMember, 'expiresAt' | 'inviteToken'>, now = new Date()): boolean {
  if (!member.expiresAt) return Boolean(member.inviteToken)
  const expiresAt = Date.parse(member.expiresAt)
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime()
}

/** Dismiss this suggestion for 14 days and wait a day before showing another one. */
export function dismissDashboardNudge(state: AppState, id: string, now = new Date()) {
  const scope = scopeFor(state)
  const key = `nudge:${scope}:${id}`
  const until = now.getTime() + 14 * DAY
  const cooldown = now.getTime() + DAY
  sessionDismissedUntil.set(key, until)
  sessionCooldownUntil.set(scope, cooldown)
  if (state.isSample) return
  dismissFor14Days(key, now)
  try { localStorage.setItem(`carecircle-nudge-cooldown:${scope}`, String(cooldown)) } catch { /* Session fallback above. */ }
}

/** The pause applies to all contextual suggestions in this circle and patient scope. */
export function isNudgeCooldownActive(state: AppState, now = new Date()): boolean {
  const scope = scopeFor(state)
  const cooldownKey = `carecircle-nudge-cooldown:${scope}`
  let cooldown = sessionCooldownUntil.get(scope) ?? 0
  if (!state.isSample) {
    try { cooldown = Math.max(cooldown, Number(localStorage.getItem(cooldownKey)) || 0) } catch { /* Session fallback above. */ }
  }
  return now.getTime() < cooldown
}

export function prioritizedDashboardNudge(state: AppState, now = new Date(), sessionDismissed: string[] = []): DashboardNudge | undefined {
  if (state.isLoading || state.commitError || !state.activePatientId || isNudgeCooldownActive(state, now)) return undefined
  const scope = scopeFor(state)
  const hidden = (id: string) => {
    const key = `nudge:${scope}:${id}`
    return sessionDismissed.includes(`nudge:${id}`) || now.getTime() < (sessionDismissedUntil.get(key) ?? 0) || (!state.isSample && isDismissed(key, now))
  }
  const canEdit = state.activeCircleRole !== 'view-only'
  const canManage = state.activeCircleRole === 'coordinator'
  const memberId = state.currentUser?.id ?? ''
  const awayUntil = state.preferences.awayUntil[memberId]
  if (awayUntil && Date.parse(`${awayUntil}T23:59:59`) < now.getTime() && !hidden(`away-summary:${awayUntil}`)) {
    const since = Date.parse(`${awayUntil}T00:00:00`)
    const count = state.careEvents.filter(event => event.patientId === state.activePatientId && Date.parse(event.at) >= since && Date.parse(event.at) <= now.getTime()).length
    if (count) return { id: `away-summary:${awayUntil}`, title: 'While you were away', detail: `${count} care ${count === 1 ? 'update was' : 'updates were'} recorded. Review them when convenient.`, primaryLabel: 'Review updates', secondaryLabel: 'Not now', view: 'timeline' }
  }
  const firstMissed = state.alerts.find(alert => alert.patientId === state.activePatientId && alert.status === 'Missed')
  if (canManage && firstMissed && (!state.preferences.firstCallMemberId || !state.preferences.backupMemberId) && !hidden('follow-up-roles')) {
    return { id: 'follow-up-roles', title: 'Agree who follows up', detail: 'Choose a first-call and backup person for unanswered reminders. This is about roles, not blame.', primaryLabel: 'Review roles', secondaryLabel: 'Not now', view: 'settings' }
  }
  const patient = state.patients.find(item => item.id === state.activePatientId)
  const reminders = patient?.parentChannel.reminders
  if (canManage && reminders?.status === 'Asked' && Date.parse(reminders.changedAt) <= now.getTime() - 2 * DAY && !hidden('consent-pending')) {
    return { id: 'consent-pending', title: 'Reminder agreement is pending', detail: 'The simulated request has not received a reply. Review its status in the care profile.', primaryLabel: 'Review request', secondaryLabel: 'Not now', view: 'profile' }
  }
  const unowned = state.tasks.find(task => task.patientId === state.activePatientId && task.status !== 'Completed' && !task.assigneeId && Number.isFinite(Date.parse(task.due)) && Date.parse(task.due) <= now.getTime() + 3 * DAY)
  if (canEdit && unowned && !hidden(`unowned:${unowned.id}`)) {
    return { id: `unowned:${unowned.id}`, title: 'A task could use an owner', detail: 'Choose someone to take the next step, if they are available.', primaryLabel: 'Review tasks', secondaryLabel: 'Not now', view: 'tasks' }
  }
  const upcoming = state.appointments.filter(visit => (!visit.patientId || visit.patientId === state.activePatientId) && ['Upcoming', 'Confirmed'].includes(visit.status) && !visit.preparationComplete && Date.parse(visit.datetime) >= now.getTime() && Date.parse(visit.datetime) <= now.getTime() + 7 * DAY).sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime))[0]
  if (canEdit && upcoming && !hidden(`visit:${upcoming.id}`)) {
    return { id: `visit:${upcoming.id}`, title: 'Prepare for an upcoming visit', detail: 'Review the visit details and agree what your circle would like to bring or ask.', primaryLabel: 'Review visits', secondaryLabel: 'Not now', view: 'appointments' }
  }
  const invitations = state.members.filter(member => member.status === 'Invited')
  const waiting = invitations.some(member => !isInvitationExpired(member, now))
  if (canManage && waiting && !hidden('invitation-pending')) {
    return { id: 'invitation-pending', title: 'An invitation is waiting', detail: 'If you have not already, share the invitation link. The person joins only after accepting.', primaryLabel: 'View circle', secondaryLabel: 'Not now', view: 'circle' }
  }
  if (canManage && !waiting && invitations.some(member => isInvitationExpired(member, now)) && !hidden('invitation-expired')) {
    return { id: 'invitation-expired', title: 'An invitation needs a new link', detail: 'The previous link has expired or is unavailable. Create a new one if they still want to join.', primaryLabel: 'View circle', secondaryLabel: 'Not now', view: 'circle' }
  }
  return undefined
}
