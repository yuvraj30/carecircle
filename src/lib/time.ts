// One clock format for the whole app: 9:00 AM, 4:20 PM.

export function clockLabel(time: string) {
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h)) return time
  return `${h % 12 || 12}:${String(Number.isFinite(m) ? m : 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export function clockOf(date: Date) {
  return clockLabel(`${date.getHours()}:${date.getMinutes()}`)
}

// A dose counts as late once it has gone 30 minutes past its time without
// a confirmed reply; the same 30-minute window the reminder schedule uses.
export const LATE_AFTER_MINUTES = 30

export function lateBy(scheduledDate: string, scheduledTime: string, now: Date) {
  const due = new Date(`${scheduledDate}T${scheduledTime}:00`)
  const minutes = Math.floor((now.getTime() - due.getTime()) / 60000)
  return Number.isFinite(minutes) && minutes >= LATE_AFTER_MINUTES ? minutes : 0
}

export function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return hours === 1 ? '1 hour' : `${hours} hours`
}

export function dayAndClock(date: Date) {
  return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${clockOf(date)}`
}

// Include the year for recorded history, which may span multiple years.
export function recordedDateAndClock(date: Date) {
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${clockOf(date)}`
}
