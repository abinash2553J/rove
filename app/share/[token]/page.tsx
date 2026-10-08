'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowUpRight, CalendarDays, Clock3, Compass, LoaderCircle, MapPin, Wallet } from 'lucide-react'
import { DestinationMap } from '@/app/components/destination-map'
import { isTripPlan, type TripPlan } from '@/lib/trip-plan'

type SharedTrip = {
  title: string
  destination: string
  itinerary: TripPlan
}

function formatBudget(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`
  }
}

function formatDateRange(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${formatter.format(new Date(`${startDate}T00:00:00Z`))} – ${formatter.format(new Date(`${endDate}T00:00:00Z`))}`
}

export default function SharedTripPage({ params }: { params: Promise<{ token: string }> }) {
  const [trip, setTrip] = useState<SharedTrip | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    params.then(({ token: shareToken }) => {
      if (cancelled) return
      fetch(`/api/share/${encodeURIComponent(shareToken)}`)
        .then(async (response) => {
          const result = await response.json() as { trip?: SharedTrip; error?: string }
          if (!response.ok) throw new Error(result.error ?? 'This trip could not be loaded.')
          if (!result.trip || !isTripPlan(result.trip.itinerary)) throw new Error('This shared trip has invalid itinerary data.')
          if (!cancelled) setTrip(result.trip)
        })
        .catch((requestError: unknown) => {
          if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'This trip could not be loaded.')
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false)
        })
    }).catch((requestError: unknown) => {
      if (!cancelled) {
        setError(requestError instanceof Error ? requestError.message : 'This trip link is not valid.')
        setIsLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [params])

  return (
    <main className="shared-page">
      <div className="shared-shell">
        <header className="shared-nav">
          <a className="wordmark" href="/"><Compass className="brand-mark" />ROVE</a>
          <span>Trip shared with you</span>
        </header>

        {isLoading ? (
          <div className="shared-message" role="status"><LoaderCircle className="spin" size={19} /> Loading this trip…</div>
        ) : trip ? (
          <article className="shared-itinerary">
            <header className="shared-heading">
              <div>
                <p className="section-note"><span /> A JOURNEY TO KEEP</p>
                <h1>{trip.title}</h1>
                <p>{trip.itinerary.summary}</p>
              </div>
              <a className="nav-cta shared-cta" href="/#planner">Plan your own <ArrowUpRight size={15} /></a>
            </header>

            <div className="trip-facts">
              <span><MapPin size={16} />{trip.destination}</span>
              <span><Clock3 size={16} />{trip.itinerary.durationDays} days</span>
              {trip.itinerary.startDate && trip.itinerary.endDate && (
                <span><CalendarDays size={16} />{formatDateRange(trip.itinerary.startDate, trip.itinerary.endDate)}</span>
              )}
              <span><Wallet size={16} />About {formatBudget(trip.itinerary.estimatedBudgetPerPerson, trip.itinerary.currency)} per person</span>
            </div>

            <DestinationMap destination={trip.destination} />

            <div className="day-list">
              {trip.itinerary.days.map((day) => (
                <article className="day-row" key={day.day}>
                  <div className="day-marker"><span>Day {day.day}</span><i aria-hidden="true" /></div>
                  <div className="day-content">
                    <h2>{day.title}</h2>
                    <div className="day-stops">
                      {(['morning', 'afternoon', 'evening'] as const).map((period) => (
                        <p key={period}><span>{period}</span>{day[period]}</p>
                      ))}
                    </div>
                    <p className="stay-area"><MapPin size={13} />Stay around {day.stayArea}</p>
                  </div>
                </article>
              ))}
            </div>

            {trip.itinerary.practicalNotes.length > 0 && (
              <aside className="practical-notes">
                <h2>A few things to know</h2>
                <ul>{trip.itinerary.practicalNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}</ul>
              </aside>
            )}
            <a className="text-button shared-back" href="/"><ArrowLeft size={15} /> Explore ROVE</a>
          </article>
        ) : (
          <section className="shared-message shared-error" role="alert">
            <h1>This trip isn&apos;t available</h1>
            <p>{error || 'The owner may have turned off sharing for this link.'}</p>
            <a className="nav-cta shared-cta" href="/">Back to ROVE <ArrowUpRight size={15} /></a>
          </section>
        )}
        <footer className="shared-footer">ROVE · Go somewhere that feels like you.</footer>
      </div>
    </main>
  )
}
