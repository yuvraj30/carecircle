import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context'
import { MEASUREMENT_CHANGE, readProductMeasurement, recordProductEvent, setProductMeasurement, type MeasurementCounts } from '../lib/productMeasurement'
import '../product-measurement.css'

/** Mount inside the signed-in provider. It observes changes only after explicit opt-in. */
export function ProductMeasurementObserver() {
  const { state } = useApp()
  const userId = state.currentUser?.id
  const [enabled, setEnabled] = useState(false)
  const previous = useRef<{ scope: string; helpers: number; assigned: number; completed: number } | null>(null)

  useEffect(() => {
    const sync = () => setEnabled(readProductMeasurement(userId, state.isSample) !== null)
    sync()
    window.addEventListener(MEASUREMENT_CHANGE, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(MEASUREMENT_CHANGE, sync); window.removeEventListener('storage', sync) }
  }, [userId, state.isSample])

  useEffect(() => {
    if (!enabled || !userId || state.isSample || state.isLoading || state.commitError || !state.activeCircleId) {
      if (!enabled || !userId || state.isSample) previous.current = null
      return
    }
    // Scope is kept only in memory to avoid counting switches or initial loading as new activity.
    const scope = `${userId}\u0000${state.activeCircleId}`
    const current = {
      scope,
      helpers: state.members.filter(member => member.status === 'Active' && (member.userId ?? member.id) !== userId).length,
      assigned: state.tasks.filter(task => Boolean(task.assigneeId)).length,
      completed: state.tasks.filter(task => task.status === 'Completed').length,
    }
    const before = previous.current
    previous.current = current
    if (!before || before.scope !== scope) return
    if (current.helpers > before.helpers) recordProductEvent(userId, false, 'helper_joined')
    if (current.assigned > before.assigned) recordProductEvent(userId, false, 'task_assigned')
    if (current.completed > before.completed) recordProductEvent(userId, false, 'task_completed')
  }, [enabled, userId, state.isSample, state.isLoading, state.commitError, state.activeCircleId, state.members, state.tasks])
  return null
}

const labels: [keyof MeasurementCounts, string][] = [
  ['tour_started', 'Tour starts'], ['tour_finished', 'Tours finished'],
  ['nudge_shown', 'Suggestions shown'], ['nudge_accepted', 'Suggestions opened'], ['nudge_dismissed', 'Suggestions dismissed'],
  ['helper_joined', 'New active helpers observed'], ['task_assigned', 'Task assignment increases observed'], ['task_completed', 'Task completion increases observed'],
]

/** Mount this control in the signed-in settings view; never in the sample. */
export function ProductMeasurementSettings() {
  const { state } = useApp()
  const userId = state.currentUser?.id
  const [counts, setCounts] = useState<MeasurementCounts | null>(() => readProductMeasurement(userId, state.isSample))
  const [error, setError] = useState('')
  useEffect(() => {
    const sync = () => setCounts(readProductMeasurement(userId, state.isSample))
    sync()
    window.addEventListener(MEASUREMENT_CHANGE, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(MEASUREMENT_CHANGE, sync); window.removeEventListener('storage', sync) }
  }, [userId, state.isSample])
  if (state.isSample || !userId) return null

  const update = (enable: boolean) => {
    if (!setProductMeasurement(userId, false, enable)) setError('The preference could not be saved on this browser.')
    else setError('')
  }
  return <section className="cc-measurement" aria-labelledby="cc-measurement-title">
    <div className="cc-measurement-head"><div><span className="cc-measurement-kicker">OPTIONAL · THIS DEVICE</span><h2 id="cc-measurement-title">Local product measurement</h2></div><span className="cc-measurement-state">{counts ? 'On' : 'Off'}</span></div>
    <p>With your permission, this browser keeps simple counts of tour use, suggestions and observed circle activity. The counts are linked to your account on this device; the app does not send them to a server, and they exclude the sample. No patient names, messages, medicine details or care-record contents are stored in these counts.</p>
    <p>These are partial device counts, not a measure of care outcomes, retention, or activity across a circle. They begin only after you turn this on.</p>
    {counts ? <><details><summary>View counts on this device</summary><dl>{labels.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{counts[key]}</dd></div>)}</dl></details><button type="button" className="cc-measurement-button cc-measurement-secondary" onClick={() => update(false)}>Turn off and delete counts</button></> : <button type="button" className="cc-measurement-button" onClick={() => update(true)}>Turn on local measurement</button>}
    {error && <p role="alert" className="cc-measurement-error">{error}</p>}
  </section>
}
