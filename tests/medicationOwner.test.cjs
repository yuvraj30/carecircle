// Run with: node tests/medicationOwner.test.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../src/lib/medicationOwner.ts'), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const moduleUnderTest = { exports: {} }
new Function('require', 'exports', 'module', js)(require, moduleUnderTest.exports, moduleUnderTest)
const { medicationOwner } = moduleUnderTest.exports

const members = [
  { id: 'caregiver-record', userId: 'vikram', name: 'Vikram' },
  { id: 'priya', name: 'Priya' },
]
const patient = { primaryCaregiverId: 'vikram' }
const assigned = { assignedTo: 'priya' }
assert.equal(medicationOwner(assigned, patient, members).name, 'Priya')
assert.equal(medicationOwner({ ...assigned, confirmedBy: 'parent-lakshmi' }, patient, members).name, 'Priya', 'A parent reply must not replace the assigned caregiver')
assert.equal(medicationOwner({ ...assigned, confirmedBy: 'vikram' }, patient, members).name, 'Priya', 'A different confirmer must not replace the assigned caregiver')
assert.equal(medicationOwner({ confirmedBy: 'parent-lakshmi' }, patient, members).name, 'Vikram', 'The primary caregiver remains visible when no follow-up owner is assigned')
assert.equal(medicationOwner(undefined, undefined, members), undefined, 'Unknown responsibility remains unassigned')
console.log('Medication owner tests passed')
