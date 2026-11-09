import { useApp } from '../context'
import { sharedGarden } from '../lib/sharedGarden'

export function SharedGarden() {
  const { state, actions, now } = useApp()
  const garden = sharedGarden(state.careEvents, state.activePatientId, now())
  const member = state.members.find(person => (person.userId ?? person.id) === garden.latest?.actorId)
  const leaves = [garden.hasHandoff, garden.hasCompletion, garden.hasRefill, garden.hasCheckIn]
  return <details className="cc-shared-garden">
    <summary><span><small>OUR CIRCLE</small><strong>A little care, together</strong></span><span aria-hidden="true">＋</span></summary>
    <div className="cc-garden-content">
      <div className="cc-garden-illustration" aria-hidden="true"><svg viewBox="0 0 160 128" fill="none"><path d="M20 112 Q80 96 140 112" stroke="#b3c9ad" strokeWidth="2"/><path d="M80 103V53" stroke="#548369" strokeWidth="3" strokeLinecap="round"/><path d="M80 81C62 82 52 72 52 61C68 61 78 68 80 81Z" fill={leaves[0] ? '#7da68a' : '#e0e9dc'}/><path d="M80 70C83 56 94 51 107 52C106 63 96 72 80 70Z" fill={leaves[1] ? '#68987b' : '#e0e9dc'}/><path d="M80 55C67 48 67 37 72 27C83 34 87 43 80 55Z" fill={leaves[2] ? '#96b798' : '#e0e9dc'}/><circle cx="111" cy="32" r="7" fill={leaves[3] ? '#d8bc78' : '#edf0e5'}/><path d="M64 104H96L92 119H68L64 104Z" fill="#cfae88"/></svg></div>
      <div><span className="cc-garden-kicker">SMALL ACTS, SHARED</span><h3>A garden of care</h3><p>{garden.latest ? `${member?.name || 'A circle member'} recorded a care action in the last 7 days.` : 'Your circle can grow at its own pace. Recorded care actions will appear here.'}</p><p className="cc-garden-note">{state.isSample ? 'This is fictional sample activity.' : 'A reflection of recorded actions, not a measure of health or adherence.'}</p></div>
    </div>
    <div className="cc-garden-actions"><span>IDEAS FOR YOUR CIRCLE</span><div><button type="button" onClick={() => actions.setView('tasks')}>Share a care task <span>↗</span></button><button type="button" onClick={() => actions.setView('appointments')}>Prepare for a visit <span>↗</span></button><button type="button" onClick={() => actions.setView('circle')}>Connect a helper <span>↗</span></button></div></div>
  </details>
}
