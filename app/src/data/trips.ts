export type TripStop = {
  stop_id: string
  stop_name: string
  seq: number
  /** Arrival, as seconds since midnight Japan time. */
  arr: number
  /** Departure, as seconds since midnight Japan time. */
  dep: number
  /** Metres along the trip's shape, guaranteed non-decreasing across stops. */
  dist: number
}

export type TripEntry = {
  trip_id: string
  route_id: string
  shape_id: string
  headsign: string
  direction_id: number
  /** First stop's departure, as seconds since midnight Japan time. */
  start: number
  /** Last stop's arrival, as seconds since midnight Japan time. */
  end: number
  shape_length: number
  stops: TripStop[]
}

import tripsJson from './trips.json'

export const tripsById = tripsJson as unknown as Record<string, TripEntry>

/** Stable array for the per-tick sweep over in-progress trips. */
export const allTrips = Object.values(tripsById)
