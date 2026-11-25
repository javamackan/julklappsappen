import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

export async function startFirebase() {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  let config: FirebaseOptions
  if (local) {
    config = {
      apiKey: 'demo-api-key',
      projectId: 'demo-julklappsappen',
      authDomain: 'demo-julklappsappen.firebaseapp.com',
      appId: '1:000000000000:web:0000000000000000',
    }
  } else {
    // Klassiska Firebase Hosting tillhandahåller webbappens offentliga konfiguration.
    const response = await fetch('/__/firebase/init.json', { cache: 'no-store' })
    if (!response.ok) throw new Error('Firebase-konfigurationen kunde inte hämtas.')
    config = await response.json()
    if (!config.apiKey || !config.projectId || !config.authDomain) {
      throw new Error('Firebase-konfigurationen är ofullständig.')
    }
  }
  const app = initializeApp(config)
  const auth = getAuth(app)
  const db = getFirestore(app)
  if (local) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }
  auth.languageCode = 'sv'
  return { auth, db }
}
