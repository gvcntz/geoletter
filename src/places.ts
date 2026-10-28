// Place search. Photon (OpenStreetMap, typo tolerant, allowed for search-as-you-type) answers
// while the person types; Nominatim joins in when they press Enter, and takes over if Photon is
// down. Pasted coordinates never leave the server. The pure parts are exported for the tests.

export interface PlaceResult {
  /** What the place is called: "Praça Saldanha Marinho", "Rua do Acampamento, 100". */
  name: string;
  /** Where it is: "Centro, Santa Maria, Rio Grande do Sul, Brasil". */
  context: string;
  /** A small closed vocabulary the page translates: city, street, square, hospital, coords… */
  kind: string;
  lat: number;
  lng: number;
  /** Text proposed for the "Place" field when this result is chosen. */
  label: string;
  source: 'coords' | 'photon' | 'nominatim';
  /** Nominatim's own 0..1 estimate of how well known the place is. */
  importance?: number;
}

export interface Bias {
  lat: number;
  lng: number;
  zoom: number;
}

// ---------- coordinates ----------

function inRange(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function ordered(a: number, b: number): { lat: number; lng: number } | null {
  if (inRange(a, b)) return { lat: a, lng: b };
  // "-53.80, -29.68" (longitude first, as in GeoJSON) is only unambiguous when |first| > 90.
  if (inRange(b, a)) return { lat: b, lng: a };
  return null;
}

const SOUTH_WEST = /^[SWO]$/i; // O = oeste (pt/es); E and L (leste) are east.

function signed(value: number, hemisphere: string | undefined): number {
  return hemisphere && SOUTH_WEST.test(hemisphere) ? -Math.abs(value) : value;
}

/**
 * Accepts what people paste: "-29.68, -53.80", "-29.68 -53.80", "-29,68; -53,80",
 * "29.68 S 53.80 W", "29°41'S 53°48'W", "29°41'12.5\"S, 53°48'30\"O" and map links with "@lat,lng".
 */
export function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const s = input.trim().replace(/[()[\]]/g, '').replace(/\s+/g, ' ');
  if (!s || s.length > 120) return null;

  const at = /@(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/.exec(s);
  if (at) return ordered(Number(at[1]), Number(at[2]));

  const part = String.raw`(\d{1,3})\s*°\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['′’]\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:"|″|”|''|’’)\s*)?([NSEWLO])`;
  const dms = new RegExp(`^${part}[\\s,;]*${part}$`, 'i').exec(s);
  if (dms) {
    const val = (d: string, m?: string, sec?: string) =>
      Number(d) + Number((m ?? '0').replace(',', '.')) / 60 + Number((sec ?? '0').replace(',', '.')) / 3600;
    const a = signed(val(dms[1], dms[2], dms[3]), dms[4]);
    const b = signed(val(dms[5], dms[6], dms[7]), dms[8]);
    const aIsLat = /[NS]/i.test(dms[4]);
    const bIsLat = /[NS]/i.test(dms[8]);
    if (aIsLat === bIsLat) return null;
    return aIsLat ? (inRange(a, b) ? { lat: a, lng: b } : null) : inRange(b, a) ? { lat: b, lng: a } : null;
  }

  // Decimal point: separated by a comma, semicolon or space.
  const num = String.raw`([+-]?\d{1,3}(?:\.\d+)?)\s*°?\s*([NSEWLO])?`;
  let m = new RegExp(`^${num}\\s*[,; ]\\s*${num}$`, 'i').exec(s);
  // Decimal comma (pt, es, de): then the separator can only be a semicolon or a space.
  if (!m) {
    const numc = String.raw`([+-]?\d{1,3}(?:,\d+)?)\s*°?\s*([NSEWLO])?`;
    m = new RegExp(`^${numc}\\s*(?:;\\s*|\\s+)${numc}$`, 'i').exec(s);
    if (m) {
      m[1] = m[1].replace(',', '.');
      m[3] = m[3].replace(',', '.');
    }
  }
  if (!m) return null;
  // Two bare integers ("10 20", "7 100") are more likely part of an address than a position.
  const looksLikePosition = /\./.test(m[1] + m[3]) || !!m[2] || !!m[4] || s.includes('°');
  if (!looksLikePosition) return null;
  const a = signed(Number(m[1]), m[2]);
  const b = signed(Number(m[3]), m[4]);
  if (m[2] && /[EWLO]/i.test(m[2]) && (!m[4] || /[NS]/i.test(m[4]))) return inRange(b, a) ? { lat: b, lng: a } : null;
  return ordered(a, b);
}

// ---------- text helpers ----------

/** Lower case, no accents, single spaces: "Panteón  General" -> "panteon general". */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export const BR_STATES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

/**
 * "Santa Maria RS", "Santa Maria - RS", "Santa Maria/RS": Photon does not know the
 * abbreviations, so the query sent to it carries the state name and results in that state
 * go first. Only a trailing two-letter code after at least one other word counts.
 */
export function splitBrazilianState(q: string): { query: string; state: string | null } {
  const m = /^(.*?\S)\s*([,/-]\s*|\s+)([A-Za-z]{2})\.?$/.exec(q.trim());
  if (!m) return { query: q.trim(), state: null };
  const state = BR_STATES[m[3].toUpperCase()];
  if (!state || !/\p{L}{2}/u.test(m[1])) return { query: q.trim(), state: null };
  // "Santa Ma" is someone halfway through "Santa Maria", not Maranhão. A code counts when it is
  // written in capitals, comes after punctuation, or follows at least two words.
  const punctuated = /[,/-]/.test(m[2]);
  const capitals = m[3] === m[3].toUpperCase();
  const words = m[1].trim().split(/\s+/).length;
  if (!punctuated && !capitals && words < 2) return { query: q.trim(), state: null };
  return { query: `${m[1].replace(/[\s,/-]+$/, '')}, ${state}`, state };
}

function editDistanceAtMost(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'del', 'la', 'el', 'e', 'y', 'of', 'the', 'and', 'des', 'du', 'di']);

function initials(foldedName: string): string {
  return foldedName
    .split(' ')
    .filter((w) => w && !SMALL_WORDS.has(w))
    .map((w) => w[0])
    .join('');
}

/** Share of the query words found in the result, allowing prefixes, one typo and acronyms. */
export function matchScore(query: string, r: Pick<PlaceResult, 'name' | 'context'>): number {
  const words = fold(query).split(' ').filter((w) => w && !SMALL_WORDS.has(w) && !/^\d+$/.test(w));
  if (!words.length) return 1;
  const name = fold(r.name);
  const inName = name.split(' ');
  const inContext = fold(r.context).split(' ');
  const acronym = initials(name);
  let hits = 0;
  words.forEach((w, i) => {
    // The word still being typed counts as a prefix from two letters on.
    const minPrefix = i === words.length - 1 ? 2 : 3;
    const same = (h: string) => h === w || (w.length >= minPrefix && h.startsWith(w));
    const close = (h: string) => w.length >= 4 && editDistanceAtMost(w, h, w.length >= 8 ? 2 : 1);
    // A word in the name says more than the same word in the city or state around it.
    if (inName.some(same)) hits += 1;
    else if (w.length >= 3 && w.length <= 6 && acronym.includes(w)) hits += 1;
    else if (inName.some(close)) hits += 0.8;
    else if (inContext.some(same)) hits += 0.75;
    else if (inContext.some(close)) hits += 0.6;
  });
  return hits / words.length;
}

// ---------- kinds ----------

const KIND_BY_VALUE: Record<string, string> = {
  city: 'city', town: 'city', municipality: 'city', village: 'village', hamlet: 'village',
  state: 'state', province: 'state', region: 'state', country: 'country',
  suburb: 'district', neighbourhood: 'district', quarter: 'district', borough: 'district', city_district: 'district',
  square: 'square', park: 'park', garden: 'park', cemetery: 'cemetery', grave_yard: 'cemetery',
  hospital: 'hospital', clinic: 'hospital', school: 'school', kindergarten: 'school',
  university: 'university', college: 'university', place_of_worship: 'church', church: 'church', cathedral: 'church',
  beach: 'beach', marketplace: 'market', market: 'market', station: 'station', train_station: 'station',
  stop: 'station', halt: 'station', bus_stop: 'stop', taxi: 'stop', platform: 'stop', stop_position: 'stop',
  house: 'address', residential: 'street', bakery: 'shop', cafe: 'cafe', restaurant: 'cafe',
  museum: 'museum', theatre: 'theatre', stadium: 'stadium', island: 'island', bay: 'beach',
  memorial: 'memorial', monument: 'memorial', attraction: 'place', viewpoint: 'place',
};

const STREET_VALUES = new Set([
  'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'pedestrian',
  'trunk', 'motorway', 'service', 'footway', 'road', 'street',
]);

export function kindOf(osmKey: string | undefined, osmValue: string | undefined, type?: string): string {
  const v = (osmValue ?? '').toLowerCase();
  const k = (osmKey ?? '').toLowerCase();
  if (k === 'highway' && v === 'pedestrian' && type !== 'street') return 'square';
  if (k === 'highway' && STREET_VALUES.has(v)) return 'street';
  if (k === 'place' && v === 'square') return 'square';
  if (k === 'place' && v === 'house') return 'address';
  if (KIND_BY_VALUE[v]) return KIND_BY_VALUE[v];
  if (k === 'shop') return 'shop';
  if (type === 'street') return 'street';
  return 'place';
}

// ---------- formatting ----------

function countryName(code: string | undefined, fallback: string | undefined, lang: string): string {
  if (code && /^[a-z]{2}$/i.test(code)) {
    try {
      const n = new Intl.DisplayNames([lang], { type: 'region' }).of(code.toUpperCase());
      if (n && n !== code.toUpperCase()) return n;
    } catch {
      /* fall through */
    }
  }
  return fallback ?? '';
}

function joinUnique(parts: (string | undefined | null)[], exclude: string[] = []): string {
  const seen = new Set(exclude.map(fold));
  const out: string[] = [];
  for (const p of parts) {
    const t = (p ?? '').trim();
    if (!t || seen.has(fold(t))) continue;
    seen.add(fold(t));
    out.push(t);
  }
  return out.join(', ');
}

const cap = (s: string, n: number) => ([...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s);

function finish(r: Omit<PlaceResult, 'label'>): PlaceResult {
  const city = r.context.split(', ').find((p) => p && p !== r.name) ?? '';
  // The place field gets "name, nearest bigger place": enough to recognise it on the letter.
  const label = cap(joinUnique([r.name, r.kind === 'country' || r.kind === 'state' ? '' : city]), 120);
  return { ...r, name: cap(r.name, 100), context: cap(r.context, 140), label };
}

export interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined> & { extent?: unknown };
}

export function fromPhoton(f: PhotonFeature, lang: string): PlaceResult | null {
  const p = f.properties;
  const [lng, lat] = f.geometry?.coordinates ?? [];
  if (!inRange(lat, lng)) return null;
  const kind = kindOf(p.osm_key, p.osm_value, p.type);
  const street = p.street && p.housenumber ? `${p.street}, ${p.housenumber}` : p.street;
  let name = p.name || '';
  if (!name && street) name = street;
  else if (!name && p.housenumber) name = p.housenumber;
  if (!name) return null;
  const country = countryName(p.countrycode, p.country, lang);
  const smallPlace = kind === 'street' || kind === 'address' || kind === 'square' || kind === 'stop';
  const context = joinUnique(
    [
      kind !== 'street' && name !== street ? street : '',
      smallPlace || kind === 'place' || kind === 'hospital' || kind === 'school' ? p.district : '',
      p.city,
      p.city ? '' : p.county,
      p.state,
      country,
    ],
    [name],
  );
  return finish({ name, context, kind, lat, lng, source: 'photon' });
}

export interface NominatimRow {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  category?: string;
  class?: string;
  type?: string;
  addresstype?: string;
  importance?: number;
  address?: Record<string, string>;
}

export function fromNominatim(r: NominatimRow, lang: string): PlaceResult | null {
  const lat = Number(r.lat);
  const lng = Number(r.lon);
  if (!inRange(lat, lng)) return null;
  const a = r.address ?? {};
  const category = r.category ?? r.class;
  // Cities and states come back as "boundary/administrative": the address type says which.
  const value = category === 'boundary' || r.type === 'yes' || r.type === 'administrative' ? r.addresstype : r.type;
  const kind = kindOf(category === 'boundary' ? 'place' : category, value, r.addresstype);
  const street = a.road && a.house_number ? `${a.road}, ${a.house_number}` : a.road;
  const name = r.name || street || (r.display_name ?? '').split(',')[0] || '';
  if (!name) return null;
  const city = a.city || a.town || a.village || a.municipality || '';
  const context = joinUnique(
    [
      kind !== 'street' && name !== street ? street : '',
      a.suburb || a.neighbourhood || a.quarter,
      city,
      city ? '' : a.county,
      a.state,
      countryName(a.country_code, a.country, lang),
    ],
    [name],
  );
  const out = finish({ name, context, kind, lat, lng, source: 'nominatim' });
  return typeof r.importance === 'number' ? { ...out, importance: r.importance } : out;
}

export function coordsResult(lat: number, lng: number): PlaceResult {
  return {
    name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    context: '',
    kind: 'coords',
    lat,
    lng,
    label: '',
    source: 'coords',
  };
}

// ---------- merging ----------

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

/**
 * One line per real place: the five segments of "Rua do Acampamento" and the four nodes of
 * "Times Square" become one each. Same name and same context within 2 km are the same place;
 * the first (best ranked) one stays.
 */
export function dedupe(results: PlaceResult[]): PlaceResult[] {
  const out: PlaceResult[] = [];
  for (const r of results) {
    const key = `${fold(r.name)}|${fold(r.context)}`;
    const twin = out.find(
      (o) =>
        (`${fold(o.name)}|${fold(o.context)}` === key && metersBetween(o, r) < 2000) ||
        (fold(o.name) === fold(r.name) && metersBetween(o, r) < 150),
    );
    if (!twin) out.push(r);
  }
  return out;
}

const KIND_WEIGHT: Record<string, number> = { stop: -0.6, shop: -0.15, address: 0.05 };

/** Best first. Keeps each source's own order as the main signal, corrected by how well the text matches. */
export function rank(query: string, lists: PlaceResult[][], state: string | null = null): PlaceResult[] {
  const scored: { r: PlaceResult; s: number; m: number }[] = [];
  // The same place found by both geocoders is more likely the one meant.
  const twinIn = (r: PlaceResult, list: PlaceResult[]) =>
    list.find((o) => fold(o.name) === fold(r.name) && metersBetween(o, r) < 1000);
  for (const list of lists) {
    const others = lists.filter((l) => l !== list).flat();
    list.forEach((r, i) => {
      const m = matchScore(query, r);
      const twin = twinIn(r, others);
      const importance = r.importance ?? twin?.importance ?? 0;
      let s = m * 2 + 0.6 / (1 + i) + (KIND_WEIGHT[r.kind] ?? 0) - r.name.length / 2000;
      if (twin) s += 0.3 + importance * 0.5;
      if (state && fold(r.context).includes(fold(state))) s += 0.8;
      scored.push({ r, s, m });
    });
  }
  scored.sort((a, b) => b.s - a.s);
  // "Mara Rosa Beauty" for "Santa Mara": results that share little with the query go away,
  // unless nothing matches better (then the providers' own guess is all we have).
  const anyGood = scored.some((x) => x.m >= 0.75);
  return dedupe(scored.filter((x) => !anyGood || x.m >= 0.5).map((x) => x.r));
}

// ---------- the search itself ----------

export interface Providers {
  photon(q: string, lang: string, bias: Bias | null): Promise<PlaceResult[]>;
  nominatim(q: string, lang: string, bias: Bias | null): Promise<PlaceResult[]>;
}

export interface SearchAnswer {
  results: PlaceResult[];
  /** True when a provider failed and the answer may be incomplete. */
  degraded: boolean;
}

/**
 * mode "suggest": while typing. Photon only (Nominatim forbids autocomplete).
 * mode "full": after Enter. Photon and Nominatim together; either one alone is enough.
 */
export async function searchPlaces(
  q: string,
  opts: { lang: string; bias: Bias | null; mode: 'suggest' | 'full'; limit?: number },
  providers: Providers,
): Promise<SearchAnswer> {
  const query = q.trim().replace(/\s+/g, ' ').slice(0, 120);
  const limit = opts.limit ?? 6;
  const coords = parseCoordinates(query);
  if (coords) return { results: [coordsResult(coords.lat, coords.lng)], degraded: false };
  if ([...query].length < 2) return { results: [], degraded: false };

  const { query: photonQuery, state } = splitBrazilianState(query);
  const photon = providers.photon(photonQuery, opts.lang, opts.bias).then(
    (r) => ({ ok: true as const, r }),
    () => ({ ok: false as const, r: [] as PlaceResult[] }),
  );
  const nominatim =
    opts.mode === 'full'
      ? providers.nominatim(query, opts.lang, opts.bias).then(
          (r) => ({ ok: true as const, r }),
          () => ({ ok: false as const, r: [] as PlaceResult[] }),
        )
      : Promise.resolve({ ok: true as const, r: [] as PlaceResult[] });
  const [p, n] = await Promise.all([photon, nominatim]);
  const rankQuery = state ? query.replace(/\s*[,/-]?\s*[A-Za-z]{2}\.?$/, '') : query;
  return {
    results: rank(rankQuery, [p.r, n.r], state).slice(0, limit),
    degraded: !p.ok || !n.ok,
  };
}
