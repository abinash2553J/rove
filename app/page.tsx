'use client'

import { useEffect, useState } from 'react'
import { ArrowUpRight, ChevronRight, Paperclip } from 'lucide-react'

const prompts = [
  'A 5-day food tour of Tokyo, no crowds…',
  'A quiet week in the Dolomites, great hikes…',
  'Two weeks island-hopping Greece on a budget…',
]

function CompassMark() {
  return (
    <span className="compass-mark" aria-hidden="true">
      <span className="compass-diamond" />
    </span>
  )
}

export default function Page() {
  const [text, setText] = useState('')
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      setText(prompts[0])
      return
    }

    let cancelled = false
    let timeout: ReturnType<typeof setTimeout>
    const pause = (ms: number) => new Promise<void>((resolve) => { timeout = setTimeout(resolve, ms) })
    const run = async () => {
      await pause(700)
      for (let index = 0; !cancelled; index = (index + 1) % prompts.length) {
        const prompt = prompts[index]
        for (let char = 1; char <= prompt.length && !cancelled; char += 1) {
          setText(prompt.slice(0, char))
          await pause(34 + Math.random() * 16)
        }
        await pause(1900)
        for (let char = prompt.length; char >= 0 && !cancelled; char -= 1) {
          setText(prompt.slice(0, char))
          await pause(20 + Math.random() * 8)
        }
        await pause(300)
      }
    }
    run()
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [reducedMotion])

  return (
    <main className="rove-page">
      <div className="ambient-wash" aria-hidden="true" />
      <div className="backdrop" aria-hidden="true">
        <img src="https://zxdefgavgwfxastwmmjm.supabase.co/storage/v1/object/public/assets/rove.png" alt="" />
      </div>

      <nav className="site-nav" aria-label="Main navigation">
        <a className="wordmark entrance entrance-0" href="#top"><CompassMark />ROVE</a>
        <div className="nav-links">
          <a className="entrance entrance-60" href="#discover">Discover</a>
          <a className="entrance entrance-110" href="#pricing">Pricing</a>
          <a className="entrance entrance-160" href="#faqs">FAQs</a>
        </div>
        <div className="nav-actions">
          <a className="login entrance entrance-200" href="#login">Login</a>
          <a className="nav-cta entrance entrance-250" href="#planner">Plan my trip <ArrowUpRight size={15} strokeWidth={1.8} /></a>
        </div>
      </nav>

      <section className="hero" id="top">
        <p className="kicker entrance entrance-260"><span />AI TRIP PLANNER<span /></p>
        <h1 className="entrance entrance-340">Where should we<br />take <em>you?</em></h1>
        <p className="subline entrance entrance-440">Tell Rove where you&apos;re headed and what you love — get a trip built just for you.</p>

        <div className="planner-wrap entrance entrance-540" id="planner">
          <div className={`prompt-card ${text ? 'has-text' : ''}`} role="search">
            <div className="typed-field" aria-label="Trip description">
              <span>{text}</span><i aria-hidden="true" />
            </div>
            <button className="upload-btn" type="button" aria-label="Attach travel inspiration"><Paperclip size={18} /></button>
            <button className="plan-btn" type="button">Plan my trip <ChevronRight size={17} /></button>
          </div>
          <div className="chips entrance entrance-640" aria-label="Trip suggestions">
            {['Weekend escapes', 'Food & wine trails', 'Off the map'].map((chip) => <button key={chip} type="button"><span />{chip}</button>)}
          </div>
        </div>
      </section>
    </main>
  )
}

export { prompts }
export type { }

