'use client'

import { use, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { ArrowLeft, LoaderCircle, Users } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default function TripInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [user, setUser] = useState<User | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setError('Trip invites need Supabase configured.')
      setIsCheckingSession(false)
      return
    }
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) console.error('Could not restore the trip-invite session:', sessionError)
      setUser(data.session?.user ?? null)
      setIsCheckingSession(false)
    }).catch((sessionError: unknown) => {
      console.error('Could not restore the trip-invite session:', sessionError)
      setError('Your sign-in could not be checked. Please try again.')
      setIsCheckingSession(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setIsCheckingSession(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user || isCheckingSession) return
    if (!uuidPattern.test(token)) {
      setError('This invitation link is not valid.')
      return
    }

    let cancelled = false
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    setIsJoining(true)
    void (async () => {
      try {
        const { data, error: joinError } = await supabase.rpc('accept_trip_invite', { p_token: token })
        if (cancelled) return
        if (joinError || typeof data !== 'string') {
          console.error('Could not accept trip expense invite:', joinError)
          setError('This invite is invalid or has been replaced. Ask a trip member for a new one.')
          setIsJoining(false)
          return
        }
        window.location.replace(`/split/${encodeURIComponent(data)}`)
      } catch (joinError) {
        if (cancelled) return
        console.error('Could not accept trip expense invite:', joinError)
        setError('This invitation could not be accepted. Check your connection and try again.')
        setIsJoining(false)
      }
    })
    return () => { cancelled = true }
  }, [isCheckingSession, token, user])

  return (
    <main className="split-page">
      <div className="split-shell">
        <header className="split-nav">
          <a className="wordmark" href="/"><img className="brand-mark" src="/icon.svg" alt="" aria-hidden="true" />ROVE</a>
          <a className="split-back-link" href="/"><ArrowLeft size={15} /> ROVE</a>
        </header>
        <section className="split-panel split-state">
          {isCheckingSession || isJoining ? <LoaderCircle className="spin" size={22} /> : <Users size={24} />}
          <h1>{isCheckingSession ? 'Checking your sign-in…' : isJoining ? 'Joining the trip…' : user ? 'Invite unavailable' : 'Join your group trip'}</h1>
          {error ? <p role="alert">{error}</p> : !user && !isCheckingSession ? <p>Sign in to join this trip and see its shared expenses.</p> : isJoining ? <p>Adding your account to the trip&apos;s private expense group.</p> : null}
          {!user && !isCheckingSession && !error && <a className="split-primary-link" href={`/?invite=${encodeURIComponent(token)}`}>Sign in to join</a>}
          {error && <a className="split-primary-link" href="/">Back to ROVE</a>}
        </section>
      </div>
    </main>
  )
}
