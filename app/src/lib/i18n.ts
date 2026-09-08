import { createContext, useContext } from 'react';

export type Language = 'en' | 'ja';

export const STORAGE_KEY = 'shodoshima:language';

type Strings = {
  appTitle: string;
  builtBy: string;
  languageLabel: string;
  /** Describes what the toggle will do, for screen readers. */
  switchLanguage: string;
  zoomIn: string;
  zoomOut: string;
  recentre: string;
  close: string;
  noDepartures: string;
  route: string;
  nextStop: string;
  arrives: string;
  simulatedNote: string;
  noBuses: string;
  allRoutes: string;
  busesInService: (count: number) => string;
  routesSelected: (enabled: number, total: number) => string;
};

// The Japanese here is authored for this app rather than taken from the feed,
// which only translates place names.
export const STRINGS: Record<Language, Strings> = {
  en: {
    appTitle: 'Shodoshima Bus Routes',
    builtBy: 'Built by Dean Spooner',
    languageLabel: 'Language',
    switchLanguage: 'Switch to Japanese',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    recentre: 'Recentre map on Shodoshima',
    close: 'Close',
    noDepartures: 'No scheduled departures',
    route: 'Route',
    nextStop: 'Next stop',
    arrives: 'Arrives',
    simulatedNote: 'Simulated from the timetable, not live tracking',
    noBuses: 'No buses in service',
    allRoutes: 'All routes',
    busesInService: count => `${count} bus${count === 1 ? '' : 'es'} in service`,
    routesSelected: (enabled, total) => `${enabled} of ${total} routes`,
  },
  ja: {
    appTitle: '小豆島バス路線',
    builtBy: '制作: Dean Spooner',
    languageLabel: '言語',
    switchLanguage: '英語に切り替える',
    zoomIn: '拡大',
    zoomOut: '縮小',
    recentre: '小豆島全体を表示',
    close: '閉じる',
    noDepartures: '発車予定はありません',
    route: '路線',
    nextStop: '次の停留所',
    arrives: '到着',
    simulatedNote: '時刻表に基づくシミュレーションです（実際の運行情報ではありません）',
    noBuses: '運行中のバスはありません',
    allRoutes: 'すべての路線',
    busesInService: count => `運行中のバス ${count}台`,
    routesSelected: (enabled, total) => `${total}路線中${enabled}路線`,
  },
};

/** Picks the English name where one exists, falling back to the Japanese. */
export function localisedName(
  language: Language,
  japanese: string,
  english?: string | null,
): string {
  return language === 'en' ? (english ?? japanese) : japanese;
}

export function getInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'ja') return stored;
  } catch {
    // Private browsing and blocked storage both throw; fall through to the
    // browser's own preference.
  }

  if (typeof navigator !== 'undefined') {
    const preferred = [navigator.language, ...(navigator.languages ?? [])];
    if (preferred.some(tag => tag?.toLowerCase().startsWith('ja'))) return 'ja';
  }

  return 'en';
}

export type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Strings;
};

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used within a LanguageProvider');
  return value;
}
