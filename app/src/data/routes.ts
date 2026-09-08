import routesGeojson from './routes.geojson.json'

export type RouteInfo = {
  route_id: string
  route_short_name: string
  route_long_name: string
  route_short_name_en: string
  route_long_name_en: string
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
  })
}

export const allRoutes: RouteInfo[] = [...seen.values()].sort((a, b) =>
  a.route_id.localeCompare(b.route_id),
)
