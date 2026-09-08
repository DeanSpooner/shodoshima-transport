// Client for the ODPT (Open Data Platform for Transportation, Japan) API.
// https://ckan.odpt.org/en/
//
// Build-time use only: ODPT_ACCESS_TOKEN is a secret consumer key, so this
// must only run in Node scripts (see scripts/fetch-gtfs.ts), never be
// imported into src/ where Vite would bundle it into client-side code.

const ODPT_BASE_URL = 'https://api.odpt.org/api/v4';

function getAccessToken(): string {
  const token = process.env.ODPT_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      'ODPT_ACCESS_TOKEN is not set. Add it to app/.env (see .env.example).',
    );
  }
  return token;
}

/**
 * Downloads a static data file (e.g. a GTFS zip) published by an operator
 * on ODPT, such as https://api.odpt.org/api/v4/files/ShodoshimaTown/data/data-1.zip
 */
export async function fetchOdptFile(
  operator: string,
  filename: string,
): Promise<ArrayBuffer> {
  const url = new URL(`${ODPT_BASE_URL}/files/${operator}/data/${filename}`);
  url.searchParams.set('acl:consumerKey', getAccessToken());

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `ODPT request failed: ${res.status} ${res.statusText} (${url.pathname})`,
    );
  }
  return res.arrayBuffer();
}
