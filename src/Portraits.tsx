import {
  createContext, useContext, useEffect, useLayoutEffect, useRef, useState,
  type ChangeEvent, type ReactNode,
} from 'react'
import { doc, writeBatch, type Bytes, type Firestore } from 'firebase/firestore'
import type { FamilyGroup } from './groupData'
import { choosePortrait, portraitSrc, proposePortrait, watchPortraits, watchSuggestion, type PortraitSuggestion } from './portraitData'
import { centered, drawPortrait, encodePortrait, openPortrait, type Crop } from './cropPortrait'

const PortraitContext = createContext<Record<string, string>>({})

export function GroupPortraits({ db, groupId, children }: { db: Firestore; groupId: string; children: ReactNode }) {
  const [images, setImages] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => watchPortraits(db, groupId, setImages, () => { setImages({}); setFailed(true) }), [db, groupId, attempt])
  return <PortraitContext.Provider value={images}>
    {children}
    {failed && <p className="notice error" role="alert">Gruppens porträtt kunde inte hämtas. <button className="link" onClick={() => { setFailed(false); setAttempt(n => n + 1) }}>Försök igen</button></p>}
  </PortraitContext.Provider>
}

export function Avatar({ uid, small = false }: { uid: string; small?: boolean }) {
  const image = useContext(PortraitContext)[uid]
  return <img alt="" className={'avatar' + (small ? ' avatar-small' : '')} src={image || '/julikoner/pepparkaka.webp'} />
}

type MemberProps = { db: Firestore; group: FamilyGroup; uid: string }

function portraitError(error: unknown) {
  return error instanceof Error && !('code' in error) ? error.message : 'Porträttet kunde inte sparas. Kontrollera anslutningen och försök igen.'
}

export function OwnPortrait({ db, group, uid }: MemberProps) {
  const [proposal, setProposal] = useState<PortraitSuggestion | null>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => watchSuggestion(db, group.id, uid, p => { setProposal(p); setMessage('') }, () => setFailed(true)), [db, group.id, uid, attempt])
  async function decide(choice: 'accept' | 'standard' | 'dismiss') {
    if (!proposal || busy) return
    setBusy(true)
    setMessage('')
    try {
      await choosePortrait(db, group.id, uid, proposal, choice)
      setMessage(choice === 'accept' ? 'Ditt porträtt är valt och syns för gruppen.' : 'Ditt bildval är sparat.')
    } catch (err) { setMessage(portraitError(err)) }
    finally { setBusy(false) }
  }
  const current = useContext(PortraitContext)[uid]
  if (failed) return <p role="alert" className="notice error">Ditt porträttförslag kunde inte hämtas. <button className="link" onClick={() => { setFailed(false); setAttempt(n => n + 1) }}>Försök igen</button></p>
  return <>
    {proposal && <section className="portrait-offer" aria-labelledby="portrait-offer-title">
      <img className="offer-image" src={portraitSrc(proposal.image)} alt="Förslag på ditt grupporträtt" />
      <div><h2 id="portrait-offer-title">Ditt nya porträtt</h2><p>Vill du visa bilden för {group.name}?</p></div>
      <div className="button-row"><button className="green" disabled={busy} onClick={() => void decide('accept')}>Godkänn porträtt</button>
        <button className="link" disabled={busy} onClick={() => void decide('standard')}>Använd pepparkakan</button>
        {current && <button className="link" disabled={busy} onClick={() => void decide('dismiss')}>Behåll mitt nuvarande porträtt</button>}</div>
    </section>}
    {message && <p className="notice" role="status">{message}</p>}
  </>
}

export function PortraitEditor({ name, label, close, onSave }: {
  name: string; label: string; close: () => void; onSave: (image: Bytes) => void | Promise<void>
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<Crop>(centered)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const latest = useRef(0)
  useEffect(() => () => { latest.current++ }, [])
  useLayoutEffect(() => {
    if (image && canvas.current) {
      try { drawPortrait(canvas.current, image, crop) } catch (err) { setError(portraitError(err)) }
    }
  }, [image, crop])

  async function select(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    event.currentTarget.value = ''
    const ticket = ++latest.current
    setLoading(true)
    setError('')
    setImage(null)
    try {
      const decoded = await openPortrait(file)
      if (ticket === latest.current) { setCrop(centered); setImage(decoded) }
    } catch (err) { if (ticket === latest.current) setError(portraitError(err)) }
    finally { if (ticket === latest.current) setLoading(false) }
  }
  async function save() {
    if (!canvas.current || !image || busy) return
    setBusy(true)
    setError('')
    try {
      const thumbnail = await encodePortrait(canvas.current)
      await onSave(thumbnail)
    } catch (err) { setError(portraitError(err)) }
    finally { setBusy(false) }
  }
  function slider(label: string, key: keyof Crop, min: number, max: number, step: number) {
    return <label className="crop-slider">{label}<input type="range" value={crop[key]} min={min} max={max} step={step}
      disabled={busy} onChange={e => { const value = Number(e.target.value); setCrop(previous => ({ ...previous, [key]: value })) }} /></label>
  }
  return <section className="portrait-editor" aria-label={'Porträtt för ' + name}>
    <h3>Porträtt för {name}</h3>
    <label className="file-label">Välj en bild
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => void select(e)} /></label>
    {loading && <p role="status">Öppnar bilden …</p>}
    {image && <>
      <canvas ref={canvas} className="crop-preview" width={256} height={256} aria-label={'Rund förhandsvisning för ' + name} role="img" />
      {slider('Zoom', 'zoom', 1, 2.5, 0.05)}
      {(crop.zoom > 1 || image.naturalWidth > image.naturalHeight) && slider('Sidled', 'x', 0, 100, 1)}
      {(crop.zoom > 1 || image.naturalHeight > image.naturalWidth) && slider('Höjdled', 'y', 0, 100, 1)}
    </>}
    <div className="button-row">{image && <button type="button" className="green" disabled={busy || loading} onClick={() => void save()}>{label}</button>}
      <button type="button" className="link" disabled={busy} onClick={close}>Avbryt</button></div>
    {error && <p className="notice error" role="alert">{error}</p>}
  </section>
}

export function Members({ db, group, uid }: MemberProps) {
  const images = useContext(PortraitContext)
  const [editing, setEditing] = useState('')
  const [feedback, setFeedback] = useState('')
  const [removing, setRemoving] = useState(false)
  async function useDefault() {
    setRemoving(true)
    setFeedback('')
    try { await choosePortrait(db, group.id, uid, null, 'standard'); setFeedback('Pepparkakan är nu ditt grupporträtt.') }
    catch (err) { setFeedback(portraitError(err)) }
    finally { setRemoving(false) }
  }
  return <section aria-labelledby="member-title">
    <h2 id="member-title">Medlemmar <span className="member-count">{group.memberUids.length} av {group.capacity}</span></h2>
    <ul className="member-list">{group.memberUids.map(target => {
      const name = group.members[target].name
      return <li key={target}>
        <div className="member-line"><Avatar uid={target} /><span>{name}{target === uid && <small> · du</small>}
          {target === group.ownerUid && <small className="member-role">Gruppägare</small>}</span></div>
        {(group.ownerUid === uid || target === uid) && editing !== target && <button className="link portrait-link" aria-label={'Välj porträtt för ' + name}
          onClick={() => { setFeedback(''); setEditing(target) }}>Välj porträtt</button>}
        {target === uid && images[uid] && <button className="link portrait-link" disabled={removing} onClick={() => void useDefault()}>Byt till pepparkakan</button>}
        {editing === target && <PortraitEditor key={target} name={name} close={() => setEditing('')}
          label={target === uid ? 'Spara mitt porträtt' : 'Skicka porträttförslag'}
          onSave={async image => {
            if (target === uid) {
              const batch = writeBatch(db)
              batch.set(doc(db, 'groups', group.id, 'portraits', uid), { image })
              batch.delete(doc(db, 'groups', group.id, 'portraitSuggestions', uid))
              await batch.commit()
            } else await proposePortrait(db, group.id, target, image)
            setEditing('')
            setFeedback(target === uid ? 'Ditt porträtt är sparat.' : name + ' får nu godkänna sitt porträtt i appen.')
          }} />}
      </li>
    })}</ul>
    {feedback && <p className="notice" role="status">{feedback}</p>}
  </section>
}
