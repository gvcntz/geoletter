import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupe, fold, fromNominatim, fromPhoton, kindOf, matchScore, parseCoordinates, rank, searchPlaces,
  splitBrazilianState, type PhotonFeature, type PlaceResult, type Providers,
} from '../src/places.ts';
import { biasKey } from '../src/nominatim.ts';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-4;

test('coordinates: the ways people paste them', () => {
  const sm = { lat: -29.68, lng: -53.8 };
  for (const s of ['-29.68, -53.80', '-29.68,-53.80', '-29.68 -53.80', '(-29.68, -53.80)', '-29,68; -53,80', '-29,68 -53,80',
    '29.68 S 53.80 W', '29.68S, 53.80O', '29.68° S, 53.80° W', 'https://www.google.com/maps/@-29.68,-53.8,15z']) {
    const c = parseCoordinates(s);
    assert.ok(c, s);
    assert.ok(near(c.lat, sm.lat) && near(c.lng, sm.lng), `${s} -> ${JSON.stringify(c)}`);
  }
  const dms = parseCoordinates(`29°40'48"S 53°48'0"W`)!;
  assert.ok(near(dms.lat, -29.68) && near(dms.lng, -53.8), JSON.stringify(dms));
  const dmsPt = parseCoordinates(`29°40'48"S, 53°48'O`)!;
  assert.ok(near(dmsPt.lat, -29.68) && near(dmsPt.lng, -53.8));
  // Longitude first, unambiguous because it is beyond 90.
  assert.deepEqual(parseCoordinates('-122.4194, 37.7749'), { lat: 37.7749, lng: -122.4194 });
  // East/west given first.
  const ew = parseCoordinates('3.38 E 6.52 N')!;
  assert.ok(near(ew.lat, 6.52) && near(ew.lng, 3.38));
});

test('coordinates: what is not a position stays a search', () => {
  for (const s of ['Rua do Acampamento 100', '10 20', '7, 100', 'UFSM', '95.5, 200.1', '', 'Times Square', '1600 Pennsylvania Ave']) {
    assert.equal(parseCoordinates(s), null, s);
  }
});

test('Brazilian state abbreviations become the state name for Photon', () => {
  assert.deepEqual(splitBrazilianState('Santa Maria RS'), { query: 'Santa Maria, Rio Grande do Sul', state: 'Rio Grande do Sul' });
  assert.deepEqual(splitBrazilianState('Santa Maria - RS'), { query: 'Santa Maria, Rio Grande do Sul', state: 'Rio Grande do Sul' });
  assert.deepEqual(splitBrazilianState('Bauru/sp'), { query: 'Bauru, São Paulo', state: 'São Paulo' });
  assert.equal(splitBrazilianState('Times Square NY').state, null);
  assert.equal(splitBrazilianState('RS').state, null);
  assert.equal(splitBrazilianState('Copacabana').state, null);
});

test('fold and match: accents, typos, prefixes and acronyms', () => {
  assert.equal(fold('Panteón  General, Oaxaca'), 'panteon general oaxaca');
  const ufsm = { name: 'Universidade Federal de Santa Maria', context: 'Camobi, Santa Maria, Rio Grande do Sul, Brasil' };
  assert.equal(matchScore('UFSM', ufsm), 1);
  assert.equal(matchScore('Panteon General', { name: 'Panteón General', context: 'Oaxaca, México' }), 1);
  assert.ok(matchScore('Times Sqare', { name: 'Times Square', context: 'Manhattan, New York' }) >= 0.9);
  assert.ok(matchScore('Santa Ma', { name: 'Santa Maria', context: 'Rio Grande do Sul, Brasil' }) === 1);
  assert.ok(matchScore('Copacabana', { name: 'Mara Rosa Beauty', context: 'Porto Alegre' }) === 0);
});

const feature = (props: Record<string, string>, lng = -53.8069, lat = -29.686): PhotonFeature => ({
  geometry: { coordinates: [lng, lat] },
  properties: props,
});

test('Photon results get a name, a kind and a context with city, state and country', () => {
  const praca = fromPhoton(feature({ name: 'Praça Saldanha Marinho', osm_key: 'leisure', osm_value: 'park', type: 'other', district: 'Centro', city: 'Santa Maria', state: 'Rio Grande do Sul', country: 'Brasil', countrycode: 'BR' }), 'pt')!;
  assert.equal(praca.name, 'Praça Saldanha Marinho');
  assert.equal(praca.kind, 'park');
  assert.equal(praca.context, 'Santa Maria, Rio Grande do Sul, Brasil');
  assert.equal(praca.label, 'Praça Saldanha Marinho, Santa Maria');

  const hospital = fromPhoton(feature({ name: 'Hospital de Caridade Doutor Astrogildo de Azevedo', osm_key: 'amenity', osm_value: 'hospital', street: 'Avenida Presidente Vargas', housenumber: '2291', district: 'Centro', city: 'Santa Maria', state: 'Rio Grande do Sul', country: 'Brasil', countrycode: 'BR' }), 'en')!;
  assert.equal(hospital.kind, 'hospital');
  // The country follows the reader's language, not the map's.
  assert.equal(hospital.context, 'Avenida Presidente Vargas, 2291, Centro, Santa Maria, Rio Grande do Sul, Brazil');

  const city = fromPhoton(feature({ name: 'São Paulo', osm_key: 'place', osm_value: 'municipality', type: 'city', state: 'São Paulo', country: 'Brasil', countrycode: 'BR' }), 'pt')!;
  const state = fromPhoton(feature({ name: 'São Paulo', osm_key: 'place', osm_value: 'state', type: 'state', country: 'Brasil', countrycode: 'BR' }), 'pt')!;
  // The two São Paulos no longer look the same.
  assert.equal(city.kind, 'city');
  assert.equal(state.kind, 'state');
  assert.notEqual(`${city.kind} ${city.context}`, `${state.kind} ${state.context}`);

  const street = fromPhoton(feature({ name: 'Times Square', osm_key: 'highway', osm_value: 'pedestrian', type: 'street', city: 'New York', state: 'New York', country: 'United States', countrycode: 'US' }), 'pt')!;
  assert.equal(street.context, 'New York, Estados Unidos');
  assert.equal(fromPhoton(feature({ osm_key: 'place' }), 'en'), null);
});

test('Nominatim results are formatted the same way', () => {
  const r = fromNominatim({
    lat: '-29.7232', lon: '-53.7204', name: 'Universidade Federal de Santa Maria', category: 'amenity', type: 'university',
    address: { suburb: 'Camobi', city: 'Santa Maria', state: 'Rio Grande do Sul', country: 'Brasil', country_code: 'br' },
  }, 'pt')!;
  assert.equal(r.kind, 'university');
  assert.equal(r.context, 'Camobi, Santa Maria, Rio Grande do Sul, Brasil');
  assert.equal(r.source, 'nominatim');
  assert.equal(fromNominatim({ lat: 'x', lon: '0' }, 'en'), null);
});

test('kinds', () => {
  assert.equal(kindOf('highway', 'tertiary', 'street'), 'street');
  assert.equal(kindOf('place', 'suburb', 'district'), 'district');
  assert.equal(kindOf('landuse', 'cemetery', 'other'), 'cemetery');
  assert.equal(kindOf('highway', 'bus_stop', 'house'), 'stop');
  assert.equal(kindOf('tourism', 'something_new', 'house'), 'place');
});

const r = (name: string, context: string, lat: number, lng: number, kind = 'street', source: PlaceResult['source'] = 'photon'): PlaceResult =>
  ({ name, context, kind, lat, lng, label: name, source });

test('dedupe: one line per real place', () => {
  const segs = [0, 1, 2, 3, 4].map((i) => r('Rua do Acampamento', 'Centro, Santa Maria, Rio Grande do Sul, Brasil', -29.69 + i * 0.001, -53.80));
  assert.equal(dedupe(segs).length, 1);
  // Same name in another city stays.
  const other = r('Rua do Acampamento', 'Centro, Cachoeira do Sul, Rio Grande do Sul, Brasil', -30.04, -52.89);
  assert.equal(dedupe([...segs, other]).length, 2);
  // Same name, different context, a few metres apart (two sources describing one node): one.
  assert.equal(dedupe([r('Times Square', 'Manhattan, New York', 40.758, -73.9855), r('Times Square', 'New York, Estados Unidos', 40.7581, -73.9856)]).length, 1);
});

test('rank: the state named in the query goes first, junk goes away', () => {
  const photon = [
    r('Santa Maria', 'Distrito Federal, Brasil', -16.0, -48.0, 'city'),
    r('Santa Maria', 'Rio Grande do Sul, Brasil', -29.68, -53.8, 'city'),
    r('Mara Rosa Beauty', 'Porto Alegre, Rio Grande do Sul, Brasil', -30.0, -51.2, 'shop'),
  ];
  const out = rank('Santa Maria', [photon], 'Rio Grande do Sul');
  assert.equal(out[0].context, 'Rio Grande do Sul, Brasil');
  assert.ok(!out.some((x) => x.name === 'Mara Rosa Beauty'));
});

test('rank: an acronym found by Nominatim beats a long partial name from Photon', () => {
  const photon = [r('UFSM Silveira Martins - Espaço Multidisciplinar de Pesquisa e Extensão - Bloco B', 'Silveira Martins, Rio Grande do Sul, Brasil', -29.64, -53.59, 'university')];
  const nominatim = [r('Universidade Federal de Santa Maria', 'Camobi, Santa Maria, Rio Grande do Sul, Brasil', -29.72, -53.72, 'university', 'nominatim')];
  assert.equal(rank('UFSM', [photon, nominatim])[0].name, 'Universidade Federal de Santa Maria');
});

function fakeProviders(opts: { photon?: PlaceResult[] | Error; nominatim?: PlaceResult[] | Error }) {
  const calls = { photon: [] as string[], nominatim: [] as string[] };
  const providers: Providers = {
    async photon(q) {
      calls.photon.push(q);
      if (opts.photon instanceof Error) throw opts.photon;
      return opts.photon ?? [];
    },
    async nominatim(q) {
      calls.nominatim.push(q);
      if (opts.nominatim instanceof Error) throw opts.nominatim;
      return opts.nominatim ?? [];
    },
  };
  return { providers, calls };
}

test('search: coordinates answer at once, without calling anyone', async () => {
  const { providers, calls } = fakeProviders({});
  const a = await searchPlaces('-29.68, -53.80', { lang: 'pt', bias: null, mode: 'full' }, providers);
  assert.equal(a.results.length, 1);
  assert.equal(a.results[0].kind, 'coords');
  assert.equal(a.results[0].lat, -29.68);
  assert.equal(calls.photon.length + calls.nominatim.length, 0);
});

test('search: typing only asks Photon; Enter asks both', async () => {
  const { providers, calls } = fakeProviders({ photon: [r('Copacabana', 'Rio de Janeiro, Brasil', -22.97, -43.18, 'district')] });
  await searchPlaces('Copacabanna', { lang: 'pt', bias: null, mode: 'suggest' }, providers);
  assert.deepEqual(calls, { photon: ['Copacabanna'], nominatim: [] });
  await searchPlaces('Santa Maria RS', { lang: 'pt', bias: null, mode: 'full' }, providers);
  assert.deepEqual(calls.photon.at(-1), 'Santa Maria, Rio Grande do Sul');
  assert.deepEqual(calls.nominatim, ['Santa Maria RS']);
});

test('search: Nominatim carries on when Photon is down, and says so', async () => {
  const ufsm = r('Universidade Federal de Santa Maria', 'Santa Maria, Brasil', -29.72, -53.72, 'university', 'nominatim');
  const { providers } = fakeProviders({ photon: new Error('photon 502'), nominatim: [ufsm] });
  const a = await searchPlaces('UFSM', { lang: 'pt', bias: null, mode: 'full' }, providers);
  assert.equal(a.degraded, true);
  assert.equal(a.results[0].name, 'Universidade Federal de Santa Maria');
  // While typing there is no Nominatim to fall back on (its policy forbids autocomplete).
  const s = await searchPlaces('UFSM', { lang: 'pt', bias: null, mode: 'suggest' }, providers);
  assert.deepEqual(s, { results: [], degraded: true });
});

test('search: Photon alone is enough when Nominatim fails', async () => {
  const { providers } = fakeProviders({ photon: [r('Times Square', 'New York, Estados Unidos', 40.758, -73.985, 'square')], nominatim: new Error('timeout') });
  const a = await searchPlaces('Times Sqare', { lang: 'pt', bias: null, mode: 'full' }, providers);
  assert.equal(a.results[0].name, 'Times Square');
  assert.equal(a.degraded, true);
});

test('search: too short, nothing asked', async () => {
  const { providers, calls } = fakeProviders({});
  assert.deepEqual(await searchPlaces(' a ', { lang: 'en', bias: null, mode: 'suggest' }, providers), { results: [], degraded: false });
  assert.equal(calls.photon.length, 0);
});

test('bias key: rounded by zoom so one view shares the cache, none for the whole world', () => {
  assert.equal(biasKey(null), 'world');
  assert.equal(biasKey({ lat: -29.68, lng: -53.8, zoom: 2 }), 'world');
  assert.equal(biasKey({ lat: -29.681, lng: -53.801, zoom: 12.2 }), biasKey({ lat: -29.684, lng: -53.799, zoom: 11.8 }));
  assert.notEqual(biasKey({ lat: -29.68, lng: -53.8, zoom: 12 }), biasKey({ lat: -23.55, lng: -46.63, zoom: 12 }));
});

test('a two-letter word being typed is not a state', () => {
  assert.equal(splitBrazilianState('Santa Ma').state, null);
  assert.equal(splitBrazilianState('santa ma').state, null);
  assert.equal(splitBrazilianState('Santa MA').state, 'Maranhão');
  assert.equal(splitBrazilianState('santa maria rs').state, 'Rio Grande do Sul');
  assert.equal(splitBrazilianState('bauru, sp').state, 'São Paulo');
});

test('rank: a place both geocoders agree on goes first', () => {
  const photon = [
    r('Mercado de San Telmo', 'Mugardos, Galicia, Espanha', 43.4595, -8.2562, 'market'),
    r('Mercado de San Telmo', 'Defensa, 963, Buenos Aires, Argentina', -34.619, -58.3725, 'market'),
  ];
  const nominatim = [
    { ...r('Mercado de San Telmo', 'San Telmo, Buenos Aires, Argentina', -34.6191, -58.3726, 'market', 'nominatim'), importance: 0.4 },
    { ...r('Mercado de San Telmo', 'Mugardos, Espanha', 43.4593, -8.2561, 'market', 'nominatim'), importance: 0.1 },
  ];
  assert.match(rank('Mercado de San Telmo', [photon, nominatim])[0].context, /Buenos Aires/);
});

test('rank: the word in the name beats the same word in the city around it', () => {
  const nominatim = [
    r('Santa Maria', 'Rio Grande do Sul, Brasil', -29.68, -53.8, 'city', 'nominatim'),
    r('Sede', 'Santa Maria, Rio Grande do Sul, Brasil', -29.69, -53.79, 'place', 'nominatim'),
  ];
  const photon = [r('Arquidiocese de Santa Maria', 'Rio Grande do Sul, Brasil', -29.68, -53.8, 'place')];
  const out = rank('Santa Maria', [photon, nominatim], 'Rio Grande do Sul');
  assert.equal(out[0].name, 'Santa Maria');
  assert.equal(out.at(-1)!.name, 'Sede');
});
