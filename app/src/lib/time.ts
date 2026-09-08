// GTFS times are H:MM:SS, not zero-padded, so they must be parsed rather than
// string-compared ("7:59:00" sorts after "19:19:00" as a string).
export function timeToSeconds(time: string): number {
  const [h, m, s] = time.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

/** Formats seconds since midnight back to H:MM. */
export function formatSeconds(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

const SECONDS_PER_DAY = 86400;

function parseClockOverrideParam(): number | null {
  if (typeof window === 'undefined') return null;

  const raw = new URLSearchParams(window.location.search).get('t');
  if (!raw) return null;

  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (!match) return null;

  const [h, m, s] = [match[1], match[2], match[3] ?? '0'].map(Number);
  if (h > 23 || m > 59 || s > 59) return null;

  return h * 3600 + m * 60 + s;
}

// Anchored on first use so the override is a *starting* time that then runs
// forward in real time, rather than a frozen clock - buses need to actually
// move for the simulation to be worth looking at.
let clockOverrideAnchor: { simulatedStart: number; realStart: number } | null =
  null;

// Buses only run 07:30-20:02 Japan time, which is roughly 23:30-12:00 in the
// UK, so `?t=14:30` starts the clock there to make the map demonstrable at any
// hour. Opt-in via an explicit query param, so normal visitors never see it.
function getClockOverride(): number | null {
  const simulatedStart = parseClockOverrideParam();
  if (simulatedStart === null) return null;

  clockOverrideAnchor ??= { simulatedStart, realStart: Date.now() };

  // Deliberately not floored: bus positions interpolate against this, so
  // whole-second resolution would make them advance in visible hops.
  const elapsed = (Date.now() - clockOverrideAnchor.realStart) / 1000;
  return (clockOverrideAnchor.simulatedStart + elapsed) % SECONDS_PER_DAY;
}

// Departure times are local to Shodoshima, so "now" must be Japan time
// regardless of the viewer's own timezone or device clock.
export function getJapanSecondsSinceMidnight(): number {
  const override = getClockOverride();
  if (override !== null) return override;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) =>
    Number(parts.find(p => p.type === type)?.value ?? 0);
  const wholeSeconds =
    get('hour') * 3600 + get('minute') * 60 + get('second');

  // Intl only resolves to whole seconds, which would make buses hop once a
  // second. Timezone offsets are whole minutes, so the sub-second part of the
  // system clock is also the sub-second part of Japan's.
  return wholeSeconds + (Date.now() % 1000) / 1000;
}
