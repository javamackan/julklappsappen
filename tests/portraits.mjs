import assert from 'node:assert/strict'
import { Bytes, collection, doc, getDocFromServer, getDocsFromServer, setDoc, writeBatch } from 'firebase/firestore'
import { choosePortrait, maxPortraitBytes, proposePortrait } from '../src/portraitData.ts'

export async function testPortraits({ groupId, otherId, owner, first, second, stranger, unverified }) {
  const denied = { code: 'permission-denied' }
  const img = Bytes.fromUint8Array(new Uint8Array([255, 216, 255, 42, 255, 217]))
  const replacement = Bytes.fromUint8Array(new Uint8Array([255, 216, 255, 84, 255, 217]))
  const pending = (who, group = groupId, uid = first.uid) => doc(who.db, 'groups', group, 'portraitSuggestions', uid)
  const shown = (who, group = groupId, uid = first.uid) => doc(who.db, 'groups', group, 'portraits', uid)
  const propose = (who, image = img, uid = first.uid) => proposePortrait(who.db, groupId, uid, image)
  const suggestion = async () => (await getDocFromServer(pending(first))).data()

  await assert.rejects(propose(second), denied)
  await assert.rejects(propose(first), denied)
  await assert.rejects(propose(owner, img, stranger.uid), denied)
  await assert.rejects(propose(owner, Bytes.fromUint8Array(new Uint8Array(maxPortraitBytes + 1))), denied)
  await propose(owner)
  const older = await suggestion()
  for (const who of [second, stranger, unverified]) await assert.rejects(getDocFromServer(pending(who)), denied)
  await assert.rejects(getDocsFromServer(collection(second.db, 'groups', groupId, 'portraitSuggestions')), denied)
  assert.equal((await getDocFromServer(shown(second))).exists(), false)
  await assert.rejects(choosePortrait(owner.db, groupId, first.uid, older, 'accept'), denied)
  await assert.rejects(setDoc(shown(first), { image: img }), denied)
  const forged = writeBatch(first.db)
  forged.set(shown(first), { image: replacement })
  forged.delete(pending(first))
  await assert.rejects(forged.commit(), denied)

  await propose(owner, replacement)
  await assert.rejects(choosePortrait(first.db, groupId, first.uid, older, 'accept'), /ändrats/)
  await choosePortrait(first.db, groupId, first.uid, await suggestion(), 'accept')
  assert.equal((await getDocFromServer(pending(owner))).exists(), false)
  assert.ok((await getDocFromServer(shown(second))).get('image').isEqual(replacement))
  await assert.rejects(getDocFromServer(shown(stranger)), denied)
  await assert.rejects(getDocsFromServer(collection(unverified.db, 'groups', groupId, 'portraits')), denied)
  assert.equal((await getDocFromServer(shown(stranger, otherId))).exists(), false)
  await propose(owner)
  await choosePortrait(first.db, groupId, first.uid, await suggestion(), 'dismiss')
  assert.ok((await getDocFromServer(shown(owner))).get('image').isEqual(replacement))
  await choosePortrait(first.db, groupId, first.uid, null, 'standard')
  assert.equal((await getDocFromServer(shown(owner))).exists(), false)
  await propose(owner)
  await choosePortrait(first.db, groupId, first.uid, await suggestion(), 'standard')
  assert.equal((await getDocFromServer(pending(owner))).exists(), false)
  console.log('Godkänt: rätt medlem, skyddat förslag, eget godkännande, två gruppers åtskilda porträtt, återgång till standard och inaktuella val.')
}
