import type { DB } from './db.ts';
import { config } from './config.ts';

// Nominatim usage policy: identify the app, at most 1 request per second, cache results,
// no autocomplete. The browser never calls Nominatim directly; everything goes through here.

const MIN_GAP_MS = 1100;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
let chain: Promise<unknown> = Promise.resolve();
let lastCall = 0;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  chain = run.catch(() => undefined);
  return run;
}

async function cached<T>(db: DB, key: string, fetcher: () => Promise<T>): Promise<T> {
  const row = db.prepare('SELECT value, created_at FROM geocache WHERE key = ?').get(key) as
    | { value: string; created_at: number }
    | undefined;
  if (row && Date.now() - row.created_at < CACHE_TTL_MS) return JSON.parse(row.value) as T;
  const value = await throttled(fetcher);
  db.prepare('INSERT OR REPLACE INTO geocache (key, value, created_at) VALUES (?, ?, ?)').run(
    key,
    JSON.stringify(value),
    Date.now(),
  );
  return value;
}

async function get(path: string, params: Record<string, string>): Promise<unknown> {
  const url = `${config.nominatimUrl}${path}?${new URLSearchParams({ format: 'jsonv2', ...params })}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': config.nominatimUserAgent, Referer: config.publicUrl },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return res.json();
}

export interface Place {
  name: string;
  lat: number;
  lng: number;
}

function shortName(r: { name?: string; display_name?: string; address?: Record<string, string> }): string {
  const a = r.address ?? {};
  const local = r.name || a.amenity || a.road || a.neighbourhood || a.suburb || a.village || a.town || '';
  const city = a.city || a.town || a.village || a.municipality || a.county || '';
  const country = a.country || '';
  const parts = [local, city !== local ? city : '', country].filter(Boolean);
  return (parts.join(', ') || r.display_name || '').slice(0, 120);
}

export async function searchPlaces(db: DB, q: string, lang: string): Promise<Place[]> {
  const query = q.trim().slice(0, 120);
  if (query.length < 2) return [];
  const key = `s:${lang}:${query.toLowerCase()}`;
  return cached(db, key, async () => {
    const data = (await get('/search', { q: query, limit: '5', addressdetails: '1', 'accept-language': lang })) as {
      lat: string;
      lon: string;
      name?: string;
      display_name?: string;
      address?: Record<string, string>;
    }[];
    return data.map((r) => ({ name: shortName(r), lat: Number(r.lat), lng: Number(r.lon) }));
  });
}

export async function reversePlace(db: DB, lat: number, lng: number, lang: string): Promise<string> {
  // ~11 m grid: neighbours share the cache and Nominatim sees fewer requests.
  const rl = lat.toFixed(4);
  const rg = lng.toFixed(4);
  const key = `r:${lang}:${rl},${rg}`;
  return cached(db, key, async () => {
    const r = (await get('/reverse', { lat: rl, lon: rg, zoom: '17', addressdetails: '1', 'accept-language': lang })) as {
      name?: string;
      display_name?: string;
      address?: Record<string, string>;
      error?: string;
    };
    return r.error ? '' : shortName(r);
  });
}
