import { useState } from 'react';
import { ShodoshimaMap } from './components/ShodoshimaMap';
import { LanguageToggle } from './components/LanguageToggle';
import { Clock } from './components/Clock';
import { LanguageProvider } from './components/LanguageProvider';
import { useLanguage } from './lib/i18n';

function AppShell() {
  const { language, t } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className='h-screen w-screen flex flex-col' lang={language}>
      <header className='flex items-center gap-2 px-4 py-2.5 bg-olive-800 text-olive-50 text-sm font-semibold tracking-wide border-b-2 border-clay-500'>
        <button
          type='button'
          onClick={() => setIsMenuOpen(true)}
          aria-label={t.openMenu}
          aria-expanded={isMenuOpen}
          className='-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded text-olive-50 transition-colors duration-200 hover:bg-olive-900/40 sm:hidden'
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
            <line x1='3' y1='6' x2='21' y2='6' />
            <line x1='3' y1='12' x2='21' y2='12' />
            <line x1='3' y1='18' x2='21' y2='18' />
          </svg>
        </button>

        <img
          src='/Olive_Shima-chan-square.png'
          alt=''
          className='h-6 w-6 rounded-full bg-olive-50'
        />
        <span className='truncate'>{t.appTitle}</span>

        <div className='ml-auto flex items-center gap-3'>
          <Clock />
          {/* On mobile the toggle lives in the drawer instead. */}
          <span className='hidden sm:block'>
            <LanguageToggle />
          </span>
        </div>
      </header>
      <main className='flex-1'>
        <ShodoshimaMap
          isMenuOpen={isMenuOpen}
          onCloseMenu={() => setIsMenuOpen(false)}
        />
      </main>
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AppShell />
    </LanguageProvider>
  );
}

export default App;
