import { useId, useState, type FormEvent } from 'react'
import { emptyGift, giftFields, GiftProblem, type GiftFields } from './giftData'

export function actionError(error: unknown) {
  if (error instanceof GiftProblem) return error.message
  const code = (error as { code?: string })?.code
  if (code === 'permission-denied') return 'Ändringen kunde inte sparas. Gruppens uppgifter kan ha ändrats. Öppna listan igen.'
  if (code === 'unavailable' || !navigator.onLine) return 'Anslutningen saknas. Försök igen när du är online.'
  return 'Det gick inte att spara just nu. Försök igen.'
}

const wholeKronor = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 })
const kronorAndOre = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' })
export function GiftInfo({ item }: { item: GiftFields }) {
  let shop: URL | undefined
  try {
    const url = new URL(item.url)
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) shop = url
  } catch { /* Länk är frivillig. */ }
  return <>
    <h3 className="gift-title">{item.title}</h3>
    {item.details && <p className="gift-detail">{item.details}</p>}
    {(item.priceOre !== null || shop) && <div className="gift-meta">
      {item.priceOre !== null && <span className="price">{(item.priceOre % 100 === 0 ? wholeKronor : kronorAndOre).format(item.priceOre / 100)}</span>}
      {shop && <a href={shop.href} target="_blank" rel="noopener noreferrer">Öppna länk</a>}
    </div>}
  </>
}

export function GiftEditor({ original = emptyGift, idea, save, cancel }: {
  original?: GiftFields; idea: boolean; save: (v: GiftFields) => Promise<void>; cancel: () => void
}) {
  const fieldId = useId()
  const [title, setTitle] = useState(original.title)
  const [details, setDetails] = useState(original.details)
  const [price, setPrice] = useState(original.priceOre === null ? '' : String(original.priceOre / 100).replace('.', ','))
  const [url, setUrl] = useState(original.url)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await save(giftFields(title, details, url, price))
      cancel()
    } catch (err) { setError(actionError(err)) }
    finally { setBusy(false) }
  }
  return <form className="gift-editor" onSubmit={submit}>
    <label htmlFor={fieldId + '-title'}>{idea ? 'Vad är din presentidé?' : 'Vad önskar du dig?'}</label>
    <input id={fieldId + '-title'} autoFocus required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} />
    <label htmlFor={fieldId + '-details'}>Detaljer <small>(valfritt)</small></label>
    <textarea id={fieldId + '-details'} rows={2} maxLength={800} placeholder="Till exempel storlek eller färg"
      value={details} onChange={e => setDetails(e.target.value)} />
    <label htmlFor={fieldId + '-url'}>Länk <small>(valfritt)</small></label>
    <input id={fieldId + '-url'} type="url" autoCapitalize="none" spellCheck={false} placeholder="https://" maxLength={2048}
      value={url} onChange={e => setUrl(e.target.value)} />
    <label htmlFor={fieldId + '-price'}>Ungefärligt pris i kronor <small>(valfritt)</small></label>
    <input id={fieldId + '-price'} type="text" inputMode="decimal" maxLength={20} value={price} onChange={e => setPrice(e.target.value)} />
    <div className="button-row">
      <button type="submit" disabled={busy}>{busy ? 'Sparar …' : idea ? 'Spara idé' : 'Spara önskning'}</button>
      <button className="link" type="button" disabled={busy} onClick={cancel}>Avbryt</button>
    </div>
    {error && <p className="notice error" role="alert">{error}</p>}
  </form>
}
