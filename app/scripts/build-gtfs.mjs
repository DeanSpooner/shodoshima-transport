// Converts the GTFS static feed in ../data-1 into GeoJSON/JSON the app can fetch statically.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Papa from 'papaparse'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GTFS_DIR = path.resolve(__dirname, '../../data-1')
const OUT_DIR = path.resolve(__dirname, '../src/data')

mkdirSync(OUT_DIR, { recursive: true })

function readCsv(name) {
  const raw = readFileSync(path.join(GTFS_DIR, name), 'utf-8')
  const { data } = Papa.parse(raw, { header: true, skipEmptyLines: true })
  return data
}

const stops = readCsv('stops.txt')
const routes = readCsv('routes.txt')
const trips = readCsv('trips.txt')
const stopTimes = readCsv('stop_times.txt')
const shapes = readCsv('shapes.txt')

// stops -> GeoJSON FeatureCollection
const stopsGeojson = {
  type: 'FeatureCollection',
  features: stops.map((s) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [Number(s.stop_lon), Number(s.stop_lat)],
    },
    properties: {
      stop_id: s.stop_id,
      stop_name: s.stop_name,
      zone_id: s.zone_id,
    },
  })),
}

// shapes -> one LineString per shape_id, ordered by shape_pt_sequence
const shapesByRouteId = new Map()
for (const row of shapes) {
  const id = row.shape_id
  if (!shapesByRouteId.has(id)) shapesByRouteId.set(id, [])
  shapesByRouteId.get(id).push(row)
}
for (const points of shapesByRouteId.values()) {
  points.sort((a, b) => Number(a.shape_pt_sequence) - Number(b.shape_pt_sequence))
}

// map route_id -> shape_id via trips (first trip found per route)
const shapeIdByRouteId = new Map()
for (const t of trips) {
  if (t.route_id && t.shape_id && !shapeIdByRouteId.has(t.route_id)) {
    shapeIdByRouteId.set(t.route_id, t.shape_id)
  }
}

const routesGeojson = {
  type: 'FeatureCollection',
  features: routes
    .map((r) => {
      const shapeId = shapeIdByRouteId.get(r.route_id)
      const points = shapeId ? shapesByRouteId.get(shapeId) : undefined
      if (!points) return null
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: points.map((p) => [Number(p.shape_pt_lon), Number(p.shape_pt_lat)]),
        },
        properties: {
          route_id: r.route_id,
          route_short_name: r.route_short_name,
          route_long_name: r.route_long_name,
        },
      }
    })
    .filter(Boolean),
}

// trips + stop_times -> schedule per stop_id: [{ trip_id, route_id, arrival_time, departure_time, stop_sequence, headsign }]
const tripById = new Map(trips.map((t) => [t.trip_id, t]))
const scheduleByStopId = {}
for (const st of stopTimes) {
  const trip = tripById.get(st.trip_id)
  if (!trip) continue
  if (!scheduleByStopId[st.stop_id]) scheduleByStopId[st.stop_id] = []
  scheduleByStopId[st.stop_id].push({
    trip_id: st.trip_id,
    route_id: trip.route_id,
    arrival_time: st.arrival_time,
    departure_time: st.departure_time,
    stop_sequence: Number(st.stop_sequence),
    headsign: trip.trip_headsign,
  })
}
for (const entries of Object.values(scheduleByStopId)) {
  entries.sort((a, b) => a.departure_time.localeCompare(b.departure_time))
}

writeFileSync(path.join(OUT_DIR, 'stops.geojson.json'), JSON.stringify(stopsGeojson))
writeFileSync(path.join(OUT_DIR, 'routes.geojson.json'), JSON.stringify(routesGeojson))
writeFileSync(path.join(OUT_DIR, 'schedule.json'), JSON.stringify(scheduleByStopId))

console.log(`Wrote ${stops.length} stops, ${routesGeojson.features.length} route shapes, schedules for ${Object.keys(scheduleByStopId).length} stops`)
