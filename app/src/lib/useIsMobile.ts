import { useEffect, useState } from 'react'

// Matches Tailwind's `sm` breakpoint, so JS-driven behaviour and the
// `sm:` classes in the markup switch over at the same width.
const MOBILE_QUERY = '(max-width: 639px)'

function matches(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(MOBILE_QUERY).matches
}

/**
 * Read synchronously on first render, so things that are only applied once -
 * the map's initial zoom - get the right value rather than briefly using the
 * desktop one.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(matches)

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)

    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
