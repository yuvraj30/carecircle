// Run with: node tests/nudges.test.cjs
// Exercise the real TypeScript modules without adding a test-runner dependency.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const values = new Map()
global.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
}

function load(relative, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  const requireLocal = id => imports[id] ?? require(id)
  new Function('require', 'exports', 'module', js)(requireLocal, module.exports, module)
  return module.exports
}
const dismissals = load('src/lib/dismissals.ts')
const { prioritizedDashboardNudge, dismissDashboardNudge, isNudgeCooldownActive, isInvitationExpired } = load('src/lib/nudges.ts', { './dismissals': dismissals })

const start = new Date('2026-11-09T10:00:00Z')
const hours = n => new Date(start.getTime() + n * 60 * 60 * 1000)
const state = {
  isLoading: false, isSample: false, activePatientId: 'patient', activeCircleId: 'circle',
  currentUser: { id: 'user' }, activeCircleRole: 'coordinator',
  preferences: { awayUntil: {}, firstCallMemberId: '', backupMemberId: '' },
  alerts: [], careEvents: [], members: [],
  patients: [{ id: 'patient', parentChannel: { reminders: { status: 'Agreed' } } }],
  tasks: [{ id: 'task', patientId: 'patient', status: 'To do', assigneeId: '', due: hours(12).toISOString() }],
  appointments: [{ id: 'visit', patientId: 'patient', status: 'Upcoming', datetime: hours(48).toISOString(), preparationComplete: false }],
}

assert.equal(prioritizedDashboardNudge(state, start).id, 'unowned:task')
assert.equal(isNudgeCooldownActive(state, start), false)
dismissDashboardNudge(state, 'unowned:task', start)
assert.equal(isNudgeCooldownActive(state, hours(23)), true, 'The shared pause remains active while the first prompt is dismissed')
assert.equal(isNudgeCooldownActive(state, hours(24)), false, 'The shared pause ends after 24 hours')
assert.equal(isNudgeCooldownActive({ ...state, activeCircleId: 'another-circle' }, hours(1)), false, 'Another circle does not inherit the pause')
assert.equal(prioritizedDashboardNudge(state, hours(23)), undefined, 'Dismissal should pause other suggestions for one day')
assert.equal(prioritizedDashboardNudge(state, hours(25)).id, 'visit:visit', 'Another relevant suggestion can appear after the pause')
assert.equal(prioritizedDashboardNudge({ ...state, appointments: [] }, hours(25)), undefined, 'Dismissed task stays hidden for 14 days')
assert.equal(prioritizedDashboardNudge({ ...state, appointments: [], activeCircleId: 'another-circle' }, hours(25)).id, 'unowned:task', 'Dismissal is scoped to the circle')
assert.equal(prioritizedDashboardNudge({ ...state, activeCircleRole: 'view-only', activeCircleId: 'view-only' }, start), undefined, 'View-only members should not get edit prompts')

const sample = { ...state, isSample: true }
const beforeSample = values.size
dismissDashboardNudge(sample, 'unowned:task', start)
assert.equal(values.size, beforeSample, 'Sample dismissals must not write to localStorage')
assert.equal(prioritizedDashboardNudge(sample, hours(1)), undefined)
assert.equal(isNudgeCooldownActive(sample, hours(1)), true, 'The sample also pauses other suggestions in memory')

// Hiding a journey suggestion starts the same shared pause, but the pause is scoped.
const journeyState = { ...state, activeCircleId: 'journey-circle' }
dismissDashboardNudge(journeyState, 'care-journey-suggestion', start)
assert.equal(isNudgeCooldownActive(journeyState, hours(1)), true)
assert.equal(prioritizedDashboardNudge(journeyState, hours(1)), undefined)
assert.equal(isNudgeCooldownActive(journeyState, hours(25)), false)

const waitingInvite = { status: 'Invited', expiresAt: hours(24).toISOString() }
const expiredInvite = { status: 'Invited', expiresAt: hours(-1).toISOString() }
assert.equal(isInvitationExpired(waitingInvite, start), false)
assert.equal(isInvitationExpired(expiredInvite, start), true)
assert.equal(isInvitationExpired({ expiresAt: 'invalid' }, start), true, 'Malformed expiration cannot establish a usable link')
const inviteState = { ...state, tasks: [], appointments: [], activeCircleId: 'invite-circle', members: [expiredInvite] }
assert.equal(prioritizedDashboardNudge(inviteState, start).id, 'invitation-expired')
assert.match(prioritizedDashboardNudge(inviteState, start).detail, /new one/i)
assert.equal(prioritizedDashboardNudge({ ...inviteState, members: [expiredInvite, waitingInvite] }, start).id, 'invitation-pending', 'A usable pending link takes precedence')
assert.equal(prioritizedDashboardNudge({ ...inviteState, activeCircleRole: 'view-only' }, start), undefined, 'Only coordinators should be prompted to renew invitations')
console.log('Nudge priority, scope, cooldown, role and sample checks passed.')
