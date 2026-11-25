import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'

export async function startAuth() {
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
  const auth = getAuth(initializeApp(config))
  if (local) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  auth.languageCode = 'sv'
  return auth
}
