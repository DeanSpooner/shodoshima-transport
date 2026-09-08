import routesGeojson from './routes.geojson.json'
import { allTrips } from './trips'

/** An end-to-end journey, in both languages. */
export type RouteEndpoints = { ja: string; en: string }

export type RouteInfo = {
  route_id: string
  route_short_name: string
  route_long_name: string
  route_short_name_en: string
  route_long_name_en: string
  /**
   * What the route actually connects, which identifies it far better than the
   * feed's names do. Usually one "A ↔ B" entry; a route with an extra
   * variant gets a line for that too.
   */
  endpoints: RouteEndpoints[]
}

// A route nearly always runs both ways between the same pair of termini, so
// the two directions are folded into a single "A ↔ B" rather than listed as
// two near-identical lines. Anything left unpaired keeps its own arrow.
function endpointsForRoute(routeId: string): RouteEndpoints[] {
  const journeys = new Map<string, { fromJa: string; toJa: string; fromEn: string; toEn: string }>()

  for (const trip of allTrips) {
    if (trip.route_id !== routeId) continue
    const from = trip.stops[0]
    const to = trip.stops[trip.stops.length - 1]
    journeys.set(`${from.stop_name}>${to.stop_name}`, {
      fromJa: from.stop_name,
      toJa: to.stop_name,
      fromEn: from.stop_name_en,
      toEn: to.stop_name_en,
    })
  }

  const endpoints: RouteEndpoints[] = []
  const used = new Set<string>()

  for (const [key, journey] of journeys) {
    if (used.has(key)) continue
    const reverseKey = `${journey.toJa}>${journey.fromJa}`
    const isReturnPair = journeys.has(reverseKey)

    used.add(key)
    if (isReturnPair) used.add(reverseKey)

    const arrow = isReturnPair ? '↔' : '→'
    endpoints.push({
      ja: `${journey.fromJa} ${arrow} ${journey.toJa}`,
      en: `${journey.fromEn} ${arrow} ${journey.toEn}`,
    })
  }

  return endpoints
}

// routes.geojson.json holds one feature per shape (several per route), so the
// distinct route list is derived rather than stored separately.
const seen = new Map<string, RouteInfo>()
for (const feature of routesGeojson.features) {
  const props = feature.properties as Partial<RouteInfo> & { route_id?: string }
  if (!props.route_id || seen.has(props.route_id)) continue
  seen.set(props.route_id, {
    route_id: props.route_id,
    route_short_name: props.route_short_name ?? props.route_id,
    route_long_name: props.route_long_name ?? '',
    route_short_name_en: props.route_short_name_en ?? props.route_id,
    route_long_name_en: props.route_long_name_en ?? '',
    endpoints: endpointsForRoute(props.route_id),
  })
}

export const allRoutes: RouteInfo[] = [...seen.values()].sort((a, b) =>
  a.route_id.localeCompare(b.route_id),
)
