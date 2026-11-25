import { createRoot } from 'react-dom/client'
import '@fontsource-variable/nunito'
import './style.css'
import { Account } from './Account'
import { startAuth } from './firebase'

const root = createRoot(document.getElementById('root')!)
root.render(<main className="loading" role="status">Öppnar Julklappsappen …</main>)
startAuth().then(auth => {
  root.render(<Account auth={auth} />)
}).catch(() => {
  root.render(
    <main className="loading">
      <h1>Appen kunde inte öppnas</h1>
      <p>Kontrollera anslutningen och försök igen.</p>
      <button onClick={() => window.location.reload()}>Försök igen</button>
    </main>,
  )
})
