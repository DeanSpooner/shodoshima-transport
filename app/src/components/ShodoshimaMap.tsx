import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, Point } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';
import MapGL, {
  Source,
  Layer,
  Popup,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import stopsGeojson from '../data/stops.geojson.json';
import routesGeojson from '../data/routes.geojson.json';
import { scheduleByStopId } from '../data/schedule';
import { allRoutes } from '../data/routes';
import { useBusPositions, type BusProperties } from '../lib/busPositions';
import { localisedName, useLanguage } from '../lib/i18n';
import { BusRoster } from './BusRoster';
import { RouteFilter } from './RouteFilter';
import { StopSearch, type StopSearchResult } from './StopSearch';
import { MobileMenu } from './MobileMenu';
import { LanguageToggle } from './LanguageToggle';
import { useIsMobile } from '../lib/useIsMobile';
import {
  formatSeconds,
  getJapanSecondsSinceMidnight,
  timeToSeconds,
} from '../lib/time';

// Free vector basemap, no API key required. Voyager gives traditional map
// colours (green parks, blue water, cream urban areas) rather than a
// monochrome style. Swap for a self-hosted Protomaps style
// (https://docs.protomaps.com) if you want a fully self-hosted stack.
const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

const ISLAND_CENTER = { longitude: 134.265, latitude: 34.49, zoom: 11.5 };
// Three of the 0.5-unit zoom steps further out, so the whole island still
// fits on a phone-width viewport.
const ISLAND_ZOOM_MOBILE = ISLAND_CENTER.zoom - 1.5;

const ZOOM_IN_OUT_POTENCY = 0.5;
const FOLLOW_ZOOM = 13.5;
const STOP_SEARCH_ZOOM = 14;
const SELECT_ANIMATION_DURATION_MS = 200;
const POPUP_EXIT_ANIMATION_DURATION_MS = 160;

const MAP_CONTROL_BUTTON_CLASSES =
  'flex h-9 w-9 items-center justify-center rounded-md bg-olive-50 text-olive-800 shadow-md transition-colors duration-200 hover:bg-olive-100';

type StopProperties = {
  stop_id: string;
  stop_name: string;
  stop_name_en: string;
  zone_id: string;
};

// MapLibre's paint-property transitions don't animate feature-state driven
// expressions, so the selected-stop highlight is tweened manually: a
// 'progress' feature-state value is driven from 0 to 1 (or back) via
// requestAnimationFrame, and the paint expression interpolates on it.
function animateStopProgress(
  map: MapLibreMap,
  activeAnimations: Map<number, number>,
  featureId: number,
  to: number,
) {
  const existingRaf = activeAnimations.get(featureId);
  if (existingRaf !== undefined) cancelAnimationFrame(existingRaf);

  const state = map.getFeatureState({ source: 'stops', id: featureId });
  const from = typeof state.progress === 'number' ? state.progress : 1 - to;
  const start = performance.now();

  function tick(now: number) {
    const t = Math.min((now - start) / SELECT_ANIMATION_DURATION_MS, 1);
    const eased = 1 - (1 - t) * (1 - t);
    map.setFeatureState(
      { source: 'stops', id: featureId },
      { progress: from + (to - from) * eased },
    );

    if (t < 1) {
      activeAnimations.set(featureId, requestAnimationFrame(tick));
    } else {
      activeAnimations.delete(featureId);
    }
  }

  activeAnimations.set(featureId, requestAnimationFrame(tick));
}

type ShodoshimaMapProps = {
  isMenuOpen: boolean;
  onCloseMenu: () => void;
};

export function ShodoshimaMap({ isMenuOpen, onCloseMenu }: ShodoshimaMapProps) {
  const isMobile = useIsMobile();
  const { language, t } = useLanguage();
  const mapRef = useRef<MapRef>(null);
  const activeAnimationsRef = useRef(new Map<number, number>());
  const prevFeatureIdRef = useRef<number | null>(null);
  const [selectedStop, setSelectedStop] = useState<{
    lon: number;
    lat: number;
    props: StopProperties;
    featureId: number;
  } | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [followedTripId, setFollowedTripId] = useState<string | null>(null);
  const [enabledRouteIds, setEnabledRouteIds] = useState<Set<string>>(
    () => new Set(allRoutes.map(r => r.route_id)),
  );
  const isPointerDownRef = useRef(false);

  // The roster and route filter keep their own expanded/collapsed state.
  // Bumping this on each opening remounts them, so the drawer always comes
  // back collapsed rather than however it was left. Keyed on opening rather
  // than closing so the sections don't visibly snap shut mid slide-out.
  const [menuOpenCount, setMenuOpenCount] = useState(0);
  const [wasMenuOpen, setWasMenuOpen] = useState(isMenuOpen);
  if (wasMenuOpen !== isMenuOpen) {
    setWasMenuOpen(isMenuOpen);
    if (isMenuOpen) setMenuOpenCount(count => count + 1);
  }

  // jumpTo calls map.stop() internally, which aborts whatever interaction is
  // in flight. Re-centring 60 times a second would therefore kill a drag the
  // instant it began, and the gesture would collapse into a click. Tracking
  // the pointer lets the follow loop stand down while the user is touching
  // the map. Capture phase and window scope so a release outside still counts.
  useEffect(() => {
    const down = () => (isPointerDownRef.current = true);
    const up = () => (isPointerDownRef.current = false);

    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, []);

  const allBusFeatures = useBusPositions();
  // Bus positions are recomputed every animation frame, but the schedule-driven
  // parts of the UI only ever change on a whole second. Flooring keeps their
  // memos from re-running 60 times a second for an identical result.
  const nowSeconds = Math.floor(getJapanSecondsSinceMidnight());

  const visibleBuses = useMemo(
    () =>
      allBusFeatures.features.filter(f =>
        enabledRouteIds.has(f.properties.route_id),
      ),
    [allBusFeatures, enabledRouteIds],
  );

  const busFeatures = useMemo(
    () => ({ type: 'FeatureCollection' as const, features: visibleBuses }),
    [visibleBuses],
  );

  // A stop is dimmed once nothing more will call there today, or when every
  // route serving it has been filtered out. Memoising via a joined key keeps
  // the array identity stable between ticks, so MapLibre isn't handed a
  // "new" paint expression once a second.
  const inactiveStopIdsKey = useMemo(() => {
    const inactive: string[] = [];
    for (const feature of stopsGeojson.features) {
      const stopId = (feature.properties as StopProperties).stop_id;
      const hasUpcoming = (scheduleByStopId[stopId] ?? []).some(
        entry =>
          enabledRouteIds.has(entry.route_id) &&
          timeToSeconds(entry.departure_time) >= nowSeconds,
      );
      if (!hasUpcoming) inactive.push(stopId);
    }
    return inactive.join(',');
  }, [enabledRouteIds, nowSeconds]);

  const stableInactiveStopIds = useMemo(
    () => (inactiveStopIdsKey ? inactiveStopIdsKey.split(',') : []),
    [inactiveStopIdsKey],
  );

  const enabledRouteIdList = useMemo(
    () => [...enabledRouteIds],
    [enabledRouteIds],
  );

  // Tracked by trip_id rather than by captured coordinates so the popup
  // follows the bus as it moves, and closes itself once the trip finishes or
  // its route is filtered out.
  const selectedBus =
    visibleBuses.find(f => f.properties.trip_id === selectedTripId) ?? null;

  function onToggleRoute(routeId: string) {
    setEnabledRouteIds(current => {
      const next = new Set(current);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
  }

  // Shared by the roster and by clicking a bus on the map, so both do the same
  // thing. Only ever zooms in, never out, so following from an already close
  // view doesn't yank the map backwards.
  function followBus(tripId: string) {
    const bus = visibleBuses.find(f => f.properties.trip_id === tripId);
    if (!bus) return;

    setSelectedStop(null);
    setSelectedTripId(tripId);
    setFollowedTripId(tripId);

    const map = mapRef.current;
    if (!map) return;

    map.flyTo({
      center: bus.geometry.coordinates as [number, number],
      zoom: Math.max(map.getZoom(), FOLLOW_ZOOM),
      duration: 1200,
    });
  }

  // Search results behave like clicking the stop: fly in, select it (which
  // runs the marker highlight) and open its timetable.
  function onSelectSearchResult(result: StopSearchResult) {
    setSelectedTripId(null);
    setFollowedTripId(null);
    setSelectedStop({
      lon: result.lon,
      lat: result.lat,
      featureId: result.featureId,
      props: {
        stop_id: result.stopId,
        stop_name: result.nameJa,
        stop_name_en: result.nameEn,
        zone_id: '',
      },
    });

    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [result.lon, result.lat],
      zoom: Math.max(map.getZoom(), STOP_SEARCH_ZOOM),
      duration: 1200,
    });
  }

  // Derived rather than stored, so a followed trip ending (or being filtered
  // out) simply stops resolving instead of needing a state reset.
  const followedBus = followedTripId
    ? (visibleBuses.find(f => f.properties.trip_id === followedTripId) ?? null)
    : null;

  // Keeps the followed bus centred as it moves. The position itself is now
  // recomputed per frame, so jumping straight to it each frame is already
  // smooth - easing here would mean restarting an animation every frame and
  // perpetually chasing a target it never reaches.
  useEffect(() => {
    if (!followedBus) return;

    const map = mapRef.current?.getMap();
    if (!map) return;

    // Stand down while the user is touching the map, or while a camera
    // animation is in flight (the initial fly-in, or a zoom they just asked
    // for) - jumpTo would abort either one.
    if (isPointerDownRef.current || map.isMoving()) return;

    map.jumpTo({
      center: followedBus.geometry.coordinates as [number, number],
    });
  }, [followedBus]);

  // The popup animates out before unmounting, so what's rendered can lag
  // behind selectedStop by one exit-animation duration when closing.
  const [displayedStop, setDisplayedStop] = useState(selectedStop);
  const [isPopupClosing, setIsPopupClosing] = useState(false);
  const popupCloseTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    clearTimeout(popupCloseTimeoutRef.current);

    if (selectedStop) {
      setDisplayedStop(selectedStop);
      setIsPopupClosing(false);
      return;
    }

    if (displayedStop) {
      setIsPopupClosing(true);
      popupCloseTimeoutRef.current = window.setTimeout(() => {
        setDisplayedStop(null);
        setIsPopupClosing(false);
      }, POPUP_EXIT_ANIMATION_DURATION_MS);
    }
  }, [selectedStop]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const prevFeatureId = prevFeatureIdRef.current;
    const nextFeatureId = selectedStop?.featureId ?? null;

    if (prevFeatureId !== null && prevFeatureId !== nextFeatureId) {
      animateStopProgress(map, activeAnimationsRef.current, prevFeatureId, 0);
    }
    if (nextFeatureId !== null) {
      animateStopProgress(map, activeAnimationsRef.current, nextFeatureId, 1);
    }
    prevFeatureIdRef.current = nextFeatureId;
  }, [selectedStop]);

  // Recentring is an explicit "take me back to the island", so it gives up
  // following. Zooming only changes how closely you're watching, so it doesn't.
  const islandZoom = isMobile ? ISLAND_ZOOM_MOBILE : ISLAND_CENTER.zoom;

  function onRecenter() {
    setFollowedTripId(null);
    mapRef.current?.flyTo({
      center: [ISLAND_CENTER.longitude, ISLAND_CENTER.latitude],
      zoom: islandZoom,
    });
  }

  function onZoomIn() {
    const map = mapRef.current;
    if (!map) return;
    map.zoomTo(map.getZoom() + ZOOM_IN_OUT_POTENCY);
  }

  function onZoomOut() {
    const map = mapRef.current;
    if (!map) return;
    map.zoomTo(map.getZoom() - ZOOM_IN_OUT_POTENCY);
  }

  function onClick(e: MapLayerMouseEvent) {
    // Look each layer up by id rather than trusting e.features[0]: a bus dot
    // sitting on top of a stop would otherwise be returned first and make the
    // stop underneath unclickable.
    const busFeature = e.features?.find(f => f.layer?.id === 'buses-circle');
    const stopFeature = e.features?.find(f => f.layer?.id === 'stops-circle');

    // Buses draw above stops and are smaller, so hitting one is deliberate.
    // Clicking one starts following it, exactly as picking it from the roster
    // does.
    const clickedTripId = (busFeature?.properties as BusProperties | undefined)
      ?.trip_id;
    if (clickedTripId) {
      followBus(clickedTripId);
      return;
    }

    // Clicking anywhere else is a deliberate move of attention.
    setFollowedTripId(null);
    setSelectedTripId(null);

    if (!stopFeature || stopFeature.id === undefined) {
      setSelectedStop(null);
      return;
    }

    const [lon, lat] = (stopFeature.geometry as Point).coordinates;
    setSelectedStop({
      lon,
      lat,
      props: stopFeature.properties as StopProperties,
      featureId: stopFeature.id as number,
    });
  }

  const schedule = displayedStop
    ? (scheduleByStopId[displayedStop.props.stop_id] ?? [])
    : [];
  const nextDepartureIndex = schedule.findIndex(
    s => timeToSeconds(s.departure_time) >= nowSeconds,
  );

  return (
    <MapGL
      ref={mapRef}
      initialViewState={{ ...ISLAND_CENTER, zoom: islandZoom }}
      style={{ width: '100%', height: '100%' }}
      mapStyle={MAP_STYLE}
      interactiveLayerIds={['stops-circle', 'buses-circle']}
      onClick={onClick}
      // Dragging is the user deliberately looking somewhere else, so it gives
      // up following. Zooming isn't - it's looking at the same bus more or
      // less closely - so it's deliberately not handled here. Programmatic
      // camera moves don't raise dragstart, so the follow can't cancel itself.
      onDragStart={() => setFollowedTripId(null)}
    >
      <div className='absolute top-3 left-3 right-3 z-10 sm:right-auto'>
        <StopSearch onSelectStop={onSelectSearchResult} />
      </div>

      {/* Sits clear of MapLibre's attribution bar, which occupies the bottom
          ~44px of the map's right-hand side. */}
      <a
        href='https://github.com/DeanSpooner'
        target='_blank'
        rel='noopener noreferrer'
        className='absolute bottom-12 right-3 z-10 hidden rounded-md bg-olive-50 px-2 py-1 text-xs text-olive-800 shadow-md transition-colors duration-200 hover:bg-olive-100 sm:block'
      >
        {t.builtBy}
      </a>

      <div className='absolute bottom-3 left-3 z-10 flex flex-col gap-2'>
        <button
          type='button'
          onClick={onZoomIn}
          aria-label={t.zoomIn}
          title={t.zoomIn}
          className={MAP_CONTROL_BUTTON_CLASSES}
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            className='h-5 w-5'
          >
            <line x1='12' y1='5' x2='12' y2='19' />
            <line x1='5' y1='12' x2='19' y2='12' />
          </svg>
        </button>

        <button
          type='button'
          onClick={onZoomOut}
          aria-label={t.zoomOut}
          title={t.zoomOut}
          className={MAP_CONTROL_BUTTON_CLASSES}
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            className='h-5 w-5'
          >
            <line x1='5' y1='12' x2='19' y2='12' />
          </svg>
        </button>

        <button
          type='button'
          onClick={onRecenter}
          aria-label={t.recentre}
          title={t.recentre}
          className={MAP_CONTROL_BUTTON_CLASSES}
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            className='h-5 w-5'
          >
            <circle cx='12' cy='12' r='3' />
            <line x1='12' y1='2' x2='12' y2='6' />
            <line x1='12' y1='18' x2='12' y2='22' />
            <line x1='2' y1='12' x2='6' y2='12' />
            <line x1='18' y1='12' x2='22' y2='12' />
          </svg>
        </button>
      </div>

      <Source
        id='routes'
        type='geojson'
        data={routesGeojson as FeatureCollection}
      >
        {/* Filtered-out routes are a separate layer drawn first, so that where
            routes share a road the active one is always on top. A single
            layer would let a greyed shape bury an active one, depending on
            feature order. */}
        <Layer
          id='routes-line-inactive'
          type='line'
          filter={[
            '!',
            ['in', ['get', 'route_id'], ['literal', enabledRouteIdList]],
          ]}
          paint={{
            'line-color': '#c4c2b8',
            'line-width': 2.5,
            'line-opacity': 1,
          }}
        />
        <Layer
          id='routes-line'
          type='line'
          filter={['in', ['get', 'route_id'], ['literal', enabledRouteIdList]]}
          paint={{
            'line-color': '#626b3c',
            // Opaque so the two directions of a corridor, which are separate
            // overlapping shapes, don't composite into a darker line than
            // single-coverage stretches.
            'line-width': 2.5,
            'line-opacity': 1,
          }}
        />
      </Source>

      <Source
        id='stops'
        type='geojson'
        data={stopsGeojson as FeatureCollection}
        generateId
      >
        <Layer
          id='stops-circle'
          type='circle'
          paint={{
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['coalesce', ['feature-state', 'progress'], 0],
              0,
              6,
              1,
              8,
            ],
            'circle-color': [
              'case',
              // Dimmed when nothing more calls here today, or when every route
              // serving it is filtered out.
              ['in', ['get', 'stop_id'], ['literal', stableInactiveStopIds]],
              '#c4c2b8',
              [
                'interpolate',
                ['linear'],
                ['coalesce', ['feature-state', 'progress'], 0],
                0,
                '#bf6a3d',
                1,
                '#4c5430',
              ],
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#f6f4e8',
          }}
        />
      </Source>

      {/* Declared after stops so buses draw on top of them. No generateId:
          feature ids are meaningless on a source replaced every second. */}
      <Source id='buses' type='geojson' data={busFeatures}>
        <Layer
          id='buses-circle'
          type='circle'
          paint={{
            'circle-radius': 5,
            'circle-color': '#2226ff',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#f6f4e8',
          }}
        />
      </Source>

      {displayedStop && (
        <Popup
          longitude={displayedStop.lon}
          latitude={displayedStop.lat}
          onClose={() => setSelectedStop(null)}
          closeButton={false}
          closeOnClick={false}
          anchor='bottom'
          // MapLibre defaults to maxWidth: '240px' as an inline style on the
          // popup container, which CSS can't override. Without this the card
          // stays 240px wide while its contents overflow outside the border.
          maxWidth='none'
          className={isPopupClosing ? 'stop-popup-exit' : 'stop-popup-enter'}
        >
          <div className='min-w-72'>
            <div className='flex items-start justify-between gap-2 border-b border-olive-200 pb-1.5 mb-1.5'>
              <h3 className='font-semibold text-base text-olive-900'>
                {localisedName(
                  language,
                  displayedStop.props.stop_name,
                  displayedStop.props.stop_name_en,
                )}
              </h3>
              <button
                type='button'
                onClick={() => setSelectedStop(null)}
                aria-label={t.close}
                className='shrink-0 flex items-center justify-center h-6 w-6 rounded text-olive-500 hover:text-olive-800 hover:bg-olive-200/70'
              >
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='2'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  className='h-4 w-4'
                >
                  <line x1='6' y1='6' x2='18' y2='18' />
                  <line x1='18' y1='6' x2='6' y2='18' />
                </svg>
              </button>
            </div>
            {schedule.length === 0 ? (
              <p className='text-sm text-olive-600 mt-1'>
                {t.noDepartures}
              </p>
            ) : (
              <>
                <div className='flex items-baseline justify-between gap-x-5 px-1.5 text-xs uppercase tracking-wide text-olive-500'>
                  <span>{t.departs}</span>
                  <span>{t.boundForLabel}</span>
                </div>
                <ul className='stop-schedule-list text-sm mt-1 space-y-1 max-h-56 overflow-y-auto'>
                {schedule.map((s, i) => {
                  const isPast =
                    nextDepartureIndex === -1 || i < nextDepartureIndex;
                  const isNext = i === nextDepartureIndex;
                  return (
                    <li
                      key={`${s.trip_id}-${i}`}
                      className={`flex items-baseline justify-between whitespace-nowrap gap-x-5 rounded px-1.5 py-0.5 ${
                        isNext ? 'stop-next-departure' : ''
                      }`}
                    >
                      <span
                        className={`font-medium tabular-nums shrink-0 ${
                          isPast ? 'text-olive-400' : 'text-olive-900'
                        }`}
                      >
                        {formatSeconds(timeToSeconds(s.departure_time))}
                      </span>
                      <span
                        className={isPast ? 'text-olive-400' : 'text-clay-600'}
                      >
                        {localisedName(language, s.headsign, s.headsign_en)}
                      </span>
                    </li>
                  );
                })}
                </ul>
              </>
            )}
          </div>
        </Popup>
      )}

      {selectedBus && (
        <Popup
          longitude={selectedBus.geometry.coordinates[0]}
          latitude={selectedBus.geometry.coordinates[1]}
          onClose={() => setSelectedTripId(null)}
          closeButton={false}
          closeOnClick={false}
          anchor='bottom'
          maxWidth='none'
          className='stop-popup-enter'
        >
          <div className='min-w-56'>
            <div className='flex items-start justify-between gap-2 border-b border-olive-200 pb-1.5 mb-1.5'>
              <h3 className='font-semibold text-base text-olive-900'>
                {t.boundFor(
                  localisedName(
                    language,
                    selectedBus.properties.destination_name,
                    selectedBus.properties.destination_name_en,
                  ),
                )}
              </h3>
              <button
                type='button'
                onClick={() => setSelectedTripId(null)}
                aria-label={t.close}
                className='shrink-0 flex items-center justify-center h-6 w-6 rounded text-olive-500 hover:text-olive-800 hover:bg-olive-200/70'
              >
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='2'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  className='h-4 w-4'
                >
                  <line x1='6' y1='6' x2='18' y2='18' />
                  <line x1='18' y1='6' x2='6' y2='18' />
                </svg>
              </button>
            </div>
            <dl className='text-sm space-y-1'>
              <div className='flex items-baseline justify-between gap-x-5 whitespace-nowrap'>
                <dt className='text-olive-600'>{t.route}</dt>
                <dd className='text-olive-900 font-medium'>
                  {localisedName(
                    language,
                    selectedBus.properties.origin_name,
                    selectedBus.properties.origin_name_en,
                  )}
                  <span aria-hidden='true' className='mx-1 text-olive-900'>
                    &rarr;
                  </span>
                  {localisedName(
                    language,
                    selectedBus.properties.destination_name,
                    selectedBus.properties.destination_name_en,
                  )}
                </dd>
              </div>
              <div className='flex items-baseline justify-between gap-x-5 whitespace-nowrap'>
                <dt className='text-olive-600'>{t.nextStop}</dt>
                <dd className='text-olive-900 font-medium'>
                  {localisedName(
                    language,
                    selectedBus.properties.next_stop_name,
                    selectedBus.properties.next_stop_name_en,
                  )}
                </dd>
              </div>
              <div className='flex items-baseline justify-between gap-x-5 whitespace-nowrap'>
                <dt className='text-olive-600'>{t.arrives}</dt>
                <dd className='text-olive-900 font-medium tabular-nums'>
                  {formatSeconds(selectedBus.properties.next_stop_time)}
                </dd>
              </div>
            </dl>
            <p className='text-xs text-olive-500 mt-2 pt-1.5 border-t border-olive-200'>
              {t.simulatedNote}
            </p>
          </div>
        </Popup>
      )}

      {/* Side by side rather than stacked: stacked, the upper control's
          dropdown opened underneath the lower one. */}
      <div className='absolute top-16 right-3 z-10 hidden items-start gap-2 sm:top-3 sm:flex'>
        <BusRoster
          buses={visibleBuses}
          followedTripId={followedTripId}
          onSelectBus={followBus}
        />
        <RouteFilter
          routes={allRoutes}
          enabledRouteIds={enabledRouteIds}
          onToggleRoute={onToggleRoute}
        />
      </div>

      <MobileMenu isOpen={isMenuOpen} onClose={onCloseMenu}>
        <BusRoster
          key={`roster-${menuOpenCount}`}
          variant='panel'
          buses={visibleBuses}
          followedTripId={followedTripId}
          onSelectBus={tripId => {
            followBus(tripId);
            onCloseMenu();
          }}
        />
        <RouteFilter
          key={`routes-${menuOpenCount}`}
          variant='panel'
          routes={allRoutes}
          enabledRouteIds={enabledRouteIds}
          onToggleRoute={onToggleRoute}
        />

        <div className='mt-auto flex flex-col gap-3 border-t border-olive-300 pt-4'>
          <LanguageToggle variant='panel' />
          <a
            href='https://github.com/DeanSpooner'
            target='_blank'
            rel='noopener noreferrer'
            className='text-xs text-olive-700 hover:underline'
          >
            {t.builtBy}
          </a>
        </div>
      </MobileMenu>
    </MapGL>
  );
}
