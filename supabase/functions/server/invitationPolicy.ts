// These helpers operate on the stored invitation and member records; they do not send invitations.
export function normalizeInviteEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/** Invitation tokens and the token-derived member IDs belong only to coordinators. */
export function membersForRole(members: any[], role: string) {
  if (role === 'coordinator') return members
  return members.map((member, index) => {
    if (!member || typeof member !== 'object') return member
    const { inviteToken: _inviteToken, ...publicMember } = member
    const tokenDerivedId = typeof member.id === 'string' && member.id.startsWith('invite-') && member.status !== 'Active'
    return member.inviteToken || tokenDerivedId ? { ...publicMember, id: `pending-invitation-${index}` } : publicMember
  })
}

export function hasActiveMemberWithEmail(members: any[], email: string) {
  const normalized = normalizeInviteEmail(email)
  return Boolean(normalized && members.some(member => member?.status === 'Active' && normalizeInviteEmail(member.email) === normalized))
}

export function replacementTokens(members: any[], email: string) {
  const normalized = normalizeInviteEmail(email)
  return [...new Set<string>(members
    .filter(member => normalized && normalizeInviteEmail(member?.email) === normalized && typeof member?.inviteToken === 'string' && member.inviteToken)
    .map(member => member.inviteToken as string))]
}

export function revokedInvitations(circleId: string, email: string, tokens: string[], invitations: any[], cancelledAt: string) {
  return tokens.flatMap((token, index) => {
    const invite = invitations[index]
    return invite?.circleId === circleId && invite?.status === 'Pending' && normalizeInviteEmail(invite.email) === normalizeInviteEmail(email)
      ? [{ key: `invite:${token}`, value: { ...invite, status: 'Cancelled', cancelledAt } }]
      : []
  })
}

export function invitationAcceptError(invite: any, email: string | undefined, now: number) {
  if (!invite) return 'not_found'
  if (invite.status !== 'Pending') return 'not_pending'
  const expiry = Date.parse(invite.expiresAt)
  if (!Number.isFinite(expiry) || expiry <= now) return 'expired'
  if (!normalizeInviteEmail(email) || normalizeInviteEmail(invite.email) !== normalizeInviteEmail(email)) return 'wrong_recipient'
  return null
}

/** A superseded token may still exist in the KV store after concurrent writes. */
export function isCurrentInvitation(members: any[], invite: any, token: string) {
  const email = normalizeInviteEmail(invite?.email)
  return Boolean(email && members.some(member => member?.status === 'Invited' && member.inviteToken === token && normalizeInviteEmail(member.email) === email))
}
