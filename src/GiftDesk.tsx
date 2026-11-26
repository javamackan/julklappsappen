import { useEffect, useLayoutEffect, useRef, useState, type DependencyList } from 'react'
import type { Firestore } from 'firebase/firestore'
import type { FamilyGroup } from './groupData'
import {
  createGift, editGift, releaseGift, removeGift, reserveGift, setPurchased, watchBag,
  watchGroupClaim, watchHold, watchItem, watchList, type BagEntry, type Gift, type GiftAddress, type GiftKind,
} from './giftData'
import { actionError, GiftEditor, GiftInfo } from './GiftEditor'
import { Avatar } from './Portraits'
import { useGiftEffects } from './Festivity'

type Desk = { db: Firestore; group: FamilyGroup; uid: string }
type ListProps = Desk & { recipient: string; kind: GiftKind }
type Screen = 'mine' | 'family' | 'sack'
type Subscribe<T> = (ok: (value: T) => void, fail: () => void) => () => void

function useFeed<T>(subscribe: Subscribe<T>, keys: DependencyList) {
  const [value, setValue] = useState<T>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setFailed(false)
    setValue(undefined)
    const stop = subscribe(data => { if (active) setValue(data) }, () => { if (active) setFailed(true) })
    return () => { active = false; stop() }
  }, [...keys, attempt])
  return { value, failed, retry: () => setAttempt(v => v + 1) }
}

function ReadError({ retry }: { retry: () => void }) {
  return <p className="notice error" role="alert">Uppgifterna kunde inte hämtas. <button className="link" onClick={retry}>Försök igen</button></p>
}

function Reservation({ db, group, uid, address, openBag }: Desk & { address: GiftAddress; openBag: () => void }) {
  const { recipient, kind, id } = address
  const hold = useFeed<{ token: string } | null>((ok, fail) => watchHold(db, address, ok, fail), [db, recipient, kind, id])
  const claim = useFeed<{ token: string; giver: string } | null>((ok, fail) => watchGroupClaim(db, group.id, address, ok, fail), [db, group.id, recipient, kind, id])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setError(''), [hold.value?.token])
  const { begin } = useGiftEffects()
  async function reserve(button: HTMLButtonElement) {
    if (busy) return
    setBusy(true)
    setError('')
    const celebrate = begin(button)
    try { await reserveGift(db, group.id, uid, address); celebrate() }
    catch (err) { setError(actionError(err)) }
    finally { setBusy(false) }
  }
  if (hold.failed || claim.failed) return <ReadError retry={() => { hold.retry(); claim.retry() }} />
  if (hold.value === undefined || claim.value === undefined) return <small role="status">Hämtar paxning …</small>
  const giver = hold.value && claim.value?.token === hold.value.token ? claim.value.giver : null
  return <div className="reserve-area">
    {hold.value ? <div className="button-row">
      <span className="claimed" role="status">{giver === uid ? 'Paxad av dig' : giver && group.members[giver] ? 'Paxad av ' + group.members[giver].name : 'Redan paxad'}</span>
      {giver === uid && <button className="link" onClick={openBag}>Visa i tomtesäcken</button>}
    </div> : <button className="green" disabled={busy} onClick={e => void reserve(e.currentTarget)}>{busy ? 'Paxar …' : 'Paxa klappen'}</button>}
    {error && !hold.value && <p className="notice error" role="alert">{error}</p>}
  </div>
}

function GiftCard({ db, group, uid, recipient, kind, gift, openBag }: ListProps & { gift: Gift; openBag: () => void }) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const address = { recipient, kind, id: gift.id }
  async function remove() {
    if (busy) return
    setBusy(true)
    setError('')
    try { await removeGift(db, address) }
    catch (err) { setError(actionError(err)) }
    finally { setBusy(false) }
  }
  return <li className="gift-card">
    {editing ? <GiftEditor original={gift} idea={kind === 'ideas'} save={v => editGift(db, address, v)} cancel={() => setEditing(false)} /> : <>
      <GiftInfo item={gift} />
      {gift.author === uid && (deleting ? <div className="confirm-box">
        <p>Ta bort {kind === 'ideas' ? 'idén' : 'önskningen'}?</p>
        <div className="button-row"><button className="small-btn" disabled={busy} onClick={() => void remove()}>Ja, ta bort</button>
          <button className="link" disabled={busy} onClick={() => setDeleting(false)}>Avbryt</button></div>
      </div> : <div className="button-row">
        <button className="link" onClick={() => setEditing(true)}>Ändra</button>
        <button className="link" onClick={() => setDeleting(true)}>Ta bort</button>
      </div>)}
      {recipient !== uid && <Reservation db={db} group={group} uid={uid} address={address} openBag={openBag} />}
    </>}
    {error && <p className="notice error" role="alert">{error}</p>}
  </li>
}

function GiftList({ db, group, uid, recipient, kind, openBag }: ListProps & { openBag: () => void }) {
  const list = useFeed<Gift[]>((ok, fail) => watchList(db, group.id, recipient, kind, ok, fail), [db, group.id, recipient, kind])
  const [adding, setAdding] = useState(false)
  const idea = kind === 'ideas'
  const mine = recipient === uid
  const name = group.members[recipient].name
  return <section className="gift-section">
    <div className="gift-heading">{!idea && <Avatar uid={recipient} />}<h2>{idea ? 'Hemliga presentidéer' : mine ? 'Min önskelista' : 'Önskningar från ' + name}</h2></div>
    {idea && <p className="section-note">Här kan ni tipsa varandra om klappar till {name}. Bara de andra i gruppen ser idéerna.</p>}
    {(mine || idea) && (adding ? <GiftEditor idea={idea} save={async v => { await createGift(db, group.id, recipient, kind, uid, v) }}
      cancel={() => setAdding(false)} /> : <button className={idea ? 'green' : ''} onClick={() => setAdding(true)}>{idea ? 'Lägg till hemlig idé' : 'Lägg till önskning'}</button>)}
    {list.failed ? <ReadError retry={list.retry} /> : list.value === undefined ? <p role="status" className="list-status">Hämtar listan …</p>
      : list.value.length ? <ul className="gift-list">{list.value.map(gift => <GiftCard key={gift.id} {...{ db, group, uid, recipient, kind, gift, openBag }} />)}</ul>
      : <p className="empty-state">{idea ? 'Inga hemliga idéer ännu.' : mine ? 'Vad skulle du bli glad av på julafton? Lägg till din första önskning.' : name + ' har inte lagt in några önskningar ännu.'}</p>}
  </section>
}

function SackCard({ db, group, uid, entry }: Desk & { entry: BagEntry }) {
  const live = useFeed<Gift | null>((ok, fail) => watchItem(db, entry, ok, fail), [db, entry.recipient, entry.kind, entry.id])
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function act(release: boolean) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (release) await releaseGift(db, uid, entry)
      else await setPurchased(db, uid, entry, !entry.bought)
    } catch (err) { setError(actionError(err)) }
    finally { setBusy(false) }
  }
  const removed = live.value === null || live.value?.removed
  const display = live.value && !removed ? live.value : entry
  return <li className={'gift-card' + (entry.bought ? ' purchased' : '')}>
    <div className="sack-header"><span className="sack-recipient"><Avatar uid={entry.recipient} small />Till {group.members[entry.recipient]?.name ?? 'en gruppmedlem'}</span>
      {entry.bought && <span className="claimed">Köpt ✓</span>}</div>
    <GiftInfo item={display} />
    {live.failed && <ReadError retry={live.retry} />}
    {removed && <p className="section-note">{entry.kind === 'ideas' ? 'Presentidén har tagits bort.' : 'Önskningen har tagits bort från listan.'} Du har kvar din paxning.</p>}
    {confirm ? <div className="confirm-box">
      <p>Släppa paxningen på {display.title}?</p>
      <div className="button-row"><button className="small-btn" disabled={busy} onClick={() => void act(true)}>Ja, släpp paxningen</button>
        <button className="link" disabled={busy} onClick={() => setConfirm(false)}>Avbryt</button></div>
    </div> : <div className="button-row">
      <button className="green" disabled={busy} onClick={() => void act(false)}>{entry.bought ? 'Ångra köpmarkering' : 'Markera som köpt'}</button>
      <button className="link" disabled={busy} onClick={() => setConfirm(true)}>Släpp paxning</button>
    </div>}
    {error && <p role="alert" className="notice error">{error}</p>}
  </li>
}

function Sack({ db, group, uid }: Desk) {
  const bag = useFeed<BagEntry[]>((ok, fail) => watchBag(db, uid, group.id, ok, fail), [db, uid, group.id])
  return <section className="gift-section"><h2>Min tomtesäck</h2>
    {bag.failed ? <ReadError retry={bag.retry} /> : !bag.value ? <p role="status">Hämtar dina klappar …</p> : bag.value.length ?
      <><p className="section-note">Bara du ser dina köpmarkeringar.</p><ul className="gift-list">{bag.value.map(entry =>
        <SackCard key={entry.token} {...{ db, group, uid, entry }} />)}</ul></> :
      <p className="empty-state">Tomtesäcken är tom. När du paxar en klapp i Familjens listor hamnar den här.</p>}
  </section>
}

function FamilyLists({ db, group, uid, openBag }: Desk & { openBag: () => void }) {
  const [recipient, setRecipient] = useState('')
  const strip = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const row = strip.current
    const button = row?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')
    if (!row || !button) return
    const offset = button.getBoundingClientRect().left - row.getBoundingClientRect().left
    row.scrollLeft += offset - (row.clientWidth - button.offsetWidth) / 2
  }, [recipient])
  function overview() {
    const current = strip.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')
    setRecipient('')
    current?.focus({ preventScroll: true })
  }
  return <section className="family-section">
    <div className="family-heading"><h2>Familjens listor</h2>
      {recipient && <button className="link" onClick={overview}>Alla medlemmar</button>}
    </div>
    <div ref={strip} className={'family-people' + (recipient ? ' compact' : '')} role="group" aria-label="Välj en önskelista">
      {group.memberUids.map(id => <button key={id} className="family-person" aria-expanded={recipient === id}
        aria-controls="family-wishes" onClick={() => setRecipient(id === recipient ? '' : id)}>
        <Avatar uid={id} /><span>{group.members[id].name}{id === uid && <small> (du)</small>}</span>
      </button>)}
    </div>
    <div id="family-wishes">{recipient && <div key={recipient} className="family-detail">
      <GiftList {...{ db, group, uid, recipient, openBag }} kind="wishes" />
      {recipient !== uid && <GiftList {...{ db, group, uid, recipient, openBag }} kind="ideas" />}
    </div>}</div>
  </section>
}

const tabs: { id: Screen; label: string; icon: string }[] = [
  { id: 'mine', label: 'Min önskelista', icon: 'onskelista' },
  { id: 'family', label: 'Familjens listor', icon: 'familj' },
  { id: 'sack', label: 'Min tomtesäck', icon: 'tomtesack' },
]
export function GiftDesk(props: Desk) {
  const [screen, setScreen] = useState<Screen>('mine')
  const openBag = () => setScreen('sack')
  return <div className="gift-desk">
    <nav className="gift-nav" aria-label="Julklappar">{tabs.map(tab =>
      <button key={tab.id} aria-pressed={tab.id === screen} onClick={() => setScreen(tab.id)}>
        <img className="tab-icon" src={'/julikoner/' + tab.icon + '.webp'} alt="" />{tab.label}
      </button>)}</nav>
    {screen === 'mine' && <GiftList {...props} kind="wishes" recipient={props.uid} openBag={openBag} />}
    {screen === 'family' && <FamilyLists {...props} openBag={openBag} />}
    {screen === 'sack' && <Sack {...props} />}
  </div>
}
