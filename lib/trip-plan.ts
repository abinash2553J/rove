export type TravelStyle = 'budget' | 'balanced' | 'comfortable' | 'luxury'

export type TripPreferences = {
  prompt: string
  durationDays: number
  travelers: number
  budget: TravelStyle
  interests: string[]
}

export type ItineraryDay = {
  day: number
  title: string
  morning: string
  afternoon: string
  evening: string
  stayArea: string
}

export type TripPlan = {
  title: string
  destination: string
  summary: string
  durationDays: number
  estimatedBudgetPerPerson: number
  currency: string
  days: ItineraryDay[]
  practicalNotes: string[]
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

export function isTripPlan(value: unknown): value is TripPlan {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const plan = value as Record<string, unknown>
  return (
    isBoundedText(plan.title, 200) &&
    isBoundedText(plan.destination, 200) &&
    isBoundedText(plan.summary, 1400) &&
    typeof plan.durationDays === 'number' && Number.isInteger(plan.durationDays) &&
    typeof plan.estimatedBudgetPerPerson === 'number' &&
    Number.isFinite(plan.estimatedBudgetPerPerson) && plan.estimatedBudgetPerPerson >= 0 &&
    typeof plan.currency === 'string' && /^[A-Z]{3}$/.test(plan.currency) &&
    Array.isArray(plan.days) &&
    plan.days.length >= 1 && plan.days.length <= 21 &&
    plan.days.every((day) => {
      if (typeof day !== 'object' || day === null || Array.isArray(day)) return false
      const item = day as Record<string, unknown>
      return (
        typeof item.day === 'number' &&
        Number.isInteger(item.day) &&
        ['title', 'morning', 'afternoon', 'evening', 'stayArea'].every((key) =>
          isBoundedText(item[key], 1000)
        )
      )
    }) &&
    Array.isArray(plan.practicalNotes) &&
    plan.practicalNotes.length <= 10 &&
    plan.practicalNotes.every((note) => typeof note === 'string' && note.trim().length > 0 && note.length <= 300)
  )
}
