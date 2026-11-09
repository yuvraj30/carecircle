// Run with: node tests/productMeasurement.test.cjs
// Exercise consent and privacy boundaries without a browser or network.
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
global.window = { dispatchEvent: () => true }
const source = fs.readFileSync(path.join(__dirname, '../src/lib/productMeasurement.ts'), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const moduleUnderTest = { exports: {} }
new Function('module', 'exports', js)(moduleUnderTest, moduleUnderTest.exports)
const { readProductMeasurement, setProductMeasurement, recordProductEvent } = moduleUnderTest.exports

// No event is recorded or data created without explicit opt-in.
recordProductEvent('user-a', false, 'nudge_shown')
assert.equal(values.size, 0)
assert.equal(readProductMeasurement('user-a', false), null)

assert.equal(setProductMeasurement('user-a', false, true), true)
recordProductEvent('user-a', false, 'nudge_shown')
recordProductEvent('user-a', true, 'nudge_shown') // Sample must never be included.
recordProductEvent('user-b', false, 'nudge_shown') // Consent is per account.
recordProductEvent('user-a', false, 'patient_name') // A dynamic or unknown payload is rejected.
assert.equal(readProductMeasurement('user-a', false).nudge_shown, 1)
assert.equal(readProductMeasurement('user-b', false), null)
assert.equal(readProductMeasurement('user-a', true), null)
assert.equal([...values.values()].some(value => value.includes('patient_name')), false)

assert.equal(setProductMeasurement('user-a', false, false), true)
assert.equal(values.size, 0)
recordProductEvent('user-a', false, 'nudge_shown')
assert.equal(values.size, 0)

// Blocked storage must fail closed and not interrupt the user's care actions.
global.localStorage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') } }
assert.equal(setProductMeasurement('user-a', false, true), false)
assert.equal(readProductMeasurement('user-a', false), null)
assert.doesNotThrow(() => recordProductEvent('user-a', false, 'tour_finished'))
console.log('Product measurement privacy checks passed.')
