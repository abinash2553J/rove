import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!accessToken) return NextResponse.json({ error: 'Sign in to create an expense split.' }, { status: 401 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.json({ error: 'Trip Split is not configured.' }, { status: 503 })

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !user) return NextResponse.json({ error: 'Your sign-in session has expired. Sign in and try again.' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Send valid JSON.' }, { status: 400 }) }
  const tripId = body && typeof body === 'object' ? (body as Record<string, unknown>).tripId : null
  if (typeof tripId !== 'string' || !/^[0-9a-f-]{36}$/i.test(tripId)) {
    return NextResponse.json({ error: 'Choose a saved trip first.' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('create_trip_split', { p_trip_id: tripId })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ inviteToken: data.inviteToken })
}
