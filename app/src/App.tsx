import { ShodoshimaMap } from './components/ShodoshimaMap';

function App() {
  return (
    <div className='h-screen w-screen flex flex-col'>
      <header className='flex items-center gap-2 px-4 py-2.5 bg-olive-800 text-olive-50 text-sm font-semibold tracking-wide border-b-2 border-clay-500'>
        <img
          src='/Olive_Shima-chan-square.png'
          alt=''
          className='h-6 w-6 rounded-full bg-olive-50'
        />
        Shodoshima Bus Routes
        <a
          href='https://github.com/DeanSpooner'
          target='_blank'
          rel='noopener noreferrer'
          className='ml-auto text-xs font-normal text-olive-200 transition-colors duration-200 hover:text-olive-50 hover:underline'
        >
          Built by Dean Spooner
        </a>
      </header>
      <main className='flex-1'>
        <ShodoshimaMap />
      </main>
    </div>
  );
}

export default App;
