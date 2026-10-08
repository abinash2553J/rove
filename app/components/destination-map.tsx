'use client'

import { useEffect, useRef, useState } from 'react'
import { ExternalLink, LoaderCircle, MapPin } from 'lucide-react'

type MapLocation = {
  latitude: number
  longitude: number
}

function isMapLocation(value: unknown): value is MapLocation {
  if (typeof value !== 'object' || value === null) return false
  const location = value as Record<string, unknown>
  return (
    typeof location.latitude === 'number' &&
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    typeof location.longitude === 'number' &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180
  )
}

export function DestinationMap({ destination }: { destination: string }) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const [location, setLocation] = useState<MapLocation | null>(null)
  const [error, setError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const searchUrl = `https://www.openstreetmap.org/search?query=${encodeURIComponent(destination)}`

  useEffect(() => {
    const controller = new AbortController()
    setLocation(null)
    setError(false)
    setIsLoading(true)

    fetch(`/api/map-location?destination=${encodeURIComponent(destination)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not find this destination.')
        const result: unknown = await response.json()
        if (!isMapLocation(result)) throw new Error('The map returned an invalid location.')
        setLocation(result)
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        setError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [destination])

  useEffect(() => {
    if (!location || !mapElementRef.current || error) return

    let cancelled = false
    let map: import('leaflet').Map | undefined
    void import('leaflet')
      .then((leaflet) => {
        if (cancelled || !mapElementRef.current) return
        map = leaflet.map(mapElementRef.current, { scrollWheelZoom: false }).setView(
          [location.latitude, location.longitude],
          12,
        )
        leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        }).addTo(map)
        leaflet.marker([location.latitude, location.longitude], {
          icon: leaflet.divIcon({
            className: 'rove-map-pin-wrap',
            html: '<span class="rove-map-pin"></span>',
            iconSize: [24, 32],
            iconAnchor: [12, 32],
          }),
          title: destination,
          alt: destination,
        }).addTo(map)
      })
      .catch((mapError: unknown) => {
        if (cancelled) return
        console.error('Could not initialize the destination map:', mapError)
        setError(true)
      })

    return () => {
      cancelled = true
      map?.remove()
    }
  }, [destination, error, location])

  return (
    <section className="destination-map" aria-label={`Map of ${destination}`}>
      <div className="destination-map-heading">
        <div>
          <span className="destination-map-icon"><MapPin size={16} /></span>
          <div>
            <h3>Find your bearings</h3>
            <p>{destination}</p>
          </div>
        </div>
        <a href={searchUrl} target="_blank" rel="noreferrer">
          Open map <ExternalLink size={13} />
        </a>
      </div>
      <div className="destination-map-frame">
        {location && !error ? (
          <div
            className="destination-map-canvas"
            ref={mapElementRef}
            role="application"
            aria-label={`Interactive map of ${destination}. Use plus and minus to zoom, or drag to pan.`}
          />
        ) : (
          <div className="destination-map-message" role={error ? 'status' : undefined}>
            {isLoading ? (
              <><LoaderCircle className="spin" size={17} /> Finding this place on the map…</>
            ) : (
              <>We couldn&apos;t place this destination automatically. <a href={searchUrl} target="_blank" rel="noreferrer">Search the map instead</a>.</>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
