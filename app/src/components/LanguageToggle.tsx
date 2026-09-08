import { useLanguage, type Language } from '../lib/i18n';

const OPTIONS: { value: Language; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'ja', label: '日本語' },
];

export function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();

  // One control rather than two buttons: clicking anywhere on it flips to the
  // other language, so hitting the already-active half still does something.
  // The two labels are presentational, showing which side is current.
  const other: Language = language === 'en' ? 'ja' : 'en';

  return (
    <button
      type='button'
      onClick={() => setLanguage(other)}
      aria-label={t.switchLanguage}
      title={t.switchLanguage}
      className='flex items-center gap-0.5 rounded-md bg-olive-900/40 p-0.5 transition-colors duration-200 hover:bg-olive-900/60'
    >
      {OPTIONS.map(option => {
        const isActive = option.value === language;
        return (
          <span
            key={option.value}
            lang={option.value}
            className={`rounded px-2 py-0.5 text-xs font-medium transition-colors duration-200 ${
              isActive
                ? 'bg-olive-100 text-olive-900'
                : 'text-olive-200'
            }`}
          >
            {option.label}
          </span>
        );
      })}
    </button>
  );
}
