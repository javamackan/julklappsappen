import {
  collection, doc, getDocFromServer, onSnapshot, or, query, runTransaction, serverTimestamp, setDoc, updateDoc,
  where, type DocumentReference, type Firestore, type FirestoreError,
  type Query, type Timestamp,
} from 'firebase/firestore'

export type GiftKind = 'wishes' | 'ideas'
export type GiftFields = { title: string; details: string; url: string; priceOre: number | null }
export type Gift = GiftFields & {
  id: string; author: string; homeGroup: string; secondaryGroup: string; removed: boolean; createdAt: Timestamp
}
export type GiftAddress = { recipient: string; kind: GiftKind; id: string }
export type BagEntry = GiftAddress & GiftFields & { groupId: string; token: string; bought: boolean }
type Failure = (error: FirestoreError) => void

export const emptyGift: GiftFields = { title: '', details: '', url: '', priceOre: null }
export class GiftProblem extends Error {}

function itemRef(db: Firestore, a: GiftAddress) {
  return doc(db, 'lists', a.recipient, a.kind, a.id)
}
function claimRef(db: Firestore, groupId: string, a: GiftAddress) {
  return doc(db, 'groups', groupId, 'giftLists', a.recipient, a.kind, a.id)
}
function bagRef(db: Firestore, uid: string, a: GiftAddress) {
  return doc(db, 'sacks', uid, 'items', [a.recipient, a.kind, a.id].join('~'))
}

// Visa först serverbekräftade värden, även när två personer delar webbläsare.
function watchRows<T>(q: Query, read: (id: string, data: object) => T, next: (rows: T[]) => void, fail: Failure) {
  return onSnapshot(q, { includeMetadataChanges: true }, s => {
    if (!s.metadata.fromCache && !s.metadata.hasPendingWrites) next(s.docs.map(d => read(d.id, d.data())))
  }, fail)
}
function watchValue<T>(ref: DocumentReference, next: (v: T | null) => void, fail: Failure) {
  return onSnapshot(ref, { includeMetadataChanges: true }, s => {
    if (!s.metadata.fromCache && !s.metadata.hasPendingWrites) next(s.exists() ? s.data() as T : null)
  }, fail)
}

export function watchList(db: Firestore, groupId: string, recipient: string, kind: GiftKind, next: (rows: Gift[]) => void, fail: Failure) {
  const items = query(collection(db, 'lists', recipient, kind), or(where('homeGroup', '==', groupId), where('secondaryGroup', '==', groupId)))
  return watchRows(items, (id, data) => ({ ...data, id } as Gift), rows => {
    next(rows.filter(row => !row.removed).sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis() || a.id.localeCompare(b.id)))
  }, fail)
}
export function watchItem(db: Firestore, a: GiftAddress, next: (item: Gift | null) => void, fail: Failure) {
  return watchValue<Omit<Gift, 'id'>>(itemRef(db, a), v => next(v ? { ...v, id: a.id } : null), fail)
}
export function watchHold(db: Firestore, a: GiftAddress, next: (hold: { token: string } | null) => void, fail: Failure) {
  return watchValue(doc(itemRef(db, a), 'reservation', 'state'), next, fail)
}
export function watchGroupClaim(db: Firestore, groupId: string, a: GiftAddress, next: (v: { token: string; giver: string } | null) => void, fail: Failure) {
  return watchValue(claimRef(db, groupId, a), next, fail)
}
export function watchBag(db: Firestore, uid: string, groupId: string, next: (entries: BagEntry[]) => void, fail: Failure) {
  return watchRows(query(collection(db, 'sacks', uid, 'items'), where('groupId', '==', groupId)), (_, data) => data as BagEntry,
    entries => next(entries.sort((a, b) => Number(a.bought) - Number(b.bought) || a.title.localeCompare(b.title, 'sv'))), fail)
}

export function giftFields(title: string, details: string, rawUrl: string, rawPrice: string): GiftFields {
  const name = title.trim()
  if (!name || name.length > 120) throw new GiftProblem('Skriv vad klappen är, med högst 120 tecken.')
  if (details.trim().length > 800) throw new GiftProblem('Detaljerna får vara högst 800 tecken.')
  let url = rawUrl.trim()
  if (url) {
    try {
      const parsed = new URL(url)
      if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.href.length > 2048) throw new Error()
      url = parsed.href
    } catch { throw new GiftProblem('Ange en webblänk som börjar med https:// eller http://.') }
  }
  const price = rawPrice.trim().replace(/\s/g, '').replace(',', '.')
  if (price && !/^\d{1,8}([.]\d{1,2})?$/.test(price)) throw new GiftProblem('Skriv priset i kronor, till exempel 249 eller 99,50.')
  return { title: name, details: details.trim(), url, priceOre: price ? Math.round(Number(price) * 100) : null }
}

export async function createGift(db: Firestore, groupId: string, recipient: string, kind: GiftKind, uid: string, fields: GiftFields) {
  const ref = doc(collection(db, 'lists', recipient, kind))
  await setDoc(ref, { ...fields, homeGroup: groupId, secondaryGroup: '', author: uid, createdAt: serverTimestamp(), removed: false })
  return ref.id
}
export function editGift(db: Firestore, a: GiftAddress, fields: GiftFields) {
  return updateDoc(itemRef(db, a), fields)
}
export function removeGift(db: Firestore, a: GiftAddress) {
  // Behåll bara identitet och behörighetsunderlag så att givaren kan släppa en äldre paxning.
  return updateDoc(itemRef(db, a), { ...emptyGift, removed: true })
}

export async function reserveGift(db: Firestore, groupId: string, uid: string, a: GiftAddress) {
  const item = itemRef(db, a)
  const state = doc(item, 'reservation', 'state')
  const token = crypto.randomUUID()
  try {
    await runTransaction(db, async transaction => {
      const [wish, reserved] = await Promise.all([transaction.get(item), transaction.get(state)])
      if (!wish.exists() || wish.get('removed')) throw new GiftProblem('Klappen har tagits bort.')
      if (reserved.exists()) throw new GiftProblem('Klappen är redan paxad.')
      const { title, details, url, priceOre } = wish.data() as Gift
      transaction.set(state, { token })
      transaction.set(claimRef(db, groupId, a), { giver: uid, token })
      transaction.set(bagRef(db, uid, a), { ...a, groupId, token, title, details, url, priceOre, bought: false })
    })
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === 'permission-denied' || code === 'aborted') {
      // Vid en samtidig paxning kan reglerna neka skrivningen före nästa transaktionsförsök.
      const occupied = await getDocFromServer(state).catch(() => null)
      if (occupied?.exists()) throw new GiftProblem('Klappen är redan paxad.')
    }
    throw error
  }
}

export function setPurchased(db: Firestore, uid: string, entry: BagEntry, bought: boolean) {
  return runTransaction(db, async transaction => {
    const ref = bagRef(db, uid, entry)
    const current = await transaction.get(ref)
    if (!current.exists() || current.get('token') !== entry.token) throw new GiftProblem('Paxningen har ändrats. Öppna tomtesäcken igen.')
    transaction.update(ref, { bought })
  })
}
export function releaseGift(db: Firestore, uid: string, entry: BagEntry) {
  const ref = bagRef(db, uid, entry)
  return runTransaction(db, async transaction => {
    const current = await transaction.get(ref)
    if (!current.exists()) return
    if (current.get('token') !== entry.token) throw new GiftProblem('Paxningen har ändrats. Öppna tomtesäcken igen.')
    transaction.delete(doc(itemRef(db, entry), 'reservation', 'state'))
    transaction.delete(claimRef(db, entry.groupId, entry))
    transaction.delete(ref)
  })
}
