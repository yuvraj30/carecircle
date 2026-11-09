import type { CareEvent } from '../types'

const GARDEN_ACTIONS = new Set<CareEvent['kind']>(['task_accepted', 'task_taken', 'task_completed', 'family_confirmed', 'not_taken_recorded', 'refill_done'])

/** A quiet reflection of recorded coordination, not a measure of health. */
export function sharedGarden(events: CareEvent[], patientId: string, now: Date) {
  const end = now.getTime()
  const start = end - 7 * 24 * 60 * 60 * 1000
  const recent = events.filter(event => event.patientId === patientId && event.actorType === 'member' && GARDEN_ACTIONS.has(event.kind) && Date.parse(event.at) >= start && Date.parse(event.at) <= end)
  return {
    hasHandoff: recent.some(event => event.kind === 'task_accepted' || event.kind === 'task_taken'),
    hasCompletion: recent.some(event => event.kind === 'task_completed'),
    hasRefill: recent.some(event => event.kind === 'refill_done'),
    hasCheckIn: recent.some(event => event.kind === 'family_confirmed' || event.kind === 'not_taken_recorded'),
    latest: [...recent].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0],
  }
}
