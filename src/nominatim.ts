import type { DB } from './db.ts';
import { config } from './config.ts';
import { fromNominatim, fromPhoton, type Bias, type NominatimRow, type PhotonFeature, type PlaceResult, type Providers } from './places.ts';

// Outside geocoders, both open and keyless. The browser never calls them directly.
// Nominatim policy: identify the app, at most 1 request per second, cache, no autocomplete.
// Photon (photon.komoot.io) is fine for search-as-you-type within fair use: we still identify
// the app, cache every answer, merge identical requests in flight and cap the rate.

const DAY = 24 * 60 * 60 * 1000;

function gate(minGapMs: number) {
  let chain: Promise<unknown> = Promise.resolve();
  let last = 0;
  return function throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = last + minGapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      return fn();
    });
    chain = run.catch(() => undefined);
    return run;
  };
}

const nominatimGate = gate(1100);
const photonGate = gate(250);
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(db: DB, key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const row = db.prepare('SELECT value, created_at FROM geocache WHERE key = ?').get(key) as
    | { value: string; created_at: number }
    | undefined;
  if (row && Date.now() - row.created_at < ttlMs) return JSON.parse(row.value) as T;
  let job = inflight.get(key) as Promise<T> | undefined;
  if (!job) {
    job = fetcher()
      .then((value) => {
        db.prepare('INSERT OR REPLACE INTO geocache (key, value, created_at) VALUES (?, ?, ?)').run(
          key,
          JSON.stringify(value),
          Date.now(),
        );
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return job;
}

const headers = () => ({ 'User-Agent': config.nominatimUserAgent, Referer: config.publicUrl });

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

const nominatimGet = (path: string, params: Record<string, string>) =>
  nominatimGate(() =>
    getJson(`${config.nominatimUrl}${path}?${new URLSearchParams({ format: 'jsonv2', ...params })}`, 8000),
  );

/** Bias is rounded so neighbours in the same view share the cache. Below zoom 4 there is no bias. */
export function biasKey(bias: Bias | null): string {
  if (!bias || bias.zoom < 4) return 'world';
  const step = bias.zoom >= 11 ? 0.05 : bias.zoom >= 7 ? 0.5 : 2;
  const r = (v: number) => (Math.round(v / step) * step).toFixed(2);
  return `${r(bias.lat)},${r(bias.lng)},${Math.min(16, Math.round(bias.zoom))}`;
}

export function makeProviders(db: DB): Providers {
  return {
    async photon(q, lang, bias) {
      const plang = ['en', 'de', 'fr'].includes(lang) ? lang : 'default';
      const key = `p:${plang}:${biasKey(bias)}:${q.toLowerCase()}`;
      const features = await cached(db, key, 7 * DAY, async () => {
        const params = new URLSearchParams({ q, limit: '10', lang: plang });
        if (bias && bias.zoom >= 4) {
          params.set('lat', bias.lat.toFixed(3));
          params.set('lon', bias.lng.toFixed(3));
          params.set('zoom', String(Math.min(16, Math.round(bias.zoom))));
          params.set('location_bias_scale', '0.3');
        }
        const data = (await photonGate(() => getJson(`${config.photonUrl}/api/?${params}`, 4000))) as {
          features?: PhotonFeature[];
        };
        return data.features ?? [];
      });
      return features.map((f) => fromPhoton(f, lang)).filter((r): r is PlaceResult => !!r);
    },

    async nominatim(q, lang, bias) {
      const key = `n:${lang}:${biasKey(bias)}:${q.toLowerCase()}`;
      const rows = await cached(db, key, 30 * DAY, async () => {
        const params: Record<string, string> = { q, limit: '6', addressdetails: '1', 'accept-language': lang };
        if (bias && bias.zoom >= 4) {
          // Prefer, but do not restrict to, roughly what is on screen.
          const span = Math.min(60, 360 / 2 ** bias.zoom) * 1.5;
          params.viewbox = [bias.lng - span, bias.lat + span, bias.lng + span, bias.lat - span].map((v) => v.toFixed(3)).join(',');
        }
        return (await nominatimGet('/search', params)) as NominatimRow[];
      });
      return rows.map((r) => fromNominatim(r, lang)).filter((r): r is PlaceResult => !!r);
    },
  };
}

function shortName(r: { name?: string; display_name?: string; address?: Record<string, string> }): string {
  const a = r.address ?? {};
  const local = r.name || a.amenity || a.road || a.neighbourhood || a.suburb || a.village || a.town || '';
  const city = a.city || a.town || a.village || a.municipality || a.county || '';
  const country = a.country || '';
  const parts = [local, city !== local ? city : '', country].filter(Boolean);
  return (parts.join(', ') || r.display_name || '').slice(0, 120);
}

export async function reversePlace(db: DB, lat: number, lng: number, lang: string): Promise<string> {
  // ~11 m grid: neighbours share the cache and Nominatim sees fewer requests.
  const rl = lat.toFixed(4);
  const rg = lng.toFixed(4);
  const key = `r:${lang}:${rl},${rg}`;
  return cached(db, key, 30 * DAY, async () => {
    const r = (await nominatimGet('/reverse', { lat: rl, lon: rg, zoom: '17', addressdetails: '1', 'accept-language': lang })) as {
      name?: string;
      display_name?: string;
      address?: Record<string, string>;
      error?: string;
    };
    return r.error ? '' : shortName(r);
  });
}
