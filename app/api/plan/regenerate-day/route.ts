import { NextResponse } from 'next/server'
import { isItineraryDay, isTripPlan } from '@/lib/trip-plan'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Trip generation is not configured yet. Add GEMINI_API_KEY to the server environment.' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Send day details as valid JSON.' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Add the day and trip details to regenerate.' }, { status: 400 })
  }

  const input = body as Record<string, unknown>
  if (
    !isTripPlan(input.plan) ||
    typeof input.dayNumber !== 'number' ||
    !Number.isInteger(input.dayNumber) ||
    typeof input.instruction !== 'string' ||
    input.instruction.trim().length < 3 ||
    input.instruction.length > 500
  ) {
    return NextResponse.json({ error: 'Check the trip details and day-specific instructions.' }, { status: 400 })
  }

  const trip = input.plan
  const dayIndex = trip.days.findIndex((day) => day.day === input.dayNumber)
  if (dayIndex < 0) {
    return NextResponse.json({ error: 'That day is not part of this itinerary.' }, { status: 400 })
  }

  const currentDay = trip.days[dayIndex]
  const previousDay = trip.days[dayIndex - 1]
  const nextDay = trip.days[dayIndex + 1]
  const travelDate = trip.startDate && trip.endDate
    ? new Date(Date.parse(`${trip.startDate}T00:00:00Z`) + (currentDay.day - 1) * 86_400_000).toISOString().slice(0, 10)
    : undefined
  const prompt = [
    'Revise exactly one day of this travel itinerary. Keep it realistic, geographically sensible, and consistent with the full trip.',
    'Do not invent exact opening hours, prices, or availability. Return only JSON matching the requested one-day schema.',
    `Destination: ${trip.destination}`,
    `Whole trip: ${trip.title}. ${trip.summary}`,
    ...(travelDate ? [`Travel date for this day: ${travelDate}. Account for the season and day of week.`] : []),
    previousDay ? `Previous day for continuity: ${JSON.stringify(previousDay)}` : 'This is the first day of the trip.',
    `Day to revise: ${JSON.stringify(currentDay)}`,
    nextDay ? `Next day for continuity: ${JSON.stringify(nextDay)}` : 'This is the last day of the trip.',
    `Traveler's request: ${input.instruction.trim()}`,
  ].join('\n')

  let response: Response
  try {
    response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
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
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
      signal: AbortSignal.timeout(45_000),
    })
  } catch (error) {
    console.error('Gemini day regeneration request failed:', error)
    return NextResponse.json({ error: 'Could not reach the trip planner. Please try again.' }, { status: 502 })
  }

  if (!response.ok) {
    console.error('Gemini day regeneration returned an error:', response.status)
    return NextResponse.json({ error: 'This day could not be regenerated right now.' }, { status: 502 })
  }

  let day: unknown
  try {
    const payload: unknown = await response.json()
    const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates
    const text = candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('')
    if (!text) throw new Error('Gemini returned an empty day.')
    day = JSON.parse(text)
  } catch (error) {
    console.error('Could not parse regenerated itinerary day:', error)
    return NextResponse.json({ error: 'The trip planner returned an invalid day. Please try again.' }, { status: 502 })
  }

  if (!isItineraryDay(day) || day.day !== input.dayNumber) {
    console.error('Gemini returned a regenerated day with an unexpected structure.')
    return NextResponse.json({ error: 'The trip planner returned an incomplete day. Please try again.' }, { status: 502 })
  }

  return NextResponse.json({ day })
}
