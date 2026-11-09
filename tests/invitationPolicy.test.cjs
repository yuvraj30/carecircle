// Run with: node tests/invitationPolicy.test.cjs
// Exercise invitation privacy, replacement and acceptance rules without a live server.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/server/invitationPolicy.ts'), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const mod = { exports: {} }
new Function('module', 'exports', js)(mod, mod.exports)
const { membersForRole, hasActiveMemberWithEmail, replacementTokens, revokedInvitations, invitationAcceptError, isCurrentInvitation } = mod.exports

const member = { id: 'member-1', userId: 'user-1', email: 'owner@example.com', status: 'Active' }
const pending = { id: 'invite-secret-old', email: 'helper@example.com', status: 'Invited', inviteToken: 'secret-old' }
const missingTokenField = { id: 'invite-orphan-secret', email: 'other@example.com', status: 'Invited' }
const members = [member, pending, missingTokenField]
assert.equal(membersForRole(members, 'coordinator')[1].inviteToken, 'secret-old')
for (const role of ['caregiver', 'view-only']) {
  const output = membersForRole(members, role)
  assert.equal(output[0].userId, 'user-1')
  assert.equal(Object.hasOwn(output[1], 'inviteToken'), false)
  assert.equal(JSON.stringify(output).includes('secret-old'), false)
  assert.equal(JSON.stringify(output).includes('orphan-secret'), false)
}
assert.equal(hasActiveMemberWithEmail(members, ' OWNER@EXAMPLE.COM '), true)
assert.equal(hasActiveMemberWithEmail(members, 'helper@example.com'), false)
assert.equal(hasActiveMemberWithEmail(members, ''), false)

const now = Date.parse('2026-11-09T10:00:00Z')
const oldInvite = { circleId: 'circle-1', email: 'helper@example.com', status: 'Pending', expiresAt: '2026-11-16T10:00:00Z' }
const tokens = replacementTokens([pending, pending], 'HELPER@example.com')
assert.deepEqual(tokens, ['secret-old'])
const writes = revokedInvitations('circle-1', 'helper@example.com', tokens, [oldInvite], '2026-11-09T10:00:00Z')
assert.equal(writes.length, 1)
assert.equal(writes[0].key, 'invite:secret-old')
assert.equal(writes[0].value.status, 'Cancelled')
assert.equal(invitationAcceptError(writes[0].value, 'helper@example.com', now), 'not_pending')
assert.equal(invitationAcceptError(oldInvite, 'HELPER@example.com', now), null)
assert.equal(invitationAcceptError(oldInvite, 'wrong@example.com', now), 'wrong_recipient')
assert.equal(invitationAcceptError({ ...oldInvite, expiresAt: 'invalid' }, 'helper@example.com', now), 'expired')
assert.equal(revokedInvitations('different-circle', 'helper@example.com', tokens, [oldInvite], 'now').length, 0)
assert.equal(revokedInvitations('circle-1', 'different@example.com', tokens, [oldInvite], 'now').length, 0)

// If concurrent replacements leave an orphaned pending token, only the currently listed token can be accepted.
const currentMembers = [{ ...pending, id: 'invite-secret-new', inviteToken: 'secret-new' }]
assert.equal(isCurrentInvitation(currentMembers, oldInvite, 'secret-old'), false)
assert.equal(isCurrentInvitation(currentMembers, oldInvite, 'secret-new'), true)
assert.equal(isCurrentInvitation([{ ...currentMembers[0], status: 'Cancelled' }], oldInvite, 'secret-new'), false)
console.log('Invitation policy checks passed.')
