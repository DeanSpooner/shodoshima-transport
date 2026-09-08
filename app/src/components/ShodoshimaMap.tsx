import { useEffect, useRef, useState } from 'react';
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

// Free vector basemap, no API key required. Voyager gives traditional map
// colours (green parks, blue water, cream urban areas) rather than a
// monochrome style. Swap for a self-hosted Protomaps style
// (https://docs.protomaps.com) if you want a fully self-hosted stack.
const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

const ISLAND_CENTER = { longitude: 134.265, latitude: 34.49, zoom: 11.5 };

const ZOOM_IN_OUT_POTENCY = 0.5;
const SELECT_ANIMATION_DURATION_MS = 200;
const POPUP_EXIT_ANIMATION_DURATION_MS = 160;

const MAP_CONTROL_BUTTON_CLASSES =
  'flex h-9 w-9 items-center justify-center rounded-md bg-olive-100 text-olive-800 shadow-md transition-colors duration-200 hover:bg-olive-200';

type StopProperties = {
  stop_id: string;
  stop_name: string;
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

export function ShodoshimaMap() {
  const mapRef = useRef<MapRef>(null);
  const activeAnimationsRef = useRef(new Map<number, number>());
  const prevFeatureIdRef = useRef<number | null>(null);
  const [selectedStop, setSelectedStop] = useState<{
    lon: number;
    lat: number;
    props: StopProperties;
    featureId: number;
  } | null>(null);

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

  function onRecenter() {
    mapRef.current?.flyTo({
      center: [ISLAND_CENTER.longitude, ISLAND_CENTER.latitude],
      zoom: ISLAND_CENTER.zoom,
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
    const feature = e.features?.[0];
    if (
      !feature ||
      feature.layer?.id !== 'stops-circle' ||
      feature.id === undefined
    ) {
      setSelectedStop(null);
      return;
    }
    const [lon, lat] = (feature.geometry as Point).coordinates;
    setSelectedStop({
      lon,
      lat,
      props: feature.properties as StopProperties,
      featureId: feature.id as number,
    });
  }

  const schedule = displayedStop
    ? (scheduleByStopId[displayedStop.props.stop_id] ?? [])
    : [];

  return (
    <MapGL
      ref={mapRef}
      initialViewState={ISLAND_CENTER}
      style={{ width: '100%', height: '100%' }}
      mapStyle={MAP_STYLE}
      interactiveLayerIds={['stops-circle']}
      onClick={onClick}
    >
      <div className='absolute bottom-3 left-3 z-10 flex flex-col gap-2'>
        <button
          type='button'
          onClick={onZoomIn}
          aria-label='Zoom in'
          title='Zoom in'
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
          aria-label='Zoom out'
          title='Zoom out'
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
          aria-label='Recentre map on Shodoshima'
          title='Recentre map'
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
        <Layer
          id='routes-line'
          type='line'
          paint={{
            'line-color': '#626b3c',
            'line-width': 3,
            'line-opacity': 0.8,
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
              'interpolate',
              ['linear'],
              ['coalesce', ['feature-state', 'progress'], 0],
              0,
              '#bf6a3d',
              1,
              '#4c5430',
            ],
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
          className={isPopupClosing ? 'stop-popup-exit' : 'stop-popup-enter'}
        >
          <div className='max-w-xs'>
            <div className='flex items-start justify-between gap-2 border-b border-olive-200 pb-1 mb-1'>
              <h3 className='font-semibold text-sm text-olive-900'>
                {displayedStop.props.stop_name}
              </h3>
              <button
                type='button'
                onClick={() => setSelectedStop(null)}
                aria-label='Close'
                className='shrink-0 text-olive-500 hover:text-olive-800 leading-none text-base'
              >
                &times;
              </button>
            </div>
            {schedule.length === 0 ? (
              <p className='text-xs text-olive-600 mt-1'>
                No scheduled departures
              </p>
            ) : (
              <ul className='text-xs mt-1 space-y-0.5 max-h-40 overflow-y-auto'>
                {schedule.map((s, i) => (
                  <li
                    key={`${s.trip_id}-${i}`}
                    className='flex justify-between gap-2'
                  >
                    <span className='text-olive-900 font-medium'>
                      {s.departure_time}
                    </span>
                    <span className='text-clay-600'>{s.headsign}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Popup>
      )}
    </MapGL>
  );
}
