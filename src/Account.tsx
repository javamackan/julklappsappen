import { useEffect, useState, type FormEvent } from 'react'
import { FirebaseError } from 'firebase/app'
import {
  createUserWithEmailAndPassword, onAuthStateChanged, reload, sendEmailVerification,
  sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type Auth, type User,
} from 'firebase/auth'

import type { Firestore } from 'firebase/firestore'
import { Groups } from './Groups'
import { readInviteLink } from './groupData'

type Mode = 'login' | 'register' | 'reset'
type Notice = { text: string; error?: boolean }

const titles: Record<Mode, string> = {
  login: 'Logga in',
  register: 'Skapa konto',
  reset: 'Återställ lösenordet',
}

function explainError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password': return 'Kontrollera mejladressen och lösenordet och försök igen.'
      case 'auth/invalid-email': return 'Ange en giltig mejladress.'
      case 'auth/email-already-in-use': return 'Kontot kunde inte skapas. Prova att logga in eller återställa lösenordet.'
      case 'auth/weak-password': return 'Välj ett starkare lösenord med minst sex tecken.'
      case 'auth/network-request-failed': return 'Kontrollera anslutningen och försök igen.'
      case 'auth/too-many-requests': return 'För många försök. Vänta en stund och försök igen.'
    }
  }
  return 'Det gick inte att slutföra just nu. Försök igen om en stund.'
}

export function Account({ auth, db }: { auth: Auth; db: Firestore }) {
  const [user, setUser] = useState<User | null>()
  const [invite, setInvite] = useState(readInviteLink)
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => onAuthStateChanged(auth, setUser), [auth])

  function switchMode(next: Mode) {
    setMode(next)
    setPassword('')
    setNotice(null)
  }

  async function perform(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      await action()
    } catch (error) {
      setNotice({ text: explainError(error), error: true })
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void perform(async () => {
      const address = email.trim()
      if (mode === 'reset') {
        try {
          await sendPasswordResetEmail(auth, address)
        } catch (error) {
          if (!(error instanceof FirebaseError && error.code === 'auth/user-not-found')) throw error
        }
        setNotice({ text: 'Om adressen har ett konto får du ett mejl med en länk för att välja ett nytt lösenord.' })
        return
      }
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, address, password)
      } else {
        const account = await createUserWithEmailAndPassword(auth, address, password)
        try {
          await sendEmailVerification(account.user)
          setNotice({ text: 'Ett bekräftelsemejl har skickats till din mejladress.' })
        } catch (error) {
          setNotice({ text: 'Kontot är skapat. ' + explainError(error) + ' Du kan begära ett nytt bekräftelsemejl här.', error: true })
        }
      }
      setPassword('')
    })
  }

  function checkAddress(current: User) {
    void perform(async () => {
      await reload(current)
      if (current.emailVerified) {
        await current.getIdToken(true)
      } else {
        setNotice({ text: 'Öppna länken i mejlet först och tryck sedan här igen.' })
      }
    })
  }

  return (
    <main className="card">
      <header className="julby"><img src="/julby.webp" alt="Julklappsappen" /></header>
      <div className="paper">
        {user === undefined ? <p role="status">Öppnar ditt konto …</p> : user ? (
          <>
            {user.emailVerified ? (
              <Groups key={user.uid} db={db} user={user} invite={invite} dismissInvite={() => {
                window.history.replaceState(null, '', '/')
                setInvite(null)
              }} />
            ) : (
              <>
                <h1>Bekräfta din mejladress</h1>
                <p className="identity">{user.email}</p>
                <p>Öppna länken i bekräftelsemejlet och kom sedan tillbaka hit.</p>
                <button disabled={busy} onClick={() => checkAddress(user)}>Jag har bekräftat adressen</button>
                <button className="link" disabled={busy} onClick={() => void perform(async () => {
                  await sendEmailVerification(user)
                  setNotice({ text: 'Ett nytt bekräftelsemejl har skickats.' })
                })}>Skicka nytt bekräftelsemejl</button>
              </>
            )}
            {user.emailVerified && <p className="account-address">{user.email}</p>}
            <button className="link" disabled={busy} onClick={() => void perform(async () => {
              await signOut(auth)
              setEmail('')
              switchMode('login')
            })}>Logga ut</button>
          </>
        ) : (
          <>
            <h1>{titles[mode]}</h1>
            {invite && mode !== 'reset' && <p>Du har fått en gruppinbjudan. Använd mejladressen som du blev inbjuden med.</p>}
            {mode === 'reset' && <p>Skriv din mejladress så kan du få en länk för att välja ett nytt lösenord.</p>}
            <form onSubmit={submit}>
              <label htmlFor="email">Mejladress</label>
              <input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none"
                spellCheck={false} required value={email} onChange={e => setEmail(e.target.value)} />
              {mode !== 'reset' && <>
                <label htmlFor="password">Lösenord</label>
                <input id="password" name="password" type="password"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  minLength={mode === 'register' ? 6 : undefined} required value={password}
                  onChange={e => setPassword(e.target.value)} />
              </>}
              <button type="submit" disabled={busy}>{mode === 'reset' ? 'Skicka återställningslänk' : titles[mode]}</button>
            </form>
            <nav aria-label="Kontoalternativ">
              {mode === 'login' ? <>
                <button className="link" disabled={busy} onClick={() => switchMode('reset')}>Glömt lösenord?</button>
                <button className="link" disabled={busy} onClick={() => switchMode('register')}>Skapa konto</button>
              </> : <button className="link" disabled={busy} onClick={() => switchMode('login')}>Tillbaka till inloggning</button>}
            </nav>
          </>
        )}
        {notice && (!user?.emailVerified || notice.error) && <p role={notice.error ? 'alert' : 'status'} className={notice.error ? 'notice error' : 'notice'}>{notice.text}</p>}
      </div>
    </main>
  )
}
