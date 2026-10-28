// The sealed card: everything a stranger sees of a letter sealed to its place before it opens.
// One renderer for both sides. The server draws the letter page with it, and the form uses it
// for "How others will see it", so the preview can never promise something the page does not do.
// A plain script like i18n.js: the browser loads it, the server imports it. Every value that a
// person typed goes through esc() before it becomes HTML.
(function (root) {
  'use strict';

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // The same clean-up the server does to a name or a place before saving it.
  const clean = (value) => String(value ?? '').normalize('NFC')
    .replace(/[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  const t = (lang, key, params) => root.GeoI18n.t(lang, key, params);

  // Hand-drawn marigold: a ring of petals in thin ochre strokes. Used once per page, small.
  const MARIGOLD_SVG = `<svg class="marigold" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
<g fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">
<path d="M32 22c-3-6-1-11 0-12 1 1 3 6 0 12z"/><path d="M32 42c-3 6-1 11 0 12 1-1 3-6 0-12z"/>
<path d="M22 32c-6-3-11-1-12 0 1 1 6 3 12 0z"/><path d="M42 32c6-3 11-1 12 0-1 1-6 3-12 0z"/>
<path d="M25 25c-5-4-6-9-6-10 1 0 6 1 9 7z"/><path d="M39 39c5 4 6 9 6 10-1 0-6-1-9-7z"/>
<path d="M39 25c4-5 9-6 10-6 0 1-1 6-7 9z"/><path d="M25 39c-4 5-9 6-10 6 0-1 1-6 7-9z"/>
<circle cx="32" cy="32" r="6.5"/><circle cx="32" cy="32" r="2.6"/></g></svg>`;

  // The candle before anyone has come close enough: no flame, a thread of smoke.
  const SEALED_SVG = `<svg class="candle unlit" viewBox="0 0 40 72" aria-hidden="true" focusable="false">
<path d="M20 26v6" stroke="currentColor" stroke-width="1.2"/>
<path d="M20 24c-1-3 1-5 0-8M22 20c1-2 0-4 1-6" fill="none" stroke="currentColor" stroke-width=".8" opacity=".5"/>
<rect x="11" y="32" width="18" height="34" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>
<path d="M8 66h24" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;

  // What a stranger can know about a sealed letter, and what only the one who opens it learns.
  // The server's public summary follows the same split (test/sealed-preview.test.ts checks it).
  const PUBLIC_FIELDS = ['place', 'to', 'created_at', 'radius'];
  const HIDDEN_FIELDS = ['body', 'from'];

  const placeOf = (card, lang) => clean(card.place) || t(lang, 'card.somePlace');

  /** The sheet of a sealed letter. `actions` is the HTML under it (the open button, the distance). */
  function sheet(card, lang, actions) {
    return `<section class="sheet sealed" aria-live="polite">
${SEALED_SVG}
<p class="sealed-line">${esc(t(lang, 'card.line'))}</p>
<p class="sealed-sub">${esc(t(lang, 'card.sub', { r: card.radius, place: placeOf(card, lang) }))}</p>
${actions || ''}
</section>`;
  }

  /** The button a passer-by sees under the sheet. In the preview it is drawn but does nothing. */
  function openButton(lang, more) {
    return `<p class="actions"><button type="button" id="open-here">${esc(t(lang, 'letter.openHere'))}</button>
${more || ''}</p>`;
  }

  /** The line under every letter page: who it was left for, where, and whether it is sealed. */
  function foot(card, lang, extra) {
    const place = placeOf(card, lang);
    const to = clean(card.to);
    const line = card.kind === 'letter' && to ? t(lang, 'card.leftFor', { to, place }) : t(lang, 'card.leftAt', { place });
    return `<footer class="letter-foot">
${MARIGOLD_SVG}
<p>${esc(line)}${card.locked ? esc(t(lang, 'card.sealedToPlace')) : ''}.</p>
${extra || ''}
</footer>`;
  }

  const dateIn = (ms, lang) =>
    new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : 'en', { day: 'numeric', month: 'long', year: 'numeric' }).format(ms);

  /**
   * "How others will see it", for a letter still being written.
   * draft: { place, to, from, radius } as typed in the form. The letter text is never passed in.
   */
  function preview(draft, lang, now) {
    const card = { kind: 'letter', locked: true, place: draft.place, to: draft.to, radius: draft.radius };
    const r = card.radius;
    const to = clean(draft.to);
    const from = clean(draft.from);
    const li = (text) => `<li>${esc(text)}</li>`;
    const visible = [
      li(t(lang, 'preview.place', { place: placeOf(card, lang) })),
      li(to ? t(lang, 'preview.to', { to }) : t(lang, 'preview.toNone')),
      li(t(lang, 'preview.date', { date: dateIn(now ?? Date.now(), lang) })),
    ];
    const hidden = [li(t(lang, 'preview.body')), from ? li(t(lang, 'preview.from', { from })) : ''];
    return `<h3 class="preview-title">${esc(t(lang, 'preview.title'))}</h3>
<p class="small">${esc(t(lang, 'preview.lede', { r }))}</p>
<div class="preview-frame" inert>
${sheet(card, lang, openButton(lang))}
${foot(card, lang, '')}
</div>
<div class="preview-facts">
<p class="facts-head">${esc(t(lang, 'preview.visible'))}</p>
<ul>${visible.join('')}</ul>
<p class="facts-head">${esc(t(lang, 'preview.hidden', { r }))}</p>
<ul class="hidden-list">${hidden.join('')}</ul>
${from ? '' : `<p class="small">${esc(t(lang, 'preview.unsigned'))}</p>`}
<p class="small">${esc(t(lang, 'preview.email'))}</p>
</div>`;
  }

  root.GeoSealed = { esc, clean, sheet, openButton, foot, preview, MARIGOLD_SVG, SEALED_SVG, PUBLIC_FIELDS, HIDDEN_FIELDS };
})(globalThis);
