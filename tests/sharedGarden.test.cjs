const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/lib/sharedGarden.ts'), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const mod = { exports: {} }
new Function('require', 'exports', 'module', js)(require, mod.exports, mod)
const { sharedGarden } = mod.exports
const now = new Date('2026-11-09T12:00:00Z')
const event = (kind, at, patientId = 'p1', actorType = 'member') => ({ id: kind, kind, at, patientId, actorType, actorId: 'helper' })
const result = sharedGarden([
  event('task_completed', '2026-11-08T12:00:00Z'),
  event('refill_done', '2026-11-10T12:00:00Z'),
  event('task_accepted', '2026-10-30T12:00:00Z'),
  event('family_confirmed', '2026-11-08T11:00:00Z', 'p2'),
  event('not_taken_recorded', '2026-11-08T11:00:00Z', 'p1', 'system'),
], 'p1', now)
assert.equal(result.hasCompletion, true)
assert.equal(result.hasRefill, false, 'Future events must not be counted')
assert.equal(result.hasHandoff, false, 'Old events must not be counted')
assert.equal(result.hasCheckIn, false, 'Another person or system event must not count as the circle action')
assert.equal(result.latest.kind, 'task_completed')
assert.equal(sharedGarden([], 'p1', now).latest, undefined)
console.log('Shared garden tests passed')
