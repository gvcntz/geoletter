import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { openDb, type Offering } from '../src/db.ts';
import { LogDriver } from '../src/mail.ts';
import { Sealed, letterPage } from '../src/html.ts';
import { createApp } from '../src/server.ts';
import type { Lang } from '../src/i18n.ts';

const BODY = 'Vó, o pé de manga ainda dá fruta. SEGREDO-DO-CORPO';
const FROM = 'Gustavo-Assinatura';
const TO = 'Vó Chayo, que me ensinou a nadar';
const PLACE = 'Praça Saldanha Marinho, Santa Maria';
const LAT = -29.6868;
const LNG = -53.8149;

function sealedOffering(): Offering {
  return {
    id: 'sealedabc1', kind: 'letter', lat: LAT, lng: LNG, place: PLACE, to_name: TO, from_name: FROM, body: BODY,
    lang: 'pt', lang_hint: 'pt', status: 'approved', mod_reason: null, mod_categories: null, mod_model: null, mod_ms: null,
    attempts: 0, locked: 1, lock_radius_m: 200, author_key_hash: 'h', sender_hash: null, is_example: 0,
    created_at: Date.UTC(2026, 9, 28, 12), moderated_at: null,
  };
}

const between = (html: string, open: RegExp, close: string) => {
  const m = open.exec(html);
  assert.ok(m, `missing ${open}`);
  const end = html.indexOf(close, m.index);
  return html.slice(m.index, end + close.length);
};

/** What a person actually sees: tags gone, hidden elements gone, spaces collapsed. */
const seen = (html: string) =>
  html
    .replace(/<(\w+)\b[^>]*\shidden\b[^>]*>[\s\S]*?<\/\1>/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/g, (svg) => ` [${/class="([^"]+)"/.exec(svg)?.[1]}] `)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

for (const lang of ['pt', 'en'] as Lang[]) {
  test(`sealed preview (${lang}): the same card the letter page shows, and never the letter`, () => {
    const page = letterPage({ o: sealedOffering(), open: false, demo: false, author: false, queueAhead: 0, lang });
    const preview = Sealed.preview({ place: PLACE, to: TO, from: FROM, radius: 200 }, lang, sealedOffering().created_at);

    const card = (html: string) => seen(between(html, /<section class="sheet sealed"/, '</section>'));
    const foot = (html: string) => seen(between(html, /<footer class="letter-foot">/, '</footer>'));
    assert.equal(card(preview), card(page));
    assert.equal(foot(preview), foot(page));

    // The unlit candle, the line, the radius and place, who it was left for.
    const all = `${card(page)} ${foot(page)}`;
    assert.match(all, /\[candle unlit\]/);
    assert.ok(all.includes(lang === 'pt' ? 'Esta carta espera por quem passar por aqui.' : 'This letter waits for whoever passes by.'));
    assert.ok(all.includes(lang === 'pt' ? `a menos de 200 m de ${PLACE}` : `within 200 m of ${PLACE}`));
    assert.ok(all.includes(lang === 'pt' ? `Deixada para ${TO}` : `Left for ${TO}`));

    // Never the text, nowhere. The signature only in the author's own list, never on the card.
    for (const html of [page, preview]) assert.ok(!html.includes('SEGREDO-DO-CORPO'));
    assert.ok(!page.includes(FROM));
    assert.ok(!between(preview, /<div class="preview-frame" inert>/, '</footer>').includes(FROM));
    assert.ok(seen(between(preview, /<ul class="hidden-list">/, '</ul>')).includes(FROM));
  });
}

test('sealed preview: what it calls public is what the server hands out, and the rest is held back', async () => {
  const db = openDb(':memory:');
  const o = sealedOffering();
  db.prepare(
    `INSERT INTO offerings (id, kind, lat, lng, place, to_name, from_name, body, lang, status, locked, lock_radius_m, author_key_hash, created_at)
     VALUES (?, 'letter', ?, ?, ?, ?, ?, ?, 'pt', 'approved', 1, 200, 'h', ?)`,
  ).run(o.id, LAT, LNG, PLACE, TO, FROM, BODY, o.created_at);
  const { server } = createApp(db, new LogDriver());
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const place = await (await fetch(`${base}/api/place?lat=${LAT}&lng=${LNG}`)).json();
    const one = await (await fetch(`${base}/api/offerings/${o.id}`)).json();
    const page = await (await fetch(`${base}/l/${o.id}`, { headers: { cookie: 'gl_lang=pt' } })).text();
    const summary = place.offerings[0];
    const expected: Record<string, unknown> = { place: PLACE, to: TO, created_at: o.created_at, radius: 200 };
    for (const s of [summary, one]) {
      assert.equal(s.open, false);
      for (const field of Sealed.PUBLIC_FIELDS) assert.equal(s[field], expected[field], field);
      for (const field of Sealed.HIDDEN_FIELDS) assert.ok(!s[field], field);
      assert.ok(!JSON.stringify(s).includes('SEGREDO-DO-CORPO'));
      assert.ok(!JSON.stringify(s).includes(FROM));
    }
    assert.ok(!page.includes('SEGREDO-DO-CORPO') && !page.includes(FROM));
    assert.ok(page.includes('Esta carta espera por quem passar por aqui.'));
  } finally {
    server.close();
  }
});
