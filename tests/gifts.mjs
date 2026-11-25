import assert from 'node:assert/strict'
import {
  collection, doc, getDocFromServer, getDocsFromServer, or, query, setDoc, updateDoc, where,
} from 'firebase/firestore'
import { createGift, editGift, giftFields, releaseGift, removeGift, reserveGift, setPurchased } from '../src/giftData.ts'
import { acceptInvitation, offerSeat, readInvitation } from '../src/groupData.ts'

export async function testGifts({ groupId, otherId, owner, first, second, stranger, unverified }) {
  const denied = { code: 'permission-denied' }
  const item = (db, a) => doc(db, 'lists', a.recipient, a.kind, a.id)
  const state = (db, a) => doc(item(db, a), 'reservation', 'state')
  const claim = (db, group, a) => doc(db, 'groups', group, 'giftLists', a.recipient, a.kind, a.id)
  const bag = (db, user, a) => doc(db, 'sacks', user.uid, 'items', [a.recipient, a.kind, a.id].join('~'))
  const list = (db, group, kind) => getDocsFromServer(query(collection(db, 'lists', owner.uid, kind),
    or(where('homeGroup', '==', group), where('secondaryGroup', '==', group))))
  const fields = giftFields('Vinylskiva', 'Gärna blå', 'https://example.org/skiva', '199,50')
  assert.equal(fields.priceOre, 19950)
  assert.equal(giftFields('Bok', '', '', '').priceOre, null)
  assert.throws(() => giftFields('  ', '', '', ''))
  assert.throws(() => giftFields('Bok', '', 'javascript:alert(1)', ''))
  const a = { recipient: owner.uid, kind: 'wishes', id: await createGift(owner.db, groupId, owner.uid, 'wishes', owner.uid, fields) }
  assert.deepEqual((await list(owner.db, groupId, 'wishes')).docs.map(d => d.id), [a.id])
  assert.equal((await list(second.db, groupId, 'wishes')).size, 1)
  await assert.rejects(list(stranger.db, groupId, 'wishes'), denied)
  await assert.rejects(list(unverified.db, groupId, 'wishes'), denied)
  await assert.rejects(editGift(first.db, a, { ...fields, title: 'Annat' }), denied)
  await assert.rejects(reserveGift(owner.db, groupId, owner.uid, a), denied)
  const before = (await getDocFromServer(item(owner.db, a))).data()
  const results = await Promise.allSettled([first, second].map(p => reserveGift(p.db, groupId, p.uid, a)))
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1, JSON.stringify(results))
  assert.match(results.find(r => r.status === 'rejected').reason.message, /redan paxad/)
  const winner = results[0].status === 'fulfilled' ? first : second
  const other = winner === first ? second : first
  const entry = (await getDocFromServer(bag(winner.db, winner, a))).data()
  assert.equal(entry.bought, false)
  assert.equal((await getDocFromServer(claim(other.db, groupId, a))).get('giver'), winner.uid)
  assert.deepEqual(Object.keys((await getDocFromServer(state(other.db, a))).data()), ['token'])
  for (const hidden of [state(owner.db, a), claim(owner.db, groupId, a), bag(owner.db, winner, a), bag(other.db, winner, a)]) {
    await assert.rejects(getDocFromServer(hidden), denied)
  }
  await assert.rejects(setDoc(bag(other.db, other, a), { ...entry, bought: true }), denied)
  await setPurchased(winner.db, winner.uid, entry, true)
  assert.equal((await getDocFromServer(bag(winner.db, winner, a))).get('bought'), true)
  assert.deepEqual((await getDocFromServer(item(owner.db, a))).data(), before)
  await setPurchased(winner.db, winner.uid, entry, false)
  await editGift(owner.db, a, { ...fields, title: 'Ny utgåva' })
  await releaseGift(winner.db, winner.uid, entry)
  assert.equal((await getDocFromServer(state(other.db, a))).exists(), false)
  await reserveGift(winner.db, groupId, winner.uid, a)
  await assert.rejects(releaseGift(winner.db, winner.uid, entry), /ändrats/)
  await assert.rejects(setPurchased(winner.db, winner.uid, entry, true), /ändrats/)
  await releaseGift(winner.db, winner.uid, (await getDocFromServer(bag(winner.db, winner, a))).data())
  await reserveGift(other.db, groupId, other.uid, a)
  const current = (await getDocFromServer(bag(other.db, other, a))).data()
  assert.equal(current.title, 'Ny utgåva')
  await removeGift(owner.db, a)
  const removed = (await getDocFromServer(item(owner.db, a))).data()
  assert.equal(removed.removed, true)
  assert.equal(removed.title, '')
  await assert.rejects(editGift(owner.db, a, fields), denied)
  await setPurchased(other.db, other.uid, current, true)
  await releaseGift(other.db, other.uid, current)
  await assert.rejects(reserveGift(first.db, groupId, first.uid, a), /tagits bort/)
  console.log('Godkänt: egen lista, samtidig paxning, egen tomtesäck, diskret borttagning och privata köpmarkeringar.')

  const idea = { recipient: owner.uid, kind: 'ideas', id: await createGift(first.db, groupId, owner.uid, 'ideas', first.uid, fields) }
  assert.equal((await list(second.db, groupId, 'ideas')).size, 1)
  await assert.rejects(list(owner.db, groupId, 'ideas'), denied)
  await assert.rejects(getDocFromServer(item(owner.db, idea)), denied)
  await assert.rejects(getDocFromServer(item(stranger.db, idea)), denied)
  await assert.rejects(createGift(owner.db, groupId, owner.uid, 'ideas', owner.uid, fields), denied)
  await assert.rejects(removeGift(second.db, idea), denied)
  await editGift(first.db, idea, { ...fields, details: 'Hemligt' })
  await reserveGift(second.db, groupId, second.uid, idea)
  const surprise = (await getDocFromServer(bag(second.db, second, idea))).data()
  await removeGift(first.db, idea)
  await releaseGift(second.db, second.uid, surprise)

  const otherGroup = { ...(await getDocFromServer(doc(stranger.db, 'groups', otherId))).data(), id: otherId }
  await offerSeat(stranger.db, otherGroup, owner.email, stranger.email)
  const seat = (await getDocsFromServer(collection(stranger.db, 'groups', otherId, 'seats'))).docs.find(d => d.get('email') === owner.email)
  const link = { groupId: otherId, token: seat.get('token') }
  await acceptInvitation(owner.db, link, await readInvitation(owner.db, link), owner.uid, 'Alex')
  const shared = { recipient: owner.uid, kind: 'wishes', id: await createGift(owner.db, groupId, owner.uid, 'wishes', owner.uid, fields) }
  await assert.rejects(getDocFromServer(item(stranger.db, shared)), denied)
  await updateDoc(item(owner.db, shared), { secondaryGroup: otherId })
  assert.equal((await list(stranger.db, otherId, 'wishes')).size, 1)
  await reserveGift(first.db, groupId, first.uid, shared)
  assert.ok((await getDocFromServer(state(stranger.db, shared))).exists())
  assert.equal((await getDocFromServer(claim(stranger.db, otherId, shared))).exists(), false)
  await assert.rejects(getDocFromServer(claim(stranger.db, groupId, shared)), denied)
  await assert.rejects(reserveGift(stranger.db, otherId, stranger.uid, shared), /redan paxad/)
  await releaseGift(first.db, first.uid, (await getDocFromServer(bag(first.db, first, shared))).data())
  await reserveGift(stranger.db, otherId, stranger.uid, shared)
  assert.equal((await getDocFromServer(claim(first.db, groupId, shared))).exists(), false)
  console.log('Godkänt: hemliga idéer och en gemensam paxning för två grupper med skyddad givaridentitet.')
}
