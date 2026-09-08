import { useEffect, useRef, useState } from 'react';
import type { Feature, Point } from 'geojson';
import type { BusProperties } from '../lib/busPositions';
import { localisedName, useLanguage } from '../lib/i18n';

type BusRosterProps = {
  buses: Feature<Point, BusProperties>[];
  followedTripId: string | null;
  onSelectBus: (tripId: string) => void;
};

export function BusRoster({
  buses,
  followedTripId,
  onSelectBus,
}: BusRosterProps) {
  const { language, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Collapse when the last bus finishes its trip, so the menu can't linger
  // empty and then reappear when an unrelated bus starts. Adjusting during
  // render rather than in an effect avoids a second render pass.
  const hasBuses = buses.length > 0;
  const [hadBuses, setHadBuses] = useState(hasBuses);
  if (hadBuses !== hasBuses) {
    setHadBuses(hasBuses);
    if (!hasBuses) setIsOpen(false);
  }

  // Close when clicking anywhere else, including on the map itself.
  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  const label =
    buses.length === 0 ? t.noBuses : t.busesInService(buses.length);

  return (
    <div ref={containerRef} className='relative'>
      <button
        type='button'
        onClick={() => setIsOpen(open => !open)}
        disabled={buses.length === 0}
        aria-expanded={isOpen}
        aria-haspopup='listbox'
        className='flex items-center gap-1.5 rounded-md bg-olive-100 px-3 py-1.5 text-xs font-medium text-olive-800 shadow-md transition-colors duration-200 enabled:hover:bg-olive-200 disabled:cursor-default'
      >
        {label}
        {buses.length > 0 && (
          <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2.5'
            strokeLinecap='round'
            strokeLinejoin='round'
            className={`h-3 w-3 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          >
            <polyline points='6 9 12 15 18 9' />
          </svg>
        )}
      </button>

      {isOpen && buses.length > 0 && (
        <ul
          role='listbox'
          className='absolute right-0 mt-1.5 w-72 max-h-72 overflow-y-auto stop-schedule-list rounded-md border border-olive-300 bg-olive-50 p-1 shadow-lg'
        >
          {buses.map(bus => {
            const p = bus.properties;
            const trip_id = p.trip_id;
            const origin = localisedName(language, p.origin_name, p.origin_name_en);
            const destination = localisedName(
              language,
              p.destination_name,
              p.destination_name_en,
            );
            const isFollowed = trip_id === followedTripId;
            return (
              <li key={trip_id}>
                <button
                  type='button'
                  role='option'
                  aria-selected={isFollowed}
                  onClick={() => {
                    onSelectBus(trip_id);
                    setIsOpen(false);
                  }}
                  className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors duration-150 ${
                    isFollowed
                      ? 'bg-olive-200/70 text-olive-900'
                      : 'text-olive-800 hover:bg-olive-200/50'
                  }`}
                >
                  <span className='block truncate'>{origin}</span>
                  <span className='flex items-baseline gap-1 truncate text-clay-600'>
                    <span aria-hidden='true'>&rarr;</span>
                    {destination}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
