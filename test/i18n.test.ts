import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { langFromTag, pickLang, t } from '../src/i18n.ts';
import { buildNotice } from '../src/mail.ts';
import { offeringTitle } from '../src/html.ts';
import { localizeIndex } from '../src/server.ts';
import '../public/i18n.js';

type ClientI18n = {
  dict: Record<'pt' | 'en', Record<string, unknown>>;
  pickLang(stored: string | null, browserLang: string | undefined): 'pt' | 'en';
  t(lang: string, key: string, params?: object): string;
};
const client = (globalThis as unknown as { GeoI18n: ClientI18n }).GeoI18n;

test('language: pt* is Portuguese, everything else English', () => {
  for (const tag of ['pt', 'pt-BR', 'pt-PT', 'PT-br', 'pt_BR']) assert.equal(langFromTag(tag), 'pt', tag);
  for (const tag of ['en', 'en-US', 'es-MX', 'fr', 'ja', '', null, undefined, 'ptx']) assert.equal(langFromTag(tag), 'en', String(tag));
});

test('language on the server: the PT · EN choice wins over the browser', () => {
  assert.equal(pickLang(undefined, 'pt-BR,pt;q=0.9,en;q=0.8'), 'pt');
  assert.equal(pickLang(undefined, 'en-US,en;q=0.9,pt;q=0.8'), 'en');
  assert.equal(pickLang(undefined, 'es-AR,es;q=0.9'), 'en');
  assert.equal(pickLang(undefined, ''), 'en');
  assert.equal(pickLang('en', 'pt-BR'), 'en');
  assert.equal(pickLang('pt', 'en-US'), 'pt');
  assert.equal(pickLang('de', 'pt-BR'), 'pt'); // an unknown cookie is ignored
});

test('language in the browser: localStorage choice first, then navigator.language', () => {
  assert.equal(client.pickLang(null, 'pt-BR'), 'pt');
  assert.equal(client.pickLang(null, 'pt-PT'), 'pt');
  assert.equal(client.pickLang(null, 'es-ES'), 'en');
  assert.equal(client.pickLang(null, undefined), 'en');
  assert.equal(client.pickLang('en', 'pt-BR'), 'en');
  assert.equal(client.pickLang('pt', 'en-GB'), 'pt');
  assert.equal(client.pickLang('xx', 'pt-BR'), 'pt');
});

test('both dictionaries have the same keys, and the Portuguese has no dashes mid-sentence', () => {
  assert.deepEqual(Object.keys(client.dict.pt).sort(), Object.keys(client.dict.en).sort());
  for (const key of Object.keys(client.dict.pt)) {
    const text = client.t('pt', key, { n: 2, name: 'Ana', to: 'Ana', r: 200, d: '3 km', lang: 'inglês' });
    assert.ok(!/\s[—–]\s|—/.test(text), `${key}: ${text}`);
  }
  assert.equal(client.t('pt', 'count.flower', { n: 1 }), '1 flor');
  assert.equal(client.t('pt', 'count.flower', { n: 3 }), '3 flores');
  assert.equal(client.t('en', 'wait.ahead', { n: 2 }), 'Waiting for the guardian. 2 offerings are ahead of yours.');
  assert.equal(client.t('pt', 'missing.key'), 'missing.key');
});

test('server words in Portuguese', () => {
  assert.equal(client.t('pt', 'card.line'), 'Esta carta espera por quem passar por aqui.');
  assert.equal(offeringTitle({ kind: 'flower', to_name: 'Vó Chayo' }, 'pt'), 'Uma flor para Vó Chayo');
  assert.equal(offeringTitle({ kind: 'letter', to_name: '' }, 'en'), 'A letter');
  assert.equal(t('pt', 'tooMany', { what: 'x', min: 3 }), 'Muitos pedidos seguidos daqui. Tente de novo em 3 min.');
});

test('the email notice follows the letter language and never carries the letter', () => {
  const pt = buildNotice({ place: 'Praça Saldanha Marinho', letterUrl: 'https://x/l/abc', unsubscribeUrl: 'https://x/u', lang: 'pt' });
  assert.equal(pt.subject, 'Alguém deixou uma carta para você em Praça Saldanha Marinho');
  assert.match(pt.text, /Você pode lê-la aqui: https:\/\/x\/l\/abc/);
  assert.match(pt.html, /lang="pt-BR"/);
  assert.match(pt.html, /Não quero receber estes avisos/);
  const en = buildNotice({ place: '', letterUrl: 'https://x/l/abc', unsubscribeUrl: 'https://x/u' });
  assert.equal(en.subject, 'Someone left a letter for you in a place on the map');
});

test('the map page is sent already translated', () => {
  const src = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const pt = localizeIndex(src, 'pt');
  assert.match(pt, /<html lang="pt-BR" data-lang="pt">/);
  assert.match(pt, /<button type="submit" data-i18n="search.button">Procurar<\/button>/);
  assert.match(pt, /placeholder="Uma rua, uma cidade, uma praça ou coordenadas"/);
  assert.match(pt, /data-i18n="compose.flower">Uma flor</);
  assert.match(pt, /data-set-lang="pt" lang="pt" aria-pressed="true"/);
  assert.match(pt, /data-set-lang="en" lang="en" aria-pressed="false"/);
  assert.ok(!pt.includes('>Leave the marigold<'));
  const en = localizeIndex(src, 'en');
  assert.match(en, /<html lang="en" data-lang="en">/);
  assert.match(en, />Find<\/button>/);
});
