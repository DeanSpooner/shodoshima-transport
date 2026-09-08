import { useEffect, useRef, useState } from 'react';
import type { RouteInfo } from '../data/routes';
import { localisedName, useLanguage } from '../lib/i18n';

type RouteFilterProps = {
  routes: RouteInfo[];
  enabledRouteIds: Set<string>;
  onToggleRoute: (routeId: string) => void;
};

export function RouteFilter({
  routes,
  enabledRouteIds,
  onToggleRoute,
}: RouteFilterProps) {
  const { language, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  const hiddenCount = routes.length - enabledRouteIds.size;

  return (
    <div ref={containerRef} className='relative'>
      <button
        type='button'
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        className='flex items-center gap-1.5 rounded-md bg-olive-100 px-3 py-1.5 text-xs font-medium text-olive-800 shadow-md transition-colors duration-200 hover:bg-olive-200'
      >
        {hiddenCount === 0
          ? t.allRoutes
          : t.routesSelected(enabledRouteIds.size, routes.length)}
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
      </button>

      {isOpen && (
        <div className='absolute right-0 mt-1.5 w-72 rounded-md border border-olive-300 bg-olive-50 p-1 shadow-lg'>
          {routes.map(route => {
            const isEnabled = enabledRouteIds.has(route.route_id);
            return (
              <label
                key={route.route_id}
                className='flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm text-olive-800 transition-colors duration-150 hover:bg-olive-200/50'
              >
                <input
                  type='checkbox'
                  checked={isEnabled}
                  onChange={() => onToggleRoute(route.route_id)}
                  className='mt-0.5 h-3.5 w-3.5 shrink-0 accent-olive-700'
                />
                <span className='min-w-0'>
                  <span
                    className={`block font-medium ${
                      isEnabled ? 'text-olive-900' : 'text-olive-400'
                    }`}
                  >
                    {localisedName(
                      language,
                      route.route_short_name,
                      route.route_short_name_en,
                    )}
                  </span>
                  <span
                    className={`block truncate text-xs ${
                      isEnabled ? 'text-clay-600' : 'text-olive-400'
                    }`}
                  >
                    {localisedName(
                      language,
                      route.route_long_name,
                      route.route_long_name_en,
                    )}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
