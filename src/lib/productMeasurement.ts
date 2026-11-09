/**
 * Optional, device-local prototype measurement. No data is sent to a server.
 * Only these fixed counters can be recorded; there is deliberately no payload.
 */
export type ProductEvent =
  | 'tour_started'
  | 'tour_finished'
  | 'nudge_shown'
  | 'nudge_accepted'
  | 'nudge_dismissed'
  | 'helper_joined'
  | 'task_assigned'
  | 'task_completed'

export const PRODUCT_EVENTS: readonly ProductEvent[] = [
  'tour_started', 'tour_finished', 'nudge_shown', 'nudge_accepted', 'nudge_dismissed',
  'helper_joined', 'task_assigned', 'task_completed',
]

export type MeasurementCounts = Record<ProductEvent, number>
const PREFIX = 'carecircle-product-measurement:v1:'
export const MEASUREMENT_CHANGE = 'carecircle:measurement-change'

function emptyCounts(): MeasurementCounts {
  return Object.fromEntries(PRODUCT_EVENTS.map(event => [event, 0])) as MeasurementCounts
}

function storageKey(userId: string) { return PREFIX + encodeURIComponent(userId) }

/** Returns null until this account explicitly opts in on this device. */
export function readProductMeasurement(userId: string | undefined, isSample: boolean): MeasurementCounts | null {
  if (!userId || isSample) return null
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !('enabled' in parsed) || parsed.enabled !== true || !('counts' in parsed) || !parsed.counts || typeof parsed.counts !== 'object') return null
    const counts = emptyCounts()
    for (const event of PRODUCT_EVENTS) {
      const value = (parsed.counts as Record<string, unknown>)[event]
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) counts[event] = value
    }
    return counts
  } catch { return null }
}

/** False indicates storage was unavailable; never silently claims a preference was saved. */
export function setProductMeasurement(userId: string | undefined, isSample: boolean, enabled: boolean): boolean {
  if (!userId || isSample) return false
  try {
    if (enabled) localStorage.setItem(storageKey(userId), JSON.stringify({ enabled: true, counts: emptyCounts() }))
    else localStorage.removeItem(storageKey(userId))
    window.dispatchEvent(new Event(MEASUREMENT_CHANGE))
    return true
  } catch { return false }
}

/** Ignore unknown events, anonymous/sample sessions, and any account without opt-in. */
export function recordProductEvent(userId: string | undefined, isSample: boolean, event: ProductEvent): void {
  if (!userId || isSample || !PRODUCT_EVENTS.includes(event)) return
  const counts = readProductMeasurement(userId, isSample)
  if (!counts) return
  counts[event] = Math.min(Number.MAX_SAFE_INTEGER, counts[event] + 1)
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify({ enabled: true, counts }))
    window.dispatchEvent(new Event(MEASUREMENT_CHANGE))
  } catch { /* Optional measurement must never interrupt care. */ }
}
