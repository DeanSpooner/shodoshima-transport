import { ShodoshimaMap } from './components/ShodoshimaMap';
import { LanguageToggle } from './components/LanguageToggle';
import { Clock } from './components/Clock';
import { LanguageProvider } from './components/LanguageProvider';
import { useLanguage } from './lib/i18n';

function AppShell() {
  const { language, t } = useLanguage();

  return (
    <div className='h-screen w-screen flex flex-col' lang={language}>
      <header className='flex items-center gap-2 px-4 py-2.5 bg-olive-800 text-olive-50 text-sm font-semibold tracking-wide border-b-2 border-clay-500'>
        <img
          src='/Olive_Shima-chan-square.png'
          alt=''
          className='h-6 w-6 rounded-full bg-olive-50'
        />
        {t.appTitle}
        <div className='ml-auto flex items-center gap-3'>
          <Clock />
          <LanguageToggle />
        </div>
      </header>
      <main className='flex-1'>
        <ShodoshimaMap />
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
