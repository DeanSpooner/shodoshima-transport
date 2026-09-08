import { useRef, useState } from 'react';
import type { FeatureCollection, Point } from 'geojson';
import Map, {
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

// Free vector basemap, no API key required. Swap for a self-hosted Protomaps
// style (https://docs.protomaps.com) if you want a fully self-hosted stack.
const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

const ISLAND_CENTER = { longitude: 134.265, latitude: 34.49, zoom: 11.5 };

const ZOOM_IN_OUT_POTENCY = 0.5;

const MAP_CONTROL_BUTTON_CLASSES =
  'flex h-9 w-9 items-center justify-center rounded-md bg-blue-300 text-slate-800 shadow-md transition-colors duration-200 hover:bg-blue-400';

type StopProperties = {
  stop_id: string;
  stop_name: string;
  zone_id: string;
};

export function ShodoshimaMap() {
  const mapRef = useRef<MapRef>(null);
  const [selectedStop, setSelectedStop] = useState<{
    lon: number;
    lat: number;
    props: StopProperties;
  } | null>(null);

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
    if (!feature || feature.layer?.id !== 'stops-circle') {
      setSelectedStop(null);
      return;
    }
    const [lon, lat] = (feature.geometry as Point).coordinates;
    setSelectedStop({ lon, lat, props: feature.properties as StopProperties });
  }

  const schedule = selectedStop
    ? (scheduleByStopId[selectedStop.props.stop_id] ?? [])
    : [];

  return (
    <Map
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
            'line-color': '#2563eb',
            'line-width': 3,
            'line-opacity': 0.7,
          }}
        />
      </Source>

      <Source
        id='stops'
        type='geojson'
        data={stopsGeojson as FeatureCollection}
      >
        <Layer
          id='stops-circle'
          type='circle'
          paint={{
            'circle-radius': 6,
            'circle-color': '#dc2626',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          }}
        />
      </Source>

      {selectedStop && (
        <Popup
          longitude={selectedStop.lon}
          latitude={selectedStop.lat}
          onClose={() => setSelectedStop(null)}
          closeOnClick={false}
          anchor='bottom'
        >
          <div className='max-w-xs'>
            <h3 className='font-semibold text-sm'>
              {selectedStop.props.stop_name}
            </h3>
            {schedule.length === 0 ? (
              <p className='text-xs text-gray-500 mt-1'>
                No scheduled departures
              </p>
            ) : (
              <ul className='text-xs mt-1 space-y-0.5 max-h-40 overflow-y-auto'>
                {schedule.map((s, i) => (
                  <li
                    key={`${s.trip_id}-${i}`}
                    className='flex justify-between gap-2'
                  >
                    <span>{s.departure_time}</span>
                    <span className='text-gray-500'>{s.headsign}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Popup>
      )}
    </Map>
  );
}
