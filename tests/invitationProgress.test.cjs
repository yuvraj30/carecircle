// Run with: node tests/invitationProgress.test.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

global.window = { location: { origin: 'https://carecircle.example' } }
const source = fs.readFileSync(path.join(__dirname, '../src/components/InvitationProgress.tsx'), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
const mod = { exports: {} }
new Function('require', 'exports', 'module', js)(id => id.endsWith('.css') ? {} : require(id), mod.exports, mod)
const { InvitationProgress } = mod.exports
const member = { id: 'invite-private-token', name: 'A helper', email: 'helper@example.com', status: 'Invited', inviteToken: 'private-token', expiresAt: '2999-01-01T00:00:00.000Z' }
const render = options => renderToStaticMarkup(React.createElement(InvitationProgress, { member, canManage: true, sample: false, busy: false, onRenew() {}, onCancel() {}, onRefresh() {}, ...options }))

const coordinator = render({})
assert.match(coordinator, /Copy invitation link/)
assert.match(coordinator, /Copy visit-prep invitation/)
assert.match(coordinator, /Open WhatsApp/)
assert.match(coordinator, /only after signing in and accepting/)
assert.doesNotMatch(coordinator, /Invitation sent/)
const caregiver = render({ canManage: false })
assert.doesNotMatch(caregiver, /private-token|Copy invitation link|Open WhatsApp/)
assert.doesNotMatch(caregiver, /Copy visit-prep invitation/)
assert.match(caregiver, /Check status/)
const sample = render({ sample: true })
assert.doesNotMatch(sample, /private-token|Open WhatsApp/)
assert.match(sample, /example invitation/)
const expired = render({ member: { ...member, expiresAt: '2000-01-01T00:00:00.000Z' } })
assert.match(expired, /Invitation expired/)
assert.match(expired, /Create a new link/)
assert.doesNotMatch(expired, /private-token|Open WhatsApp/)
const invalidExpiry = render({ member: { ...member, expiresAt: 'not-a-date' } })
assert.match(invalidExpiry, /Link status unavailable/)
assert.match(invalidExpiry, /Create a new link/)
assert.doesNotMatch(invalidExpiry, /private-token|Open WhatsApp/)
const missingToken = render({ member: { ...member, inviteToken: undefined } })
assert.match(missingToken, /Link status unavailable/)
assert.match(missingToken, /Create a new link/)
console.log('Invitation progress privacy and status checks passed.')
