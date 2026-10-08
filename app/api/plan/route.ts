import { NextResponse } from 'next/server'
import { isTripPlan, type TripPreferences } from '@/lib/trip-plan'

export const runtime = 'nodejs'

function isTripPreferences(value: unknown): value is TripPreferences {
  if (typeof value !== 'object' || value === null) return false
  const preferences = value as Record<string, unknown>
  return (
    typeof preferences.prompt === 'string' &&
    preferences.prompt.trim().length >= 8 &&
    preferences.prompt.length <= 1200 &&
    typeof preferences.durationDays === 'number' &&
    Number.isInteger(preferences.durationDays) &&
    preferences.durationDays >= 1 &&
    preferences.durationDays <= 21 &&
    typeof preferences.travelers === 'number' &&
    Number.isInteger(preferences.travelers) &&
    preferences.travelers >= 1 &&
    preferences.travelers <= 12 &&
    ['budget', 'balanced', 'comfortable', 'luxury'].includes(String(preferences.budget)) &&
    Array.isArray(preferences.interests) &&
    preferences.interests.length <= 8 &&
    preferences.interests.every((interest) => typeof interest === 'string' && interest.length <= 40)
  )
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Trip generation is not configured yet. Add GEMINI_API_KEY to the server environment.' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Send trip details as valid JSON.' }, { status: 400 })
  }

  if (!isTripPreferences(body)) {
    return NextResponse.json({ error: 'Add a trip description and check the trip details.' }, { status: 400 })
  }

  const prompt = [
    'Create a realistic, useful travel itinerary based on the traveler preferences below.',
    'Use current general travel knowledge; do not invent exact opening hours, prices, or availability.',
    'Keep activities geographically sensible and include a relaxed pace with practical alternatives.',
    'Return only JSON matching the requested response schema.',
    `Trip description: ${body.prompt.trim()}`,
    `Duration: ${body.durationDays} days`,
    `Travelers: ${body.travelers}`,
    `Budget style: ${body.budget}`,
    `Interests: ${body.interests.length ? body.interests.join(', ') : 'use the trip description'}`,
    'Estimate an appropriate total on-the-ground budget per person; state the currency as an ISO 4217 code.',
  ].join('\n')

  let response: Response
  try {
    response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                destination: { type: 'STRING' },
                summary: { type: 'STRING' },
                durationDays: { type: 'INTEGER' },
                estimatedBudgetPerPerson: { type: 'NUMBER' },
                currency: { type: 'STRING' },
                days: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      day: { type: 'INTEGER' },
                      title: { type: 'STRING' },
                      morning: { type: 'STRING' },
                      afternoon: { type: 'STRING' },
                      evening: { type: 'STRING' },
                      stayArea: { type: 'STRING' },
                    },
                    required: ['day', 'title', 'morning', 'afternoon', 'evening', 'stayArea'],
                  },
                },
                practicalNotes: { type: 'ARRAY', items: { type: 'STRING' } },
              },
              required: [
                'title',
                'destination',
                'summary',
                'durationDays',
                'estimatedBudgetPerPerson',
                'currency',
                'days',
                'practicalNotes',
              ],
            },
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        }),
        signal: AbortSignal.timeout(45_000),
      },
    )
  } catch (error) {
    console.error('Gemini request failed:', error)
    return NextResponse.json({ error: 'Could not reach the trip planner. Please try again.' }, { status: 502 })
  }

  if (!response.ok) {
    console.error('Gemini API returned an error:', response.status)
    return NextResponse.json({ error: 'The trip planner could not generate an itinerary right now.' }, { status: 502 })
  }

  let generated: unknown
  try {
    const payload: unknown = await response.json()
    const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates
    const text = candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('')
    if (!text) throw new Error('Gemini returned an empty response.')
    generated = JSON.parse(text)
  } catch (error) {
    console.error('Could not parse Gemini itinerary:', error)
    return NextResponse.json({ error: 'The trip planner returned an invalid itinerary. Please try again.' }, { status: 502 })
  }

  if (
    !isTripPlan(generated) ||
    generated.durationDays !== body.durationDays ||
    generated.days.length !== body.durationDays ||
    generated.days.some((day, index) => day.day !== index + 1)
  ) {
    console.error('Gemini returned an itinerary with an unexpected structure or duration.')
    return NextResponse.json({ error: 'The trip planner returned an incomplete itinerary. Please try again.' }, { status: 502 })
  }

  return NextResponse.json({ plan: generated })
}
