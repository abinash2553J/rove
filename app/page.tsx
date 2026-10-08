'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Compass,
  LoaderCircle,
  MapPin,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import type { ItineraryDay, TravelStyle, TripPlan, TripPreferences } from '@/lib/trip-plan'

type SavedTrip = {
  id: string
  title: string
  destination: string
  itinerary: TripPlan
  created_at: string
}

const promptSuggestions = [
  {
    label: 'Weekend escapes',
    prompt: 'Plan a relaxed weekend escape with scenic walks, local food, and a slow pace.',
  },
  {
    label: 'Food & wine trails',
    prompt: 'Build a food and wine trip around regional specialties and small local places.',
  },
  {
    label: 'Off the map',
    prompt: 'Find a quieter, lesser-known trip with nature, local culture, and flexible days.',
  },
]

const interestOptions = ['Food', 'Nature', 'Culture', 'Slow days', 'Art & design', 'Outdoors']
const budgetLabels: Record<TravelStyle, string> = {
  budget: 'Keep it light',
  balanced: 'A good balance',
  comfortable: 'A little comfort',
  luxury: 'Make it special',
}

function formatBudget(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`
  }
}

function RoveMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <path d="M464 256a208 208 0 1 0 -416 0 208 208 0 1 0 416 0zM0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0zm306.7 69.1L162.4 380.6c-19.4 7.5-38.5-11.6-31-31l55.5-144.3c3.3-8.5 9.9-15.1 18.4-18.4l144.3-55.5c19.4-7.5 38.5 11.6 31 31L325.1 306.7c-3.3 8.5-9.9 15.1-18.4 18.4zM288 256a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z" />
    </svg>
  )
}

function scrollToItinerary() {
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  requestAnimationFrame(() => {
    document.getElementById('itinerary')?.scrollIntoView({ behavior, block: 'start' })
  })
}

function TripItinerary({
  plan,
  isSaved,
  isSaving,
  onSave,
  onStartOver,
}: {
  plan: TripPlan
  isSaved: boolean
  isSaving: boolean
  onSave: () => void
  onStartOver: () => void
}) {
  return (
    <section className="itinerary" id="itinerary" aria-live="polite">
      <div className="itinerary-heading">
        <div>
          <p className="section-note"><span /> YOUR ROAM, THOUGHT THROUGH</p>
          <h2>{plan.title}</h2>
          <p className="itinerary-summary">{plan.summary}</p>
        </div>
        <button className="save-button" type="button" onClick={onSave} disabled={isSaving || isSaved}>
          {isSaving ? <LoaderCircle className="spin" size={16} /> : isSaved ? <Check size={16} /> : <Bookmark size={16} />}
          {isSaving ? 'Saving' : isSaved ? 'Saved to your trips' : 'Save this trip'}
        </button>
      </div>

      <div className="trip-facts">
        <span><MapPin size={16} />{plan.destination}</span>
        <span><Clock3 size={16} />{plan.durationDays} days</span>
        <span><Wallet size={16} />About {formatBudget(plan.estimatedBudgetPerPerson, plan.currency)} per person</span>
      </div>

      <div className="day-list">
        {plan.days.map((day: ItineraryDay) => (
          <article className="day-row" key={day.day}>
            <div className="day-marker">
              <span>Day {day.day}</span>
              <i aria-hidden="true" />
            </div>
            <div className="day-content">
              <h3>{day.title}</h3>
              <div className="day-stops">
                <p><span>Morning</span>{day.morning}</p>
                <p><span>Afternoon</span>{day.afternoon}</p>
                <p><span>Evening</span>{day.evening}</p>
              </div>
              <p className="stay-area"><MapPin size={14} /> Stay around {day.stayArea}</p>
            </div>
          </article>
        ))}
      </div>

      {plan.practicalNotes.length > 0 && (
        <aside className="practical-notes">
          <h3>A few things to know</h3>
          <ul>{plan.practicalNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}</ul>
        </aside>
      )}

      <button className="text-button start-over" type="button" onClick={onStartOver}>
        Plan another trip <ArrowUpRight size={15} />
      </button>
    </section>
  )
}

export default function Page() {
  const [prompt, setPrompt] = useState('')
  const [durationDays, setDurationDays] = useState(5)
  const [travelers, setTravelers] = useState(2)
  const [budget, setBudget] = useState<TravelStyle>('balanced')
  const [interests, setInterests] = useState<string[]>([])
  const [plan, setPlan] = useState<TripPlan | null>(null)
  const [planPrompt, setPlanPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedTripId, setSavedTripId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([])
  const [authOpen, setAuthOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authProvider, setAuthProvider] = useState<'google' | 'email' | null>(null)
  const [supabaseConfigured, setSupabaseConfigured] = useState(true)
  const promptRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setSupabaseConfigured(false)
      return
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('Could not restore Supabase session:', error)
      setUser(data.session?.user ?? null)
    }).catch((error: unknown) => {
      console.error('Could not restore Supabase session:', error)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) {
      setSavedTrips([])
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    let cancelled = false
    supabase
      .from('trip_plans')
      .select('id,title,destination,itinerary,created_at')
      .order('created_at', { ascending: false })
      .limit(20)
      .returns<SavedTrip[]>()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Could not load saved trips:', error)
          setErrorMessage('Your trips could not be loaded. Check that the Supabase trip_plans migration has been applied.')
          return
        }
        setSavedTrips(data ?? [])
      })
    return () => { cancelled = true }
  }, [user])

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setIsGenerating(true)
    setPlan(null)
    setSavedTripId(null)

    const preferences: TripPreferences = { prompt, durationDays, travelers, budget, interests }
    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      })
      const result = await response.json() as { plan?: TripPlan; error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Your itinerary could not be generated.')
      if (!result.plan) throw new Error('The trip planner returned an empty itinerary. Please try again.')
      setPlan(result.plan)
      setPlanPrompt(preferences.prompt.trim())
      scrollToItinerary()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Your itinerary could not be generated. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSave() {
    if (!user) {
      setAuthError('')
      setAuthMessage('')
      setAuthOpen(true)
      return
    }
    if (!plan) return
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setErrorMessage('Saving trips needs Supabase configured. Add the public Supabase URL and key, then reload.')
      return
    }

    setIsSaving(true)
    setErrorMessage('')
    try {
      const { data, error } = await supabase
        .from('trip_plans')
        .insert({
          title: plan.title,
          destination: plan.destination,
          itinerary: plan,
          prompt: planPrompt,
        })
        .select('id')
        .single()

      if (error) {
        console.error('Could not save trip:', error)
        setErrorMessage('This trip could not be saved. Check the Supabase setup and try again.')
      } else {
        setSavedTripId(data.id)
        setSavedTrips((current) => [{
          id: data.id,
          title: plan.title,
          destination: plan.destination,
          itinerary: plan,
          created_at: new Date().toISOString(),
        }, ...current])
      }
    } catch (error) {
      console.error('Could not save trip:', error)
      setErrorMessage('This trip could not be saved because Supabase could not be reached.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleEmailSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')
    setAuthMessage('')
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setAuthError('Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) to your environment first.')
      return
    }

    setAuthBusy(true)
    setAuthProvider('email')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) {
        console.error('Supabase email sign-in failed:', error)
        setAuthError(error.message)
      } else {
        setAuthMessage('Check your inbox for a secure sign-in link. You can close this window after you open it.')
      }
    } catch (error) {
      console.error('Supabase email sign-in failed:', error)
      setAuthError('Could not reach Supabase. Check your connection and try again.')
    } finally {
      setAuthBusy(false)
      setAuthProvider(null)
    }
  }

  async function handleGoogleSignIn() {
    setAuthError('')
    setAuthMessage('')
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setAuthError('Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) to your environment first.')
      return
    }

    setAuthBusy(true)
    setAuthProvider('google')
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (error) {
        console.error('Google sign-in failed:', error)
        setAuthError(error.message)
        setAuthBusy(false)
        setAuthProvider(null)
      }
    } catch (error) {
      console.error('Google sign-in failed:', error)
      setAuthError('Could not start Google sign-in. Check your connection and Supabase provider setup, then try again.')
      setAuthBusy(false)
      setAuthProvider(null)
    }
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Could not sign out:', error)
        setErrorMessage('You could not be signed out. Please try again.')
      }
    } catch (error) {
      console.error('Could not sign out:', error)
      setErrorMessage('You could not be signed out because Supabase could not be reached.')
    }
  }

  function openSavedTrip(trip: SavedTrip) {
    setPlan(trip.itinerary)
    setPlanPrompt('')
    setPrompt('')
    setSavedTripId(trip.id)
    scrollToItinerary()
  }

  function startOver() {
    setPlan(null)
    setPlanPrompt('')
    setSavedTripId(null)
    setErrorMessage('')
    promptRef.current?.focus()
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    document.getElementById('planner')?.scrollIntoView({ behavior, block: 'center' })
  }

  return (
    <main className="rove-page">
      <div className="ambient-wash" aria-hidden="true" />
      <div className="backdrop" aria-hidden="true">
        <img src="https://zxdefgavgwfxastwmmjm.supabase.co/storage/v1/object/public/assets/rove.png" alt="" />
      </div>

      <nav className="site-nav" aria-label="Main navigation">
        <a className="wordmark" href="#top"><RoveMark className="brand-mark" />ROVE</a>
        <div className="nav-links">
          <a href="#discover">Discover</a>
          <a href="#how-it-works">How it works</a>
          <a href="#faqs">FAQs</a>
        </div>
        <div className="nav-actions">
          {user ? (
            <a className="login" href="#saved-trips">My trips</a>
          ) : (
            <button className="login" type="button" onClick={() => { setAuthOpen(true); setAuthError(''); setAuthMessage('') }}>Login</button>
          )}
          <a className="nav-cta" href="#planner">Plan my trip <ArrowUpRight size={15} strokeWidth={1.8} /></a>
        </div>
      </nav>

      <section className="hero" id="top">
        <p className="kicker"><span /> A LITTLE LESS PLANNING, A LOT MORE GOING <span /></p>
        <h1>Where should we<br />take <em>you?</em></h1>
        <p className="subline">Tell Rove where you&apos;re headed and what you love. We&apos;ll find a way to make it yours.</p>

        <div className="planner-wrap" id="planner">
          <form className="planner-form" onSubmit={handleGenerate}>
            <label className="prompt-label" htmlFor="trip-prompt">What kind of trip are you dreaming about?</label>
            <textarea
              ref={promptRef}
              id="trip-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="A quiet week in the Dolomites, great hikes, lovely little inns..."
              minLength={8}
              maxLength={1200}
              required
              rows={2}
            />
            <div className="preference-row">
              <label className="select-wrap">
                <Clock3 size={15} />
                <span className="sr-only">Trip length</span>
                <select value={durationDays} onChange={(event) => setDurationDays(Number(event.target.value))}>
                  {[3, 5, 7, 10, 14].map((days) => <option key={days} value={days}>{days} days</option>)}
                </select>
                <ChevronDown size={13} />
              </label>
              <label className="select-wrap">
                <Users size={15} />
                <span className="sr-only">Number of travelers</span>
                <select value={travelers} onChange={(event) => setTravelers(Number(event.target.value))}>
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'traveler' : 'travelers'}</option>)}
                </select>
                <ChevronDown size={13} />
              </label>
              <label className="select-wrap budget-select">
                <Wallet size={15} />
                <span className="sr-only">Budget style</span>
                <select value={budget} onChange={(event) => setBudget(event.target.value as TravelStyle)}>
                  {Object.entries(budgetLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <ChevronDown size={13} />
              </label>
              <button className="plan-btn" type="submit" disabled={isGenerating}>
                {isGenerating ? <><LoaderCircle className="spin" size={16} />Finding your way</> : <>Plan my trip <ChevronRight size={17} /></>}
              </button>
            </div>
            <fieldset className="interest-field">
              <legend>What would you love more of?</legend>
              <div className="interest-list">
                {interestOptions.map((interest) => {
                  const selected = interests.includes(interest)
                  return (
                    <button
                      key={interest}
                      type="button"
                      className={`interest-chip${selected ? ' selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => setInterests((current) => selected ? current.filter((item) => item !== interest) : [...current, interest])}
                    >
                      {selected && <Check size={12} />}{interest}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          </form>

          <div className="chips" aria-label="Trip ideas">
            {promptSuggestions.map((suggestion) => (
              <button key={suggestion.label} type="button" onClick={() => { setPrompt(suggestion.prompt); promptRef.current?.focus() }}>
                <span aria-hidden="true" />{suggestion.label}
              </button>
            ))}
          </div>
          <p className="privacy-note"><Sparkles size={13} /> Your trip notes go to Google Gemini to make this first draft.</p>
        </div>

        {errorMessage && <p className="error-message" role="alert">{errorMessage}</p>}

        {plan && (
          <TripItinerary
            plan={plan}
            isSaved={Boolean(savedTripId)}
            isSaving={isSaving}
            onSave={handleSave}
            onStartOver={startOver}
          />
        )}
      </section>

      {user && (
        <section className="saved-section" id="saved-trips">
          <div className="section-heading">
            <div>
              <p className="section-note"><span /> YOUR JOURNEYS</p>
              <h2>Good trips are worth keeping.</h2>
            </div>
            <button className="text-button" type="button" onClick={handleSignOut}>Sign out</button>
          </div>
          {savedTrips.length ? (
            <div className="saved-list">
              {savedTrips.map((trip) => (
                <button className="saved-trip" type="button" key={trip.id} onClick={() => openSavedTrip(trip)}>
                  <span className="saved-trip-icon"><MapPin size={17} /></span>
                  <span className="saved-trip-copy"><strong>{trip.title}</strong><small>{trip.destination} · {trip.itinerary.durationDays} days</small></span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-saved">No saved trips yet. Make a plan you want to come back to.</p>
          )}
        </section>
      )}

      <section className="discover-section" id="discover">
        <div className="section-heading">
          <div>
            <p className="section-note"><span /> THE GOOD PART STARTS HERE</p>
            <h2>Less tab-hopping.<br />More there-you-are.</h2>
          </div>
          <p className="section-intro">A useful starting point, shaped around how you want to travel — not another list of things you should do.</p>
        </div>
        <div className="discover-grid">
          <article><MapPin size={19} /><h3>Routes that make sense</h3><p>Days flow from one place to the next, with room to slow down along the way.</p></article>
          <article><Compass size={19} /><h3>Your kind of days</h3><p>Set the pace, budget, and little things you travel for. The plan follows your lead.</p></article>
          <article><Bookmark size={19} /><h3>Yours to keep</h3><p>Sign in to save a trip, pick it up later, or start planning another one.</p></article>
        </div>
      </section>

      <section className="how-section" id="how-it-works">
        <p className="section-note"><span /> FROM DAYDREAM TO DEPARTURE</p>
        <h2>Start with a feeling.<br />Leave with a plan.</h2>
        <div className="how-steps">
          <p><span>First</span>Tell us where you want to go, or what you want the trip to feel like.</p>
          <p><span>Then</span>Choose your pace, group size, and the things you want more of.</p>
          <p><span>Finally</span>Get a day-by-day route you can refine, save, and make your own.</p>
        </div>
      </section>

      <section className="faq-section" id="faqs">
        <div>
          <p className="section-note"><span /> A FEW GOOD QUESTIONS</p>
          <h2>Before you go.</h2>
        </div>
        <div className="faq-list">
          <details><summary>Can I plan without an account?<ChevronDown size={16} /></summary><p>Yes. You can generate an itinerary first. Sign in with your email only when you want to save it.</p></details>
          <details><summary>Can I change the itinerary?<ChevronDown size={16} /></summary><p>Use the plan as a starting point. Your trip details and interests help shape what Rove suggests; you can adjust your prompt and make another draft at any time.</p></details>
          <details><summary>Are prices and opening hours guaranteed?<ChevronDown size={16} /></summary><p>No. Budget figures are broad estimates, and opening hours or availability can change. Check current local details before booking or setting out.</p></details>
        </div>
      </section>

      <footer className="site-footer">
        <a className="wordmark" href="#top"><RoveMark className="brand-mark" />ROVE</a>
        <p>Go somewhere that feels like you.</p>
        <a className="text-button" href="#planner">Plan a trip <ArrowUpRight size={15} /></a>
      </footer>

      {authOpen && (
        <div className="modal-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === 'Escape') setAuthOpen(false) }} onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false) }}>
          <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="modal-close" type="button" aria-label="Close sign-in window" onClick={() => setAuthOpen(false)}><X size={18} /></button>
            <span className="modal-mark"><RoveMark /></span>
            <p className="section-note"><span /> KEEP THE GOOD ONES</p>
            <h2 id="auth-title">Your trips, right where you left them.</h2>
            <p className="auth-copy">Sign in with Google or get a secure link by email.</p>
            <button className="google-sign-in" type="button" onClick={handleGoogleSignIn} disabled={authBusy || !supabaseConfigured}>
              {authProvider === 'google' ? <LoaderCircle className="spin" size={17} /> : (
                <svg viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z" />
                  <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.1c-1.8 1.2-4 1.9-6.8 1.9-5.2 0-9.6-3.5-11.2-8.2H5.9v5.2A20 20 0 0 0 24 44Z" />
                  <path fill="#FBBC05" d="M12.8 27.7a12 12 0 0 1 0-7.4v-5.2H5.9a20 20 0 0 0 0 17.8l6.9-5.2Z" />
                  <path fill="#EA4335" d="M24 12.1c3 0 5.7 1 7.8 3.1l5.9-5.9A19.7 19.7 0 0 0 24 4 20 20 0 0 0 5.9 15.1l6.9 5.2c1.6-4.7 6-8.2 11.2-8.2Z" />
                </svg>
              )}
              {authProvider === 'google' ? 'Connecting to Google' : 'Continue with Google'}
            </button>
            <div className="auth-divider"><span>or continue with email</span></div>
            <form className="auth-form" onSubmit={handleEmailSignIn}>
              <label htmlFor="sign-in-email">Email address</label>
              <input id="sign-in-email" type="email" autoComplete="email" autoFocus required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" disabled={authBusy} />
              <button className="plan-btn" type="submit" disabled={authBusy}>
                {authProvider === 'email' ? <><LoaderCircle className="spin" size={16} />Sending link</> : <>Email me a sign-in link <ArrowUpRight size={15} /></>}
              </button>
            </form>
            {authMessage && <p className="auth-message" role="status">{authMessage}</p>}
            {authError && <p className="auth-error" role="alert">{authError}</p>}
            {!supabaseConfigured && <p className="auth-error">Supabase isn&apos;t configured for this app yet. Add the project URL and public key to your environment.</p>}
          </section>
        </div>
      )}
    </main>
  )
}
