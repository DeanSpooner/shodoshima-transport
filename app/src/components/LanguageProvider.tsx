import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  LanguageContext,
  STORAGE_KEY,
  STRINGS,
  getInitialLanguage,
  type Language,
} from '../lib/i18n';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A remembered choice is a convenience, not a requirement.
    }
  }, []);

  const value = useMemo(
    () => ({ language, setLanguage, t: STRINGS[language] }),
    [language, setLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}
