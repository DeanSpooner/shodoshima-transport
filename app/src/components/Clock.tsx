import { useEffect, useState } from 'react';
import { useLanguage } from '../lib/i18n';
import { formatClock, getJapanSecondsSinceMidnight } from '../lib/time';

// Ticks faster than once a second so the displayed second is never much more
// than a moment stale. The clock is read fresh each time rather than counted
// up, so it can't drift and a slept tab resumes correct.
const TICK_MS = 250;

export function Clock() {
  const { t } = useLanguage();
  const [now, setNow] = useState(() => getJapanSecondsSinceMidnight());

  useEffect(() => {
    const id = window.setInterval(
      () => setNow(getJapanSecondsSinceMidnight()),
      TICK_MS,
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className='flex items-baseline gap-1.5 text-xs font-normal text-olive-200'>
      <time className='font-medium tabular-nums text-olive-50'>
        {formatClock(now)}
      </time>
      {t.japanTime}
    </span>
  );
}
