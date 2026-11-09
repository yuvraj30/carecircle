// Run with: node tests/personReplies.test.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(relative, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('require', 'exports', 'module', js)(id => imports[id] ?? require(id), module.exports, module)
  return module.exports
}
const clock = load('src/lib/time.ts')
const events = load('src/lib/careEvents.ts', { './time': clock })
const replies = load('src/lib/personReplies.ts', { './careEvents': events })
const classifier = load('src/constants/replyClassifier.ts')

for (const text of ['Dizzy', 'Not feeling well', 'Taken but dizzy', 'not taken, pain']) {
  const category = classifier.classifyParentReply(text)
  assert.equal(category, 'felt_unwell', `${text} must stay a person-level concern`)
  assert.equal(replies.replyAlertId(category, 'unrelated-dose', false), undefined)
}
assert.equal(replies.replyAlertId(classifier.classifyParentReply('Taken'), 'dose', false), 'dose')
assert.equal(replies.replyAlertId(classifier.classifyParentReply('Not taken'), 'dose', false), 'dose')
assert.equal(replies.replyAlertId('other', 'dose', true), undefined, 'Sharing consent replies do not refer to a dose')

const patient = { id: 'patient', parentChannel: { preferredName: 'Amma', sharing: { sharedWith: ['permitted'] } } }
const symptom = { id: 'reply', kind: 'parent_replied', patientId: 'patient', replyCategory: 'felt_unwell', rawText: 'Dizzy', text: 'Amma wrote: "Dizzy"', at: '2026-11-09T10:00:00Z' }
const wrongPatient = { ...symptom, id: 'other', patientId: 'other' }
const olderDoseReply = { ...symptom, id: 'historic', alertId: 'old-dose' }
assert.deepEqual(replies.visiblePersonSymptoms([symptom, wrongPatient, olderDoseReply], patient, 'permitted').map(event => event.id), ['reply'])
assert.deepEqual(replies.visiblePersonSymptoms([symptom], patient, 'not-permitted'), [], 'Never show a symptom without sharing consent')
assert.deepEqual(replies.visiblePersonSymptoms([symptom], { ...patient, parentChannel: { ...patient.parentChannel, sharing: { sharedWith: [] } } }, 'permitted'), [], 'Withdrawal hides the reply')
const reading = { kind: 'reply_interpreted', text: 'Rule-based interpretation proposed: felt unwell.' }
assert.equal(events.eventTextForMember(reading, patient, 'not-permitted'), 'Waiting for Amma to agree to share with you', 'Interpretation must not reveal a hidden reply')
assert.equal(events.eventTextForMember(reading, patient, 'permitted'), reading.text)
console.log('Person-level reply tests passed')
