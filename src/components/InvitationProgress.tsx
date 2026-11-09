import { useState } from 'react'
import type { CircleMember } from '../types'
import './invitation-progress.css'

/** An invitation becomes a connection only when the recipient accepts it. */
export function InvitationProgress({ member, canManage, sample, busy, onRenew, onCancel, onRefresh }: {
  member: CircleMember
  canManage: boolean
  sample: boolean
  busy: boolean
  onRenew: () => void
  onCancel: () => void
  onRefresh: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const expiry = member.expiresAt ? Date.parse(member.expiresAt) : NaN
  const expiryUnknown = Boolean(member.inviteToken) && !Number.isFinite(expiry)
  const linkMissing = !sample && canManage && member.status === 'Invited' && !member.inviteToken
  const expired = Number.isFinite(expiry) && expiry <= Date.now()
  const pending = member.status === 'Invited' && !expired && !expiryUnknown && !linkMissing
  const link = !sample && canManage && pending && member.inviteToken
    ? `${window.location.origin}/invite/${encodeURIComponent(member.inviteToken)}` : ''
  const whatsappUrl = link ? `https://wa.me/?text=${encodeURIComponent(`Hello ${member.name}, please join our care circle: ${link}`)}` : ''

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setCopyFailed(false)
    } catch {
      setCopyFailed(true)
    }
  }

  return <div className="cc-invite-progress">
    <div className="cc-invite-progress-label">{member.status === 'Cancelled' ? 'Invitation cancelled' : member.status === 'Declined' ? 'Invitation declined' : expired ? 'Invitation expired' : expiryUnknown || linkMissing ? 'Link status unavailable' : 'Waiting for acceptance'}</div>
    <p>{sample ? 'This is an example invitation; nothing is sent.' : expired || expiryUnknown || linkMissing ? 'Create a new link if they would still like to join.' : pending ? 'Share the invitation link. They join only after signing in and accepting.' : 'A coordinator can create another invitation if needed.'}</p>
    {!sample && <div className="cc-invite-progress-actions">
      <button type="button" disabled={busy} onClick={onRefresh}>Check status</button>
      {canManage && <>
      {link && <><button type="button" onClick={copyLink}>{copied ? 'Link copied' : 'Copy invitation link'}</button><a href={whatsappUrl} target="_blank" rel="noreferrer">Open WhatsApp ↗</a></>}
      {pending && <button type="button" onClick={onCancel}>Cancel invitation</button>}
      {!pending && <button type="button" onClick={onRenew}>Create a new link</button>}
      </>}
    </div>}
    {copied && <p className="cc-invite-progress-note" role="status">Link copied. Share it privately with the intended person; no message has been sent.</p>}
    {copyFailed && link && <div className="cc-invite-copy-fallback"><label>Copy this private invitation link<input readOnly value={link} onFocus={event => event.currentTarget.select()} /></label></div>}
  </div>
}
