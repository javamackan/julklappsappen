import {
  Bytes, collection, doc, onSnapshot, runTransaction, setDoc, type Firestore, type FirestoreError,
} from 'firebase/firestore'

export const maxPortraitBytes = 48 * 1024
export type PortraitSuggestion = { version: string; image: Bytes }
type Failed = (error: FirestoreError) => void
const suggestionRef = (db: Firestore, group: string, uid: string) => doc(db, 'groups', group, 'portraitSuggestions', uid)

export function watchPortraits(db: Firestore, group: string, next: (images: Record<string, string>) => void, fail: Failed) {
  return onSnapshot(collection(db, 'groups', group, 'portraits'), { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return
    next(Object.fromEntries(snapshot.docs.map(row => [row.id, portraitSrc(row.get('image'))])))
  }, fail)
}

export function portraitSrc(image: Bytes) {
  return 'data:image/jpeg;base64,' + image.toBase64()
}

export function watchSuggestion(db: Firestore, group: string, uid: string, next: (value: PortraitSuggestion | null) => void, fail: Failed) {
  return onSnapshot(suggestionRef(db, group, uid), { includeMetadataChanges: true }, snapshot => {
    if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) next(snapshot.exists() ? snapshot.data() as PortraitSuggestion : null)
  }, fail)
}

export function proposePortrait(db: Firestore, group: string, uid: string, image: Bytes) {
  return setDoc(suggestionRef(db, group, uid), { version: crypto.randomUUID(), image })
}

export function choosePortrait(db: Firestore, group: string, uid: string, expected: PortraitSuggestion | null, choice: 'accept' | 'standard' | 'dismiss') {
  const pending = suggestionRef(db, group, uid)
  const approved = doc(db, 'groups', group, 'portraits', uid)
  return runTransaction(db, async tx => {
    const proposal = await tx.get(pending)
    const current = proposal.data() as PortraitSuggestion | undefined
    if (expected && (current?.version !== expected.version || !current.image.isEqual(expected.image))) {
      throw new Error('Porträttförslaget har ändrats. Titta på det nya förslaget först.')
    }
    if (choice === 'accept') {
      if (!expected) throw new Error('Det finns inget porträtt att godkänna.')
      tx.set(approved, { image: expected.image })
    } else if (choice === 'standard') {
      tx.delete(approved)
    }
    if (proposal.exists()) tx.delete(pending)
  })
}
