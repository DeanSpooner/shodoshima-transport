// Downloads the latest published GTFS feed for Shodoshima's town bus from
// ODPT and extracts it into ../data-1, replacing the committed snapshot.
// Requires ODPT_ACCESS_TOKEN (see app/.env.example). Run with `npm run fetch:gtfs`.
//
// If ODPT can't be reached (no token, offline, API down), and a data-1/
// from a previous fetch is already present, that existing data is reused
// instead of failing the build.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  createReadStream,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import unzipper from 'unzipper'
import { fetchOdptFile } from '../utils/odptClient.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OPERATOR = 'ShodoshimaTown'
const FILENAME = 'data-1.zip'
const REPO_ROOT = path.resolve(__dirname, '../..')
const OUT_DIR = path.join(REPO_ROOT, 'data-1')
const TMP_DIR = path.join(REPO_ROOT, 'data-1.tmp')
const ZIP_PATH = path.join(REPO_ROOT, 'data-1.zip')

function hasExistingData(): boolean {
  return existsSync(OUT_DIR) && readdirSync(OUT_DIR).length > 0
}

async function fetchAndExtract() {
  const zip = await fetchOdptFile(OPERATOR, FILENAME)
  writeFileSync(ZIP_PATH, Buffer.from(zip))

  rmSync(TMP_DIR, { recursive: true, force: true })
  mkdirSync(TMP_DIR, { recursive: true })

  await createReadStream(ZIP_PATH)
    .pipe(unzipper.Extract({ path: TMP_DIR }))
    .promise()

  rmSync(ZIP_PATH)

  // Only replace the existing data-1/ once the new copy has downloaded and
  // extracted successfully, so a failed fetch never destroys working data.
  rmSync(OUT_DIR, { recursive: true, force: true })
  renameSync(TMP_DIR, OUT_DIR)

  console.log(`Fetched and extracted ${FILENAME} into data-1/`)
}

try {
  await fetchAndExtract()
} catch (err) {
  rmSync(TMP_DIR, { recursive: true, force: true })
  rmSync(ZIP_PATH, { force: true })

  if (hasExistingData()) {
    console.warn(
      `Warning: couldn't refresh GTFS data from ODPT (${(err as Error).message}). Reusing existing data-1/.`,
    )
  } else {
    console.error(
      `Failed to fetch GTFS data from ODPT and no existing data-1/ to fall back to.`,
    )
    throw err
  }
}
