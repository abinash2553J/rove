import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

type GeocodingResult = {
  lat?: string
  lon?: string
}

export async function GET(request: Request) {
  const destination = new URL(request.url).searchParams.get('destination')?.trim()
  if (!destination || destination.length > 200) {
    return NextResponse.json({ error: 'Provide a destination to look up.' }, { status: 400 })
  }

  const search = new URL('https://nominatim.openstreetmap.org/search')
  search.searchParams.set('format', 'jsonv2')
  search.searchParams.set('limit', '1')
  search.searchParams.set('q', destination)

  let response: Response
  try {
    response = await fetch(search, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ROVE Trip Planner/1.0',
      },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(8_000),
    })
  } catch (error) {
    console.error('OpenStreetMap destination lookup failed:', error)
    return NextResponse.json({ error: 'The map is temporarily unavailable.' }, { status: 502 })
  }

  if (!response.ok) {
    console.error('OpenStreetMap geocoder returned an error:', response.status)
    return NextResponse.json({ error: 'The map is temporarily unavailable.' }, { status: 502 })
  }

  let results: unknown
  try {
    results = await response.json()
  } catch (error) {
    console.error('Could not parse OpenStreetMap geocoder response:', error)
    return NextResponse.json({ error: 'The map returned an invalid location.' }, { status: 502 })
  }

  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ error: 'This destination could not be found.' }, { status: 404 })
  }

  const result = results[0] as GeocodingResult
  const latitude = Number(result.lat)
  const longitude = Number(result.lon)
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    console.error('OpenStreetMap returned invalid destination coordinates.')
    return NextResponse.json({ error: 'The map returned an invalid location.' }, { status: 502 })
  }

  return NextResponse.json({ latitude, longitude })
}
