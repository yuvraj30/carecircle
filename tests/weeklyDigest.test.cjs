// Run with: node tests/weeklyDigest.test.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '..', 'src/lib/weeklyDigest.ts'), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const moduleUnderTest = { exports: {} }
new Function('require', 'exports', 'module', js)(require, moduleUnderTest.exports, moduleUnderTest)
const { buildWeeklyDigest, nextDigestTask, digestCareMoments } = moduleUnderTest.exports
const event = (id, kind, extra = {}) => ({ id, kind, patientId: 'patient', at: '2026-11-04T10:00:00Z', actorType: 'member', actorId: 'helper', text: id, ...extra })
const careEvents = [
  event('reminder', 'reminder_sent', { alertId: 'dose' }),
  event('symptom', 'parent_replied', { actorType: 'parent', replyCategory: 'felt_unwell', rawText: 'Dizzy' }),
  event('unrelated-consent', 'parent_replied', { actorType: 'parent', replyCategory: 'other', rawText: 'Yes' }),
  event('completed', 'task_completed'), event('thanks', 'thanks_sent', { relatedEventId: 'claimed' }),
  event('claimed', 'claimed'), event('other-patient', 'task_completed', { patientId: 'other' }),
]
const digest = event('digest', 'weekly_digest', { at: '2026-11-09T18:00:00Z', coveredEventIds: careEvents.map(item => item.id) })
const state = {
  activePatientId: 'patient', careEvents,
  patients: [{ id: 'patient', parentChannel: { preferredName: 'Amma' } }],
  tasks: [
    { id: 'assigned', patientId: 'patient', status: 'To do', assigneeId: 'helper', due: '2026-11-09' },
    { id: 'late', patientId: 'patient', status: 'To do', assigneeId: '', due: '2026-11-12' },
    { id: 'early', patientId: 'patient', status: 'To do', assigneeId: '', due: '2026-11-10' },
    { id: 'done', patientId: 'patient', status: 'Completed', assigneeId: '', due: '2026-11-01' },
    { id: 'other', patientId: 'other', status: 'To do', assigneeId: '', due: '2026-11-01' },
  ],
  appointments: [
    { id: 'own', patientId: 'patient', status: 'Upcoming', datetime: '2026-11-12T10:00:00Z' },
    { id: 'other', patientId: 'other', status: 'Upcoming', datetime: '2026-11-12T10:00:00Z' },
  ],
}
const result = buildWeeklyDigest(state, digest)
assert.equal(result.replies, 1, 'Person-level symptoms count as replies while unrelated consent answers do not')
assert.deepEqual(result.quotedReplies, ['Dizzy'])
assert.equal(result.noReplyYet, 1, 'A person-level symptom does not answer a particular dose reminder')
assert.deepEqual(result.noReplyDays, ['Wednesday'], 'A symptom does not hide a day without a dose reply')
assert.deepEqual(result.upcomingAppointments.map(item => item.id), ['own'], 'Other patient appointments are excluded')
assert.equal(result.tasksCompleted, 1, 'Other patient events are excluded')
assert.equal(nextDigestTask(state, 'patient').id, 'early', 'The nearest unassigned open task is suggested')
assert.equal(nextDigestTask({ tasks: [] }, 'patient'), undefined)
assert.deepEqual(new Set(digestCareMoments(state, digest).map(item => item.id)), new Set(['completed', 'thanks', 'claimed']))
console.log('Weekly digest tests passed')
