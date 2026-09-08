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

// shapes -> one ordered point list per shape_id
const shapesById = new Map()
for (const row of shapes) {
  const id = row.shape_id
  if (!shapesById.has(id)) shapesById.set(id, [])
  shapesById.get(id).push(row)
}
for (const points of shapesById.values()) {
  points.sort((a, b) => Number(a.shape_pt_sequence) - Number(b.shape_pt_sequence))
}

// Every shape is one some trip runs on, and a bus must always sit on a drawn
// line, so all shapes are emitted rather than one arbitrary shape per route.
const routeById = new Map(routes.map((r) => [r.route_id, r]))
const routeIdByShapeId = new Map()
for (const t of trips) {
  if (t.shape_id && !routeIdByShapeId.has(t.shape_id)) {
    routeIdByShapeId.set(t.shape_id, t.route_id)
  }
}

const routesGeojson = {
  type: 'FeatureCollection',
  features: [...shapesById.entries()].map(([shapeId, points]) => {
    const routeId = routeIdByShapeId.get(shapeId)
    const route = routeById.get(routeId)
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: points.map((p) => [Number(p.shape_pt_lon), Number(p.shape_pt_lat)]),
      },
      properties: {
        shape_id: shapeId,
        route_id: routeId ?? null,
        route_short_name: route?.route_short_name ?? null,
        route_long_name: route?.route_long_name ?? null,
      },
    }
  }),
}

// --- Geometry -------------------------------------------------------------
// Shodoshima spans ~0.2 degrees, so projecting into a local flat metric plane
// (equirectangular) is accurate to well under a metre and avoids trigonometry
// in the projection inner loop. All distances below are metres.
const EARTH_RADIUS_M = 6371008.8
const DEG = Math.PI / 180
const ISLAND_LAT = 34.49
const METRES_PER_LON_DEG = EARTH_RADIUS_M * DEG * Math.cos(ISLAND_LAT * DEG)
const METRES_PER_LAT_DEG = EARTH_RADIUS_M * DEG

function toXY(lon, lat) {
  return [lon * METRES_PER_LON_DEG, lat * METRES_PER_LAT_DEG]
}

function cumulativeDistances(xy) {
  const cum = [0]
  for (let i = 1; i < xy.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]))
  }
  return cum
}

// Squared perpendicular distance from a point to a segment, plus how far along
// that segment (0..1) the closest point lies. Squared to keep sqrt out of the loop.
function projectOnSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const len2 = vx * vx + vy * vy
  let t = len2 === 0 ? 0 : ((px - ax) * vx + (py - ay) * vy) / len2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = ax + t * vx
  const cy = ay + t * vy
  return { dist2: (px - cx) ** 2 + (py - cy) ** 2, t }
}

// Finds how far along a shape each stop sits.
//
// A naive global nearest-point search is wrong here: several of these shapes
// pass along the same road twice, so consecutive stops can match alternate
// passes and produce distances that go backwards (measured: 7 of 46 trips,
// including route 1's main daily service). A bus built from those would jump
// backwards. Constraining each stop's search to segments at or after the
// previous stop's match keeps the sequence ordered.
function snapStopsToShape(stopsXY, shapeXY, cum) {
  const out = []
  let startSeg = 0
  let prevDist = 0

  for (let s = 0; s < stopsXY.length; s++) {
    const [px, py] = stopsXY[s]
    const remainingAfter = stopsXY.length - 1 - s
    // Leave at least one segment for each later stop so the tail can't be consumed.
    const maxSeg = Math.max(startSeg, shapeXY.length - 2 - remainingAfter)

    let best = { dist2: Infinity, seg: startSeg, t: 0 }
    for (let i = startSeg; i <= maxSeg && i < shapeXY.length - 1; i++) {
      const { dist2, t } = projectOnSegment(
        px, py,
        shapeXY[i][0], shapeXY[i][1],
        shapeXY[i + 1][0], shapeXY[i + 1][1],
      )
      if (dist2 < best.dist2) best = { dist2, seg: i, t }
    }

    const raw = cum[best.seg] + best.t * (cum[best.seg + 1] - cum[best.seg])
    const dist = Math.max(raw, prevDist)
    out.push({ dist, offset: Math.sqrt(best.dist2) })

    prevDist = dist
    // Not seg + 1: two stops can legitimately fall on one long segment.
    startSeg = best.seg
  }

  return out
}

const tripById = new Map(trips.map((t) => [t.trip_id, t]))

const stopTimesByTripId = new Map()
for (const st of stopTimes) {
  if (!stopTimesByTripId.has(st.trip_id)) stopTimesByTripId.set(st.trip_id, [])
  stopTimesByTripId.get(st.trip_id).push(st)
}
for (const rows of stopTimesByTripId.values()) {
  rows.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))
}

// The feed lists each Setouchi Triennale trip once per session (夏会期 summer,
// 秋会期 autumn) with byte-identical routes, shapes and times - the service
// calendar is the only thing telling them apart. Since the calendar is
// deliberately ignored (it expired in 2022, so honouring it would show
// nothing at all), both sessions would otherwise replay simultaneously as
// perfectly overlapping duplicate buses and doubled-up departure times.
const duplicateTripIds = new Set()
const seenTripSignatures = new Set()
for (const trip of trips) {
  const rows = stopTimesByTripId.get(trip.trip_id)
  if (!rows) continue

  const signature = [
    trip.route_id,
    trip.shape_id,
    ...rows.map((r) => `${r.stop_id}@${r.arrival_time}-${r.departure_time}`),
  ].join('|')

  if (seenTripSignatures.has(signature)) duplicateTripIds.add(trip.trip_id)
  else seenTripSignatures.add(signature)
}

// trips + stop_times -> schedule per stop_id: [{ trip_id, route_id, arrival_time, departure_time, stop_sequence, headsign }]
const scheduleByStopId = {}
for (const st of stopTimes) {
  const trip = tripById.get(st.trip_id)
  if (!trip || duplicateTripIds.has(st.trip_id)) continue
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
// GTFS times are H:MM:SS (not zero-padded, and can exceed 24:00:00 for
// past-midnight trips), so they must be compared as elapsed seconds rather
// than as strings.
function timeToSeconds(time) {
  const [h, m, s] = time.split(':').map(Number)
  return h * 3600 + m * 60 + s
}

for (const entries of Object.values(scheduleByStopId)) {
  entries.sort(
    (a, b) => timeToSeconds(a.departure_time) - timeToSeconds(b.departure_time),
  )
}

// --- Shape geometry table (distance -> coordinate at runtime) --------------
const round6 = (n) => Number(n.toFixed(6))
const shapeGeometry = {}
const shapeXYById = new Map()

for (const [shapeId, points] of shapesById) {
  const coords = points.map((p) => [Number(p.shape_pt_lon), Number(p.shape_pt_lat)])
  const xy = coords.map(([lon, lat]) => toXY(lon, lat))
  const cum = cumulativeDistances(xy)

  shapeXYById.set(shapeId, { xy, cum })
  shapeGeometry[shapeId] = {
    coords: coords.map(([lon, lat]) => [round6(lon), round6(lat)]),
    cum: cum.map((d) => Number(d.toFixed(1))),
    length: Number(cum[cum.length - 1].toFixed(1)),
  }
}

// --- Trip index (drives the in-transit bus animation) ---------------------
const stopById = new Map(stops.map((s) => [s.stop_id, s]))

// Snapping depends only on the shape and the stop pattern, not the trip, so
// memoise it: the trips collapse to a handful of distinct patterns.
const snapCache = new Map()
const MAX_EXPECTED_OFFSET_M = 150

const tripsById = {}
let skippedTrips = 0

for (const trip of trips) {
  if (duplicateTripIds.has(trip.trip_id)) continue

  const rows = stopTimesByTripId.get(trip.trip_id)
  const shape = shapeXYById.get(trip.shape_id)
  if (!rows || rows.length < 2 || !shape) {
    skippedTrips++
    continue
  }

  const stopRows = rows.map((r) => ({ row: r, stop: stopById.get(r.stop_id) }))
  const missing = stopRows.filter((s) => !s.stop)
  if (missing.length > 0) {
    // An unmatched stop would yield NaN coordinates and silently poison the
    // whole trip's distance chain, so drop the trip rather than ship it.
    console.warn(
      `Skipping trip ${trip.trip_id}: ${missing.length} stop_time(s) reference unknown stops ` +
        `(${missing.map((s) => s.row.stop_id).join(', ')})`,
    )
    skippedTrips++
    continue
  }

  const cacheKey = `${trip.shape_id}|${rows.map((r) => r.stop_id).join(',')}`
  let snapped = snapCache.get(cacheKey)
  if (!snapped) {
    const stopsXY = stopRows.map(({ stop }) => toXY(Number(stop.stop_lon), Number(stop.stop_lat)))
    snapped = snapStopsToShape(stopsXY, shape.xy, shape.cum)

    // These shapes begin and end at their termini, so pinning removes snapping
    // wobble at the ends. It matters most for the 2-stop express trips, where
    // these two values are the entire basis for interpolation.
    snapped[0] = { ...snapped[0], dist: 0 }
    snapped[snapped.length - 1] = {
      ...snapped[snapped.length - 1],
      dist: shape.cum[shape.cum.length - 1],
    }

    for (let i = 0; i < snapped.length; i++) {
      if (snapped[i].offset > MAX_EXPECTED_OFFSET_M) {
        console.warn(
          `Stop ${rows[i].stop_id} on ${trip.shape_id} is ${Math.round(snapped[i].offset)}m ` +
            `from its shape (trip ${trip.trip_id}) - possible mis-snap`,
        )
      }
    }
    snapCache.set(cacheKey, snapped)
  }

  const tripStops = rows.map((r, i) => ({
    stop_id: r.stop_id,
    stop_name: stopById.get(r.stop_id).stop_name,
    seq: Number(r.stop_sequence),
    arr: timeToSeconds(r.arrival_time),
    dep: timeToSeconds(r.departure_time),
    dist: Number(snapped[i].dist.toFixed(1)),
  }))

  // Fail the build rather than ship a bus that jumps backwards or never moves.
  for (let i = 1; i < tripStops.length; i++) {
    if (tripStops[i].dist < tripStops[i - 1].dist) {
      throw new Error(
        `Trip ${trip.trip_id} has non-monotonic shape distances at stop ${i} ` +
          `(${tripStops[i - 1].dist} -> ${tripStops[i].dist})`,
      )
    }
  }

  const start = tripStops[0].dep
  const end = tripStops[tripStops.length - 1].arr
  if (!(start < end)) {
    throw new Error(`Trip ${trip.trip_id} does not advance in time (${start} -> ${end})`)
  }

  tripsById[trip.trip_id] = {
    trip_id: trip.trip_id,
    route_id: trip.route_id,
    shape_id: trip.shape_id,
    headsign: trip.trip_headsign,
    direction_id: Number(trip.direction_id),
    start,
    end,
    shape_length: shapeGeometry[trip.shape_id].length,
    stops: tripStops,
  }
}

writeFileSync(path.join(OUT_DIR, 'stops.geojson.json'), JSON.stringify(stopsGeojson))
writeFileSync(path.join(OUT_DIR, 'routes.geojson.json'), JSON.stringify(routesGeojson))
writeFileSync(path.join(OUT_DIR, 'schedule.json'), JSON.stringify(scheduleByStopId))
writeFileSync(path.join(OUT_DIR, 'shapes.json'), JSON.stringify(shapeGeometry))
writeFileSync(path.join(OUT_DIR, 'trips.json'), JSON.stringify(tripsById))

const tripCount = Object.keys(tripsById).length
const serviceStart = Math.min(...Object.values(tripsById).map((t) => t.start))
const serviceEnd = Math.max(...Object.values(tripsById).map((t) => t.end))
const hhmm = (s) =>
  `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`

console.log(
  `Wrote ${stops.length} stops, ${routesGeojson.features.length} shapes, ${tripCount} trips` +
    `${skippedTrips ? ` (${skippedTrips} skipped)` : ''}, schedules for ${Object.keys(scheduleByStopId).length} stops`,
)
if (duplicateTripIds.size > 0) {
  console.log(
    `Collapsed ${duplicateTripIds.size} duplicate trips (same route, shape and times under a different service period)`,
  )
}
console.log(`Service window (Japan time): ${hhmm(serviceStart)}-${hhmm(serviceEnd)}`)
