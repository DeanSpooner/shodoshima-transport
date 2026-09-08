import { copyFileSync } from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

// MapLibre resolves its worker script's URL at runtime relative to its own
// bundled script location, not via a static import Vite can detect and
// hash/copy automatically. Without this, the worker 404s in production
// (it only works in dev because the dev server serves node_modules
// directly) and the map silently never renders any tiles or data.
// The worker file itself also has a relative import of maplibre-gl-shared.mjs,
// which needs to sit alongside it or the worker fails inside its own
// module scope (silently, with no error visible on the main page/console).
const MAPLIBRE_WORKER_FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

function copyMaplibreWorker(): Plugin {
  return {
    name: 'copy-maplibre-worker',
    apply: 'build',
    closeBundle() {
      for (const file of MAPLIBRE_WORKER_FILES) {
        const src = path.resolve(
          import.meta.dirname,
          `node_modules/maplibre-gl/dist/${file}`,
        )
        const dest = path.resolve(import.meta.dirname, `dist/assets/${file}`)
        copyFileSync(src, dest)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), copyMaplibreWorker()],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
