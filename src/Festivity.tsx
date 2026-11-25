import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

const soundKey = 'julklappsappen.paxningsljud'
const landingMs = 640

class Chime {
  private context?: AudioContext
  private buffer?: Promise<AudioBuffer>
  private playing?: AudioBufferSourceNode
  private generation = 0

  prepare() {
    try {
      const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Audio) return
      const context = this.context ??= new Audio()
      // Lås upp mobilens ljud vid själva trycket. Klippet spelas först efter bekräftad paxning.
      if (context.state !== 'running') void context.resume().catch(() => {})
      if (!this.buffer) {
        this.buffer = fetch('/paxning.mp3').then(async response => {
          if (!response.ok) throw new Error()
          return context.decodeAudioData(await response.arrayBuffer())
        })
        void this.buffer.catch(() => { this.buffer = undefined })
      }
    } catch { /* Paxningen fungerar även när webbläsaren saknar ljud. */ }
  }

  async play(at: number) {
    const turn = ++this.generation
    try {
      const buffer = await this.buffer
      const context = this.context
      if (!buffer || context?.state !== 'running' || this.generation !== turn || performance.now() > at + 350) return
      this.playing?.stop()
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      this.playing = source
      source.onended = () => { source.disconnect(); if (this.playing === source) this.playing = undefined }
      source.start(context.currentTime + Math.max(0, at - performance.now()) / 1000)
    } catch { /* Ljud är valfritt. */ }
  }

  stop() {
    this.generation++
    this.playing?.stop()
    this.playing = undefined
  }

  close() {
    this.stop()
    if (this.context) void this.context.close().catch(() => {})
    this.context = undefined
    this.buffer = undefined
  }
}

const Effects = createContext({ begin: (_button: HTMLElement): (() => void) => () => {}, sound: true, toggle: () => {} })
export const useGiftEffects = () => useContext(Effects)

type Flight = { id: number; x: number; y: number }

export function GiftEffects({ children }: { children: ReactNode }) {
  const [sound, setSound] = useState(() => {
    try { return localStorage.getItem(soundKey) !== 'av' } catch { return true }
  })
  const enabled = useRef(sound)
  const [flight, setFlight] = useState<Flight | null>(null)
  const turn = useRef(0)
  const active = useRef(true)
  const chime = useRef<Chime | null>(null)
  useEffect(() => {
    active.current = true
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => { if (media.matches) setFlight(null) }
    media.addEventListener('change', changed)
    return () => { active.current = false; media.removeEventListener('change', changed); chime.current?.close() }
  }, [])
  useEffect(() => {
    if (!flight) return
    const timer = window.setTimeout(() => setFlight(null), 1150)
    return () => clearTimeout(timer)
  }, [flight])
  function toggle() {
    enabled.current = !enabled.current
    setSound(enabled.current)
    if (!enabled.current) chime.current?.stop()
    else (chime.current ??= new Chime()).prepare()
    try { localStorage.setItem(soundKey, enabled.current ? 'på' : 'av') } catch { /* Privat läge. */ }
  }
  function begin(button: HTMLElement) {
    const box = button.getBoundingClientRect()
    const position = { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    if (enabled.current) (chime.current ??= new Chime()).prepare()
    return () => {
      if (!active.current) return
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!reduced) setFlight({ ...position, id: ++turn.current })
      if (enabled.current) void chime.current?.play(performance.now() + (reduced ? 0 : landingMs))
    }
  }
  const style = flight ? {
    '--tap-x': Math.max(20, Math.min(flight.x, window.innerWidth - 20)) + 'px',
    '--tap-y': Math.max(20, Math.min(flight.y, window.innerHeight - 20)) + 'px',
  } as CSSProperties : undefined
  return <Effects.Provider value={{ begin, toggle, sound }}>
    {children}
    {flight && <div key={flight.id} className="gift-flight" style={style} aria-hidden="true">
      <img className="landing-sack" src="/julikoner/tomtesack.webp" alt="" />
      <img className="flying-parcel" src="/julikoner/paket.webp" alt="" />
    </div>}
  </Effects.Provider>
}

export function SoundButton() {
  const { sound, toggle } = useGiftEffects()
  return <button className="sound-button" onClick={toggle} aria-label="Paxningsljud" aria-pressed={sound}>
    <img src="/julikoner/bjallra.webp" alt="" />{sound ? 'Ljud på' : 'Ljud av'}
  </button>
}
