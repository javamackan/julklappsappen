import { useState } from 'react'
import './julby.css'

export function Julby() {
  const [sweeping, setSweeping] = useState(false)
  return <header className="julby">
    <img className="vinterby" src="/julby/vinterby.webp" alt="Julklappsappen" />
    <button type="button" className="pepparkaksgubbe" aria-label="Kittla pepparkaksgubben" onClick={() => setSweeping(true)}>
      <span className={'kakscen' + (sweeping ? ' sopar' : '')} aria-hidden="true">
        <span className="kaksmula" />
        <img className="halsduk" src="/julby/halsduk.webp" alt="" />
        {sweeping && <span className="sopklocka" onAnimationEnd={() => setSweeping(false)} />}
      </span>
    </button>
  </header>
}
