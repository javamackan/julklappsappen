import {
  arrayUnion, collection, doc, FieldPath, getDocFromServer, onSnapshot, query,
  runTransaction, Timestamp, where, writeBatch, type Firestore, type FirestoreError,
} from 'firebase/firestore'

export type FamilyGroup = {
  id: string
  name: string
  ownerUid: string
  capacity: number
  memberUids: string[]
  members: Record<string, { name: string; slot: string }>
}
export type Seat = { slot: string; email: string; token: string; expiresAt: Timestamp; claimedBy: string }
export type InviteLink = { groupId: string; token: string }
export type Invitation = { groupName: string; slot: string }

export function readInviteLink(): InviteLink | null {
  const match = /^\/bjud-in\/([a-zA-Z0-9_-]+)\/?$/.exec(window.location.pathname)
  const token = window.location.hash.slice(1)
  return match && /^[a-f0-9]{48}$/.test(token) ? { groupId: match[1], token } : null
}

export function inviteUrl(groupId: string, token: string) {
  return new URL('/bjud-in/' + encodeURIComponent(groupId) + '#' + token, window.location.origin).href
}

export function watchGroups(db: Firestore, uid: string, next: (groups: FamilyGroup[]) => void, error: (e: FirestoreError) => void) {
  const mine = query(collection(db, 'groups'), where('memberUids', 'array-contains', uid))
  return onSnapshot(mine, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.hasPendingWrites) return
    next(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as FamilyGroup)).sort((a, b) => a.name.localeCompare(b.name, 'sv')))
  }, error)
}

export function watchSeats(db: Firestore, groupId: string, next: (seats: Seat[]) => void, error: (e: FirestoreError) => void) {
  return onSnapshot(collection(db, 'groups', groupId, 'seats'), snapshot => {
    next(snapshot.docs.map(d => ({ ...d.data(), slot: d.id } as Seat)))
  }, error)
}

const week = 7 * 24 * 60 * 60 * 1000
export class InviteProblem extends Error {}

export async function offerSeat(db: Firestore, group: FamilyGroup, address: string, ownerAddress: string) {
  const email = address.trim().toLowerCase()
  if (email === ownerAddress.toLowerCase()) throw new InviteProblem('Du är redan med i gruppen.')
  const base = doc(db, 'groups', group.id)
  const refs = Array.from({ length: group.capacity - 1 }, (_, i) => doc(base, 'seats', String(i + 1)))
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('')
  return runTransaction(db, async transaction => {
    const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)))
    const now = Date.now()
    const matching = snapshots.find(s => s.data()?.email === email)
    if (matching?.get('claimedBy')) throw new InviteProblem('Personen är redan med i gruppen.')
    if (matching && matching.get('expiresAt').toMillis() > now) return false
    const seat = matching ?? snapshots.find(s => !s.exists())
      ?? snapshots.find(s => !s.get('claimedBy') && s.get('expiresAt').toMillis() <= now)
    if (!seat) throw new InviteProblem('Alla platser har en medlem eller en giltig inbjudan.')
    if (seat.exists()) transaction.delete(doc(base, 'invitations', seat.get('token')))
    transaction.set(seat.ref, { email, token, expiresAt: Timestamp.fromMillis(now + week), claimedBy: '' })
    transaction.set(doc(base, 'invitations', token), { slot: seat.id, groupName: group.name })
    return true
  })
}

export function revokeSeat(db: Firestore, groupId: string, seat: Seat) {
  const base = doc(db, 'groups', groupId)
  const ref = doc(base, 'seats', seat.slot)
  return runTransaction(db, async transaction => {
    const current = await transaction.get(ref)
    if (!current.exists() || current.get('token') !== seat.token) return
    if (current.get('claimedBy')) throw new InviteProblem('Personen har redan gått med.')
    transaction.delete(ref)
    transaction.delete(doc(base, 'invitations', seat.token))
  })
}

export async function readInvitation(db: Firestore, link: InviteLink): Promise<Invitation> {
  const snapshot = await getDocFromServer(doc(db, 'groups', link.groupId, 'invitations', link.token))
  if (!snapshot.exists()) throw new InviteProblem('Inbjudan är inte längre tillgänglig.')
  return snapshot.data() as Invitation
}

export async function acceptInvitation(db: Firestore, link: InviteLink, invitation: Invitation, uid: string, displayName: string) {
  const name = displayName.trim()
  if (!name || name.length > 50) throw new InviteProblem('Skriv ett namn med högst 50 tecken.')
  const group = doc(db, 'groups', link.groupId)
  const batch = writeBatch(db)
  batch.update(group, 'memberUids', arrayUnion(uid), new FieldPath('members', uid), { name, slot: invitation.slot })
  batch.update(doc(group, 'seats', invitation.slot), { claimedBy: uid })
  batch.delete(doc(group, 'invitations', link.token))
  await batch.commit()
}
