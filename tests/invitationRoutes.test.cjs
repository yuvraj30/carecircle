// Run with: node tests/invitationRoutes.test.cjs
// Exercise the real route handlers with in-memory authentication and KV storage.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { randomUUID } = require('node:crypto')

function compile(file) {
  return ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
}
const policyModule = { exports: {} }
new Function('module', 'exports', compile(path.join(__dirname, '../supabase/functions/server/invitationPolicy.ts')))(policyModule, policyModule.exports)
const records = new Map()
const clone = value => value === undefined ? undefined : structuredClone(value)
const kv = {
  get: async key => clone(records.get(key)),
  set: async (key, value) => { records.set(key, clone(value)) },
  mset: async (keys, values) => keys.forEach((key, index) => records.set(key, clone(values[index]))),
  del: async key => { records.delete(key) },
  getByPrefix: async prefix => [...records].filter(([key]) => key.startsWith(prefix)).map(([, value]) => clone(value)),
}
const users = {
  coordinator: { id: 'coordinator', email: 'coordinator@example.com', user_metadata: {} },
  caregiver: { id: 'caregiver', email: 'caregiver@example.com', user_metadata: {} },
  viewer: { id: 'viewer', email: 'viewer@example.com', user_metadata: {} },
  helper: { id: 'helper', email: 'helper@example.com', user_metadata: {} },
}
const handlers = new Map()
class FakeHono {
  use() {}
  get(route, handler) { handlers.set(`GET ${route}`, handler) }
  put(route, handler) { handlers.set(`PUT ${route}`, handler) }
  post(route, handler) { handlers.set(`POST ${route}`, handler) }
  delete(route, handler) { handlers.set(`DELETE ${route}`, handler) }
}
const supabase = { createClient: () => ({ auth: { getUser: async token => ({ data: { user: users[token] }, error: null }) } }) }
const modules = { 'npm:hono': { Hono: FakeHono }, 'npm:hono/cors': { cors: () => () => {} }, 'jsr:@supabase/supabase-js@2.49.8': supabase, './kv_store.tsx': kv, './invitationPolicy.ts': policyModule.exports }
const fakeDeno = { env: { get: () => 'unused' }, serve: () => {} }
new Function('require', 'Deno', 'crypto', 'exports', compile(path.join(__dirname, '../supabase/functions/server/index.tsx')))(id => {
  if (!(id in modules)) throw new Error(`Unexpected module: ${id}`)
  return modules[id]
}, fakeDeno, { randomUUID }, {})

const prefix = '/make-server-e043d7e3'
async function call(method, route, user, params = {}, body = {}) {
  const handler = handlers.get(`${method} ${prefix}${route}`)
  assert.ok(handler, `Route missing: ${method} ${route}`)
  return handler({
    req: { header: name => name === 'Authorization' ? `Bearer ${user}` : '', param: name => params[name], json: async () => body },
    json: (value, status = 200) => ({ status, body: value }),
  })
}

;(async () => {
  const circleId = 'circle-1'
  for (const [id, role] of [['coordinator', 'coordinator'], ['caregiver', 'caregiver'], ['viewer', 'view-only']]) {
    records.set(`membership:${id}:${circleId}`, { userId: id, circleId, role, status: 'Active' })
  }
  const oldToken = 'secret-old-token'
  records.set(`invite:${oldToken}`, { token: oldToken, circleId, email: 'helper@example.com', status: 'Pending', expiresAt: '2099-01-01T00:00:00Z' })
  records.set(`circle:${circleId}:members`, [
    { id: 'coordinator', userId: 'coordinator', name: 'Priya', email: 'coordinator@example.com', status: 'Active', role: 'coordinator' },
    { id: `invite-${oldToken}`, inviteToken: oldToken, email: 'helper@example.com', status: 'Invited' },
  ])
  records.set(`circle:${circleId}:meta`, { id: circleId, name: 'Our family circle' })
  const coordinator = await call('GET', '/circles/:circleId/snapshot', 'coordinator', { circleId })
  assert.equal(coordinator.body.members[1].inviteToken, oldToken)
  for (const user of ['caregiver', 'viewer']) {
    const response = await call('GET', '/circles/:circleId/snapshot', user, { circleId })
    assert.equal(response.status, 200)
    assert.equal(JSON.stringify(response.body.members).includes(oldToken), false)
  }
  const duplicate = await call('POST', '/circles/:circleId/invites', 'coordinator', { circleId }, { email: 'COORDINATOR@example.com' })
  assert.equal(duplicate.status, 409)
  const replacement = await call('POST', '/circles/:circleId/invites', 'coordinator', { circleId }, { email: 'HELPER@example.com', name: 'Helper' })
  assert.equal(replacement.status, 201)
  assert.equal(records.get(`invite:${oldToken}`).status, 'Cancelled')
  const oldAccept = await call('POST', '/invites/:token/accept', 'helper', { token: oldToken })
  assert.equal(oldAccept.status, 409)
  const newToken = replacement.body.shareablePath.slice('/invite/'.length)
  const anonymous = await call('GET', '/invites/:token', 'anonymous', { token: newToken })
  assert.deepEqual(anonymous.body, { state: 'sign-in' })
  const wrongAccount = await call('GET', '/invites/:token', 'viewer', { token: newToken })
  assert.deepEqual(wrongAccount.body, { state: 'wrong-account' })
  const intendedRecipient = await call('GET', '/invites/:token', 'helper', { token: newToken })
  assert.deepEqual(intendedRecipient.body, { state: 'verified', circleName: 'Our family circle', inviterName: 'Priya', activeMemberCount: 1, role: 'caregiver' })
  assert.equal(JSON.stringify(intendedRecipient.body).includes('helper@example.com'), false)
  const replaced = await call('GET', '/invites/:token', 'helper', { token: oldToken })
  assert.deepEqual(replaced.body, { state: 'unavailable' })
  const storedInvite = records.get(`invite:${newToken}`)
  records.set(`invite:${newToken}`, { ...storedInvite, expiresAt: '2000-01-01T00:00:00Z' })
  assert.deepEqual((await call('GET', '/invites/:token', 'helper', { token: newToken })).body, { state: 'expired' })
  records.set(`invite:${newToken}`, storedInvite)
  const newAccept = await call('POST', '/invites/:token/accept', 'helper', { token: newToken })
  assert.equal(newAccept.status, 200)
  assert.deepEqual((await call('GET', '/invites/:token', 'helper', { token: newToken })).body, { state: 'unavailable' })
  assert.equal(records.get(`membership:helper:${circleId}`).status, 'Active')
  const duplicateAfterAccept = await call('POST', '/circles/:circleId/invites', 'coordinator', { circleId }, { email: 'helper@example.com' })
  assert.equal(duplicateAfterAccept.status, 409)
  console.log('Invitation route checks passed.')
})().catch(error => { console.error(error); process.exitCode = 1 })
