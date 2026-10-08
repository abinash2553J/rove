import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isTripPlan } from '@/lib/trip-plan'

export const runtime = 'nodejs'

const shareTokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!shareTokenPattern.test(token)) {
    return NextResponse.json({ error: 'This shared trip link is not valid.' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Shared trips are not available because Supabase is not configured.' }, { status: 503 })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await supabase.rpc('get_shared_trip', { p_share_token: token })
    if (error) {
      console.error('Could not load shared trip:', error)
      return NextResponse.json({ error: 'This shared trip could not be loaded.' }, { status: 503 })
    }

    const trip = Array.isArray(data) ? data[0] : null
    if (!trip || typeof trip.title !== 'string' || typeof trip.destination !== 'string' || !isTripPlan(trip.itinerary)) {
      return NextResponse.json({ error: 'This shared trip is unavailable. The link may have been turned off.' }, { status: 404 })
    }

    return NextResponse.json({
      trip: {
        title: trip.title,
        destination: trip.destination,
        itinerary: trip.itinerary,
      },
    })
  } catch (error) {
    console.error('Could not reach Supabase for shared trip:', error)
    return NextResponse.json({ error: 'This shared trip could not be loaded. Please try again.' }, { status: 502 })
  }
}
