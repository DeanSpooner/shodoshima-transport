import { useEffect, useMemo, useRef, useState } from 'react';
import stopsGeojson from '../data/stops.geojson.json';
import { allTrips } from '../data/trips';
import { localisedName, useLanguage } from '../lib/i18n';

/** One end-to-end direction of travel calling at a stop. */
type Direction = { ja: string; en: string };

export type StopSearchResult = {
  stopId: string;
  featureId: number;
  lon: number;
  lat: number;
  nameJa: string;
  nameEn: string;
  directions: Direction[];
};

type StopSearchProps = {
  onSelectStop: (result: StopSearchResult) => void;
};

const MAX_RESULTS = 8;

// Matching is always done against Japanese, kana and English at once, so a
// query in either language finds the stop whichever way the UI is set.
type IndexedStop = StopSearchResult & { haystack: string };

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

// Which end-to-end journeys call at each stop. Stops that share a name are
// the opposing platforms of one route, so the direction is what tells them
// apart - 2_1 is "Kounoura West → Ikeda Port", 2_2 the reverse.
const DIRECTIONS_BY_STOP_ID = (() => {
  const byStopId = new Map<string, Direction[]>();

  for (const trip of allTrips) {
    const origin = trip.stops[0];
    const destination = trip.stops[trip.stops.length - 1];
    const direction: Direction = {
      ja: `${origin.stop_name} → ${destination.stop_name}`,
      en: `${origin.stop_name_en} → ${destination.stop_name_en}`,
    };

    for (const stop of trip.stops) {
      const existing = byStopId.get(stop.stop_id) ?? [];
      if (!existing.some(d => d.ja === direction.ja)) {
        byStopId.set(stop.stop_id, [...existing, direction]);
      }
    }
  }

  return byStopId;
})();

const SEARCH_INDEX: IndexedStop[] = stopsGeojson.features.map(
  (feature, index) => {
    const props = feature.properties as {
      stop_id: string;
      stop_name: string;
      stop_name_en: string;
      stop_name_kana: string;
    };
    const [lon, lat] = feature.geometry.coordinates as [number, number];

    return {
      stopId: props.stop_id,
      // GeoJSON sources declared with generateId number their features by
      // position, so the array index is the id the map knows this stop by.
      featureId: index,
      lon,
      lat,
      nameJa: props.stop_name,
      nameEn: props.stop_name_en,
      directions: DIRECTIONS_BY_STOP_ID.get(props.stop_id) ?? [],
      haystack: normalise(
        [props.stop_name, props.stop_name_kana, props.stop_name_en].join(' '),
      ),
    };
  },
);

export function StopSearch({ onSelectStop }: StopSearchProps) {
  const { language, t } = useLanguage();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const results = useMemo(() => {
    const needle = normalise(query);
    if (!needle) return [];
    return SEARCH_INDEX.filter(stop => stop.haystack.includes(needle)).slice(
      0,
      MAX_RESULTS,
    );
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    optionRefs.current[highlighted]?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, isOpen, results]);

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  function choose(result: StopSearchResult) {
    onSelectStop(result);
    setIsOpen(false);
    setQuery(localisedName(language, result.nameJa, result.nameEn));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (!results.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(i => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(i => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[highlighted] ?? results[0]);
    }
  }

  return (
    <div ref={containerRef} className='relative w-80'>
      <input
        type='search'
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setHighlighted(0);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={t.searchPlaceholder}
        aria-label={t.searchPlaceholder}
        className='w-full rounded-md bg-olive-50 px-3 py-1.5 text-sm text-olive-900 shadow-md outline-none placeholder:text-olive-500 focus:ring-2 focus:ring-olive-300'
      />

      {isOpen && query.trim() !== '' && (
        <ul className='absolute left-0 mt-1.5 w-full max-h-72 overflow-y-auto stop-schedule-list rounded-md border border-olive-300 bg-olive-50 p-1 shadow-lg'>
          {results.length === 0 ? (
            <li className='px-2 py-1.5 text-sm text-olive-600'>
              {t.searchNoResults}
            </li>
          ) : (
            results.map((result, index) => {
              const primary = localisedName(
                language,
                result.nameJa,
                result.nameEn,
              );
              // The other language is shown underneath, so a cross-language
              // match doesn't look like an unrelated result.
              const secondary =
                language === 'en' ? result.nameJa : result.nameEn;
              return (
                <li key={result.stopId}>
                  <button
                    type='button'
                    ref={element => {
                      optionRefs.current[index] = element;
                    }}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => choose(result)}
                    className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors duration-150 ${
                      index === highlighted
                        ? 'bg-olive-200/70 text-olive-900'
                        : 'text-olive-800'
                    }`}
                  >
                    <span className='block truncate'>{primary}</span>
                    <span className='block truncate text-xs text-olive-500'>
                      {secondary}
                    </span>
                    {result.directions.map(direction => (
                      <span
                        key={direction.ja}
                        className='mt-0.5 block truncate text-xs text-clay-600'
                      >
                        {language === 'en' ? direction.en : direction.ja}
                      </span>
                    ))}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
