import assert from 'node:assert/strict'
import { testGifts } from './gifts.mjs'
import { testPortraits } from './portraits.mjs'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer, getDocsFromServer, collection, query, where, terminate } from 'firebase/firestore'
import { acceptInvitation, offerSeat, readInvitation, revokeSeat } from '../src/groupData.ts'

const project = 'demo-julklappsappen'
const dbUrl = 'http://127.0.0.1:8080/v1/projects/' + project + '/databases/(default)/documents/'
const authUrl = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/' + project + '/accounts'
const password = 'lokalt-testlosen'
const clients = []
const runId = crypto.randomUUID().slice(0, 8)
const groupId = 'pilot-' + runId

async function request(url, method, body) {
  const result = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify(body),
  })
  assert.ok(result.ok, 'Emulatorn svarade ' + result.status + ' ' + await result.text())
}

async function client(label, verified = true) {
  const email = label + '-' + runId + '@example.org'
  await request(authUrl, 'POST', { email, password, emailVerified: verified })
  const app = initializeApp({ projectId: project, apiKey: 'fake-api-key' }, label + runId)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  clients.push({ app, db })
  const { user } = await signInWithEmailAndPassword(auth, email, password)
  return { db, uid: user.uid, email }
}

function groupFields(name, capacity, owner) {
  return { fields: {
    name: { stringValue: name }, capacity: { integerValue: String(capacity) }, ownerUid: { stringValue: owner.uid },
    memberUids: { arrayValue: { values: [{ stringValue: owner.uid }] } },
    members: { mapValue: { fields: { [owner.uid]: { mapValue: { fields: { name: { stringValue: 'Alex' }, slot: { stringValue: '0' } } } } } } },
  } }
}

try {
  const [owner, first, second, stranger, unverified] = await Promise.all([
    client('agare'), client('forsta'), client('andra'), client('utomstaende'), client('obekraftad', false),
  ])
  await request(dbUrl + 'groups/' + groupId, 'PATCH', groupFields('Testfamiljen', 3, owner))
  await request(dbUrl + 'groups/annan-' + runId, 'PATCH', groupFields('Annan grupp', 9, stranger))
  const groupRef = doc(owner.db, 'groups', groupId)
  const group = { ...(await getDocFromServer(groupRef)).data(), id: groupId }
  function offer(address) { return offerSeat(owner.db, group, address, owner.email) }
  async function seats() {
    const s = await getDocsFromServer(collection(groupRef, 'seats'))
    return s.docs.map(d => ({ ...d.data(), slot: d.id }))
  }
  function link(seat) { return { groupId, token: seat.token } }
  const denied = { code: 'permission-denied' }
  assert.deepEqual((await getDocsFromServer(query(collection(owner.db, 'groups'), where('memberUids', 'array-contains', owner.uid)))).docs.map(d => d.id), [groupId])
  await assert.rejects(getDocFromServer(doc(first.db, 'groups', groupId)), denied)
  await assert.rejects(offer(owner.email), /redan med/)
  await Promise.all([offer(first.email), offer(first.email.toUpperCase())])
  assert.equal((await seats()).length, 1)
  let [firstSeat] = await seats()
  await assert.rejects(readInvitation(stranger.db, link(firstSeat)), denied)
  await revokeSeat(owner.db, groupId, firstSeat)
  await assert.rejects(readInvitation(first.db, link(firstSeat)), denied)
  await Promise.all([offer(first.email), offer(unverified.email)])
  assert.equal((await seats()).length, 2)
  const blocked = (await seats()).find(s => s.email === unverified.email)
  await assert.rejects(readInvitation(unverified.db, link(blocked)), denied)
  await assert.rejects(offer(second.email), /Alla platser/)
  await request(dbUrl + 'groups/' + groupId + '/seats/' + blocked.slot + '?updateMask.fieldPaths=expiresAt', 'PATCH',
    { fields: { expiresAt: { timestampValue: '2020-01-01T00:00:00Z' } } })
  await offer(second.email)
  const list = await seats()
  firstSeat = list.find(s => s.email === first.email)
  const secondSeat = list.find(s => s.email === second.email)
  assert.ok(secondSeat)
  assert.ok(!(await getDocFromServer(doc(groupRef, 'invitations', blocked.token))).exists())
  const one = await readInvitation(first.db, link(firstSeat))
  const two = await readInvitation(second.db, link(secondSeat))
  await assert.rejects(getDocFromServer(doc(first.db, 'groups', groupId)), denied)
  await Promise.all([
    acceptInvitation(first.db, link(firstSeat), one, first.uid, 'Kim'),
    acceptInvitation(second.db, link(secondSeat), two, second.uid, 'Robin'),
  ])
  const joined = (await getDocFromServer(doc(first.db, 'groups', groupId))).data()
  assert.deepEqual(new Set(joined.memberUids), new Set([owner.uid, first.uid, second.uid]))
  assert.equal(joined.members[first.uid].name, 'Kim')
  await assert.rejects(readInvitation(first.db, link(firstSeat)), denied)
  await assert.rejects(getDocsFromServer(collection(first.db, 'groups', groupId, 'seats')), denied)
  await assert.rejects(revokeSeat(owner.db, groupId, firstSeat), /redan gått med/)
  await assert.rejects(offer(first.email), /redan med/)
  console.log('Godkänt: medlemskap, gruppgränser, privata mejladresser, samtidiga inbjudningar och inträden, kvot, engångslänkar, utgångstid och återkallelse.')
  await testGifts({ groupId, otherId: 'annan-' + runId, owner, first, second, stranger, unverified })
  await testPortraits({ groupId, otherId: 'annan-' + runId, owner, first, second, stranger, unverified })
} finally {
  await Promise.all(clients.map(async ({ app, db }) => { await terminate(db); await deleteApp(app) }))
}
