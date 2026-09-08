import { useEffect, useState } from 'react'
import type { Feature, FeatureCollection, Point } from 'geojson'
import { allTrips, type TripEntry } from '../data/trips'
import { shapesById } from '../data/shapes'
import { getJapanSecondsSinceMidnight } from './time'

export type BusProperties = {
  trip_id: string
  route_id: string
  headsign: string
  origin_name: string
  destination_name: string
  next_stop_name: string
  next_stop_time: number
}


/**
 * Converts a distance along a shape back into a coordinate, by binary
 * searching the shape's cumulative distance table (~10 comparisons for an
 * 850-point shape) and interpolating between the bracketing vertices.
 */
function coordAtDistance(shapeId: string, dist: number): [number, number] | null {
  const shape = shapesById[shapeId]
  if (!shape) return null

  const { coords, cum } = shape
  const d = Math.min(Math.max(dist, 0), shape.length)

  let lo = 0
  let hi = cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= d) lo = mid
    else hi = mid
  }

  const span = cum[hi] - cum[lo]
  const t = span === 0 ? 0 : (d - cum[lo]) / span
  const [ax, ay] = coords[lo]
  const [bx, by] = coords[hi]
  return [ax + (bx - ax) * t, ay + (by - ay) * t]
}

/**
 * Where a trip's bus is at `now`, or null if it isn't running. Interpolates
 * from the earlier stop's departure to the later stop's arrival, so a bus with
 * dwell time waits at the stop rather than creeping through it.
 */
export function positionForTrip(
  trip: TripEntry,
  now: number,
): { coord: [number, number]; nextStopIndex: number } | null {
  if (now < trip.start || now > trip.end) return null

  const stops = trip.stops
  let i = 0
  while (i < stops.length - 2 && now >= stops[i + 1].arr) i++

  const from = stops[i]
  const to = stops[i + 1]

  if (now <= from.dep) {
    const coord = coordAtDistance(trip.shape_id, from.dist)
    return coord ? { coord, nextStopIndex: i + 1 } : null
  }

  const span = to.arr - from.dep
  const t = span <= 0 ? 1 : (now - from.dep) / span
  const coord = coordAtDistance(trip.shape_id, from.dist + (to.dist - from.dist) * t)
  return coord ? { coord, nextStopIndex: i + 1 } : null
}

export function buildBusFeatures(now: number): FeatureCollection<Point, BusProperties> {
  const features: Feature<Point, BusProperties>[] = []

  for (const trip of allTrips) {
    const position = positionForTrip(trip, now)
    if (!position) continue

    const nextStop = trip.stops[position.nextStopIndex]
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: position.coord },
      properties: {
        trip_id: trip.trip_id,
        route_id: trip.route_id,
        headsign: trip.headsign,
        origin_name: trip.stops[0].stop_name,
        destination_name: trip.stops[trip.stops.length - 1].stop_name,
        next_stop_name: nextStop.stop_name,
        next_stop_time: nextStop.arr,
      },
    })
  }

  return { type: 'FeatureCollection', features }
}

/**
 * Recomputes bus positions on every animation frame so they glide rather than
 * hop. requestAnimationFrame (not setInterval) keeps the updates aligned with
 * the browser's paint cycle, matches the display's refresh rate, and pauses
 * automatically in background tabs.
 *
 * Reading the wall clock fresh each frame - rather than accumulating deltas -
 * means a slept tab resumes at the correct position and midnight rolls over
 * for free.
 */
export function useBusPositions(): FeatureCollection<Point, BusProperties> {
  const [features, setFeatures] = useState(() =>
    buildBusFeatures(getJapanSecondsSinceMidnight()),
  )

  useEffect(() => {
    let frame = 0

    function tick() {
      setFeatures(buildBusFeatures(getJapanSecondsSinceMidnight()))
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return features
}
