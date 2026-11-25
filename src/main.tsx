import { createRoot } from 'react-dom/client'
import '@fontsource-variable/nunito'
import './style.css'
import { Account } from './Account'
import { startFirebase } from './firebase'

const root = createRoot(document.getElementById('root')!)
root.render(<main className="loading" role="status">Öppnar Julklappsappen …</main>)
startFirebase().then(({ auth, db }) => {
  root.render(<Account auth={auth} db={db} />)
}).catch(() => {
  root.render(
    <main className="loading">
      <h1>Appen kunde inte öppnas</h1>
      <p>Kontrollera anslutningen och försök igen.</p>
      <button onClick={() => window.location.reload()}>Försök igen</button>
    </main>,
  )
})
