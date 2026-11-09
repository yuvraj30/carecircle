import type { CircleMember, MedicationAlert, Patient } from '../types'

// The person who confirms a dose is not necessarily the caregiver responsible for it.
export function medicationOwner(
  alert: Pick<MedicationAlert, 'assignedTo' | 'confirmedBy'> | undefined,
  patient: Pick<Patient, 'primaryCaregiverId'> | undefined,
  members: CircleMember[],
) {
  const ownerId = alert?.assignedTo || patient?.primaryCaregiverId
  return members.find(member => (member.userId ?? member.id) === ownerId)
}
