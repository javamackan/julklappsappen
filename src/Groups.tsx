import { useEffect, useState, type FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { GiftDesk } from './GiftDesk'
import { GroupPortraits, OwnPortrait, Members } from './Portraits'
import { GiftEffects, SoundButton } from './Festivity'
import type { Firestore } from 'firebase/firestore'
import {
  acceptInvitation, InviteProblem, inviteUrl, offerSeat, readInvitation, revokeSeat, watchGroups, watchSeats,
  type FamilyGroup, type Invitation, type InviteLink, type Seat,
} from './groupData'

type Feedback = { text: string; error?: boolean }

function Message({ value }: { value: Feedback | null }) {
  if (!value) return null
  return <p role={value.error ? 'alert' : 'status'} className={value.error ? 'notice error' : 'notice'}>{value.text}</p>
}

const unavailable = 'Inbjudan kan inte öppnas med det här kontot. Kontrollera att du är inloggad med den inbjudna mejladressen. Be gruppägaren om en ny länk om den gamla har gått ut.'
function inviteError(error: unknown) {
  if (error instanceof InviteProblem) return error.message
  const code = (error as { code?: string })?.code
  return code === 'permission-denied' || code === 'not-found' ? unavailable : 'Kontrollera anslutningen och försök igen.'
}

function JoinGroup({ db, user, link, leave }: { db: Firestore; user: User; link: InviteLink; leave: () => void }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [name, setName] = useState(user.displayName ?? '')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setFeedback(null)
    readInvitation(db, link).then(data => { if (active) setInvitation(data) })
      .catch(error => { if (active) setFeedback({ text: inviteError(error), error: true }) })
    return () => { active = false }
  }, [db, link, attempt])

  async function join(event: FormEvent) {
    event.preventDefault()
    if (!invitation || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      await acceptInvitation(db, link, invitation, user.uid, name)
      leave()
    } catch (error) {
      setFeedback({ text: inviteError(error), error: true })
    } finally {
      setBusy(false)
    }
  }

  return <>
    <h1>{invitation ? 'Välkommen till ' + invitation.groupName + '!' : 'Din gruppinbjudan'}</h1>
    {invitation ? <form onSubmit={join}>
      <label htmlFor="member-name">Vad vill du kallas i gruppen?</label>
      <input id="member-name" autoComplete="given-name" maxLength={50} required value={name} onChange={e => setName(e.target.value)} />
      <button disabled={busy || !name.trim()}>Gå med i gruppen</button>
    </form> : !feedback && <p role="status">Hämtar din inbjudan …</p>}
    <Message value={feedback} />
    {!invitation && feedback && <button className="link" onClick={() => setAttempt(v => v + 1)}>Försök igen</button>}
    <button className="link" disabled={busy} onClick={leave}>Till mina grupper</button>
  </>
}

const expiryFormat = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function GroupInvites({ db, group, address }: { db: Firestore; group: FamilyGroup; address: string }) {
  const [seats, setSeats] = useState<Seat[] | null>(null)
  const [email, setEmail] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [manualCopy, setManualCopy] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => watchSeats(db, group.id, setSeats, () => setLoadError(true)), [db, group.id, attempt])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const pending = (seats ?? []).filter(seat => !seat.claimedBy)
  const free = group.capacity - group.memberUids.length - pending.filter(seat => seat.expiresAt.toMillis() > now).length

  async function create(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFeedback(null)
    setManualCopy('')
    try {
      const created = await offerSeat(db, group, email, address)
      setFeedback({ text: created ? 'Inbjudan är klar. Dela länken med ' + email.trim() + '.' : 'Det finns redan en giltig länk för den mejladressen. Du kan dela den igen.' })
      setEmail('')
    } catch (error) {
      setFeedback({ text: error instanceof InviteProblem ? error.message : 'Inbjudan kunde inte skapas. Kontrollera anslutningen och försök igen.', error: true })
    } finally {
      setBusy(false)
    }
  }

  async function share(seat: Seat, native: boolean) {
    const url = inviteUrl(group.id, seat.token)
    setManualCopy('')
    setFeedback(null)
    try {
      if (native && navigator.share) {
        await navigator.share({ title: 'Gå med i ' + group.name, url })
      } else {
        await navigator.clipboard.writeText(url)
        setFeedback({ text: 'Länken till ' + seat.email + ' är kopierad.' })
      }
    } catch (error) {
      if ((error as { name?: string }).name !== 'AbortError') setManualCopy(url)
    }
  }

  async function revoke(seat: Seat) {
    if (busy) return
    setBusy(true)
    setManualCopy('')
    setFeedback(null)
    try {
      await revokeSeat(db, group.id, seat)
      setFeedback({ text: 'Inbjudan till ' + seat.email + ' är återkallad.' })
    } catch (error) {
      setFeedback({ text: error instanceof InviteProblem ? error.message : 'Inbjudan kunde inte återkallas. Försök igen.', error: true })
    } finally {
      setBusy(false)
    }
  }

  return <section className="invite-section" aria-labelledby="invite-title">
    <h2 id="invite-title">Bjud in till gruppen</h2>
    {loadError ? <><p role="alert">Inbjudningarna kunde inte hämtas.</p>
      <button className="link" onClick={() => { setLoadError(false); setAttempt(v => v + 1) }}>Försök igen</button></>
      : seats === null ? <p role="status">Hämtar inbjudningarna …</p> : <>
        {free > 0 ? <form onSubmit={create}>
          <p>Varje person får en egen länk som gäller i sju dagar. Du väljer hur du delar den.</p>
          <label htmlFor="invite-email">Personens mejladress</label>
          <input id="invite-email" type="email" maxLength={254} autoComplete="off" autoCapitalize="none" spellCheck={false}
            required value={email} onChange={e => setEmail(e.target.value)} />
          <button disabled={busy}>Skapa inbjudningslänk</button>
        </form> : <p>{group.memberUids.length === group.capacity ? 'Nu är alla med!' : 'Varje ledig plats har en inbjudan. Du kan återkalla en länk för att frigöra en plats.'}</p>}
        {pending.length > 0 && <>
          <h3>Skapade inbjudningar</h3>
          <ul className="invite-list">{pending.map(seat => {
            const expired = seat.expiresAt.toMillis() <= now
            return <li key={seat.token}>
              <strong>{seat.email}</strong>
              <small>{expired ? 'Länken har gått ut' : 'Gäller till ' + expiryFormat.format(seat.expiresAt.toDate())}</small>
              <div className="invite-actions">
                {!expired && <>
                  {typeof navigator.share === 'function' && <button className="link" onClick={() => void share(seat, true)}>Dela</button>}
                  <button className="link" onClick={() => void share(seat, false)}>Kopiera länk</button>
                </>}
                <button className="link" disabled={busy} onClick={() => void revoke(seat)}>Återkalla</button>
              </div>
            </li>
          })}</ul>
        </>}
      </>}
    {manualCopy && <label className="manual-copy">Markera och kopiera länken
      <input readOnly value={manualCopy} onFocus={e => e.target.select()} />
    </label>}
    <Message value={feedback} />
  </section>
}

export function Groups({ db, user, invite, dismissInvite }: { db: Firestore; user: User; invite: InviteLink | null; dismissInvite: () => void }) {
  const [groups, setGroups] = useState<FamilyGroup[] | null>(null)
  const [selected, setSelected] = useState('')
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => watchGroups(db, user.uid, setGroups, () => setFailed(true)), [db, user.uid, attempt])

  if (failed) return <><h1>Mina grupper</h1><p role="alert">Dina grupper kunde inte hämtas.</p>
    <button onClick={() => { setFailed(false); setAttempt(v => v + 1) }}>Försök igen</button></>
  if (!groups) return <p role="status">Hämtar dina grupper …</p>

  const invitedGroup = groups.find(g => g.id === invite?.groupId)
  if (invite && !invitedGroup) return <JoinGroup db={db} user={user} link={invite} leave={() => { setSelected(invite.groupId); dismissInvite() }} />
  const group = invitedGroup ?? groups.find(g => g.id === selected) ?? groups[0]
  if (!group) return <><h1>Mina grupper</h1><p>Du har ingen grupp ännu. Öppna inbjudningslänken du fått av gruppägaren för att gå med.</p></>
  return <>
    {groups.length > 1 && <label className="switch-group">Välj grupp
      <select value={group.id} onChange={e => { setSelected(e.target.value); if (invite) dismissInvite() }}>
        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
    </label>}
    <GroupPortraits key={group.id} db={db} groupId={group.id}><GiftEffects>
    <div className="group-heading"><h1 className="group-title">{group.name}</h1><SoundButton /></div>
    <OwnPortrait db={db} group={group} uid={user.uid} />
    <GiftDesk key={group.id} db={db} group={group} uid={user.uid} />
    <details key={'settings-' + group.id} className="group-panel">
      <summary>{group.ownerUid === user.uid ? 'Grupp och inbjudningar' : 'Gruppmedlemmar'}</summary>
      <Members db={db} group={group} uid={user.uid} />
      {group.ownerUid === user.uid && <GroupInvites key={group.id} db={db} group={group} address={user.email ?? ''} />}
    </details>
    </GiftEffects></GroupPortraits>
  </>
}
