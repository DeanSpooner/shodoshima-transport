import { ShodoshimaMap } from './components/ShodoshimaMap'

function App() {
  return (
    <div className="h-screen w-screen flex flex-col">
      <header className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold">
        Shodoshima Transit
      </header>
      <main className="flex-1">
        <ShodoshimaMap />
      </main>
    </div>
  )
}

export default App
