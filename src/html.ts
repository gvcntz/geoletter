import type { Offering } from './db.ts';
import { t, type Lang } from './i18n.ts';
// The sealed card is drawn by public/sealed-card.js, the same code the form uses for its
// preview. It takes its words from public/i18n.js.
import '../public/i18n.js';
import '../public/sealed-card.js';

interface Card { kind: string; locked: boolean | number; place: string; to?: string; radius?: number }
export interface SealedCard {
  esc(value: unknown): string;
  sheet(card: Card, lang: Lang, actions?: string): string;
  openButton(lang: Lang, more?: string): string;
  foot(card: Card, lang: Lang, extra?: string): string;
  preview(draft: { place: string; to: string; from: string; radius: number }, lang: Lang, now?: number): string;
  MARIGOLD_SVG: string;
  SEALED_SVG: string;
  PUBLIC_FIELDS: string[];
  HIDDEN_FIELDS: string[];
}
export const Sealed = (globalThis as unknown as { GeoSealed: SealedCard }).GeoSealed;
export const MARIGOLD_SVG = Sealed.MARIGOLD_SVG;
export const SEALED_SVG = Sealed.SEALED_SVG;

export function esc(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export function formatDate(ms: number, lang: string | null): string {
  try {
    return new Intl.DateTimeFormat(lang || 'en', { day: 'numeric', month: 'long', year: 'numeric' }).format(ms);
  } catch {
    return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric' }).format(ms);
  }
}

export const CANDLE_SVG = `<svg class="candle" viewBox="0 0 40 72" aria-hidden="true" focusable="false">
<path class="flame" d="M20 6c4 7 6 10 6 14a6 6 0 0 1-12 0c0-4 2-7 6-14z"/>
<path d="M20 26v6" stroke="currentColor" stroke-width="1.2"/>
<rect x="11" y="32" width="18" height="34" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>
<path d="M8 66h24" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;

export interface PageOpts {
  title: string;
  description?: string;
  bodyClass?: string;
  main: string;
  scripts?: string[];
  noindex?: boolean;
  lang: Lang;
}

/** "PT · EN". Works with i18n.js, which keeps the choice in localStorage and a cookie. */
export function langSwitch(lang: Lang): string {
  const b = (l: Lang) =>
    `<button type="button" data-set-lang="${l}" lang="${l}"${l === lang ? ' aria-pressed="true"' : ' aria-pressed="false"'}>${l.toUpperCase()}</button>`;
  return `<p class="lang-switch" role="group" aria-label="Idioma / Language">${b('pt')}<span aria-hidden="true"> · </span>${b('en')}</p>`;
}

export function page(o: PageOpts): string {
  return `<!doctype html>
<html lang="${o.lang === 'pt' ? 'pt-BR' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
${o.description ? `<meta name="description" content="${esc(o.description)}">` : ''}
${o.noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:title" content="${esc(o.title)}">
${o.description ? `<meta property="og:description" content="${esc(o.description)}">` : ''}
<meta name="theme-color" content="#f5efe3">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/fonts/fonts.css">
<link rel="stylesheet" href="/style.css">
</head>
<body class="${esc(o.bodyClass ?? '')}">
${o.main}
<script src="/i18n.js"></script>
${(o.scripts ?? []).map((s) => `<script src="${esc(s)}" defer></script>`).join('\n')}
</body>
</html>`;
}

const KINDS = ['flower', 'candle', 'item', 'letter'] as const;

export function offeringTitle(o: Pick<Offering, 'kind' | 'to_name'>, lang: Lang = 'en'): string {
  const kind = (KINDS as readonly string[]).includes(o.kind) ? o.kind : 'letter';
  return t(lang, `title.${kind}` as 'title.letter', { to: o.to_name });
}

/** A refusal reason comes from Gemma in the author's own language; a failure is ours to word. */
export function authorReason(o: Pick<Offering, 'status' | 'mod_reason'>, lang: Lang): string {
  if (o.status === 'failed') return t(lang, 'guardianFailed');
  return o.mod_reason || t(lang, 'noReason');
}

export interface LetterView {
  o: Offering;
  open: boolean;
  demo: boolean;
  author: boolean;
  queueAhead: number;
  lang: Lang;
}

function authorNote(v: LetterView): string {
  const { o, lang } = v;
  if (!v.author) return '';
  if (o.status === 'queued') {
    const ahead =
      v.queueAhead === 0 ? t(lang, 'aheadNone') : v.queueAhead === 1 ? t(lang, 'aheadOne') : t(lang, 'aheadMany', { n: v.queueAhead });
    const kind = t(lang, `kind.${o.kind}` as 'kind.letter');
    return `<div class="note" data-status="queued" role="status"><p>${esc(t(lang, 'queued', { kind, ahead }))}</p></div>`;
  }
  if (o.status === 'rejected' || o.status === 'failed') {
    return `<div class="note refused" data-status="${esc(o.status)}" role="status"><p>${esc(t(lang, 'refused'))}</p>
<p class="reason">${esc(authorReason(o, lang))}</p>
<p>${esc(t(lang, 'refusedHow'))}</p></div>`;
  }
  return `<div class="note" data-status="approved"><p>${esc(t(lang, 'approved'))}</p></div>`;
}

export function letterPage(v: LetterView): string {
  const { o } = v;
  const ui = v.lang;
  // The letter keeps its own language; the words around it follow the reader.
  const lang = o.lang || o.lang_hint || 'en';
  const date = formatDate(o.created_at, lang);
  const title = offeringTitle(o, ui);
  const place = o.place || t(ui, 'somePlace');
  const isLetter = o.kind === 'letter';
  const showText = v.open || v.author;

  let sheet: string;
  if (!showText) {
    const card = { kind: o.kind, locked: o.locked, place: o.place, radius: o.lock_radius_m };
    const demo = v.demo ? `<button type="button" class="quiet" id="open-demo">${esc(t(ui, 'openDemo'))}</button>` : '';
    sheet = Sealed.sheet(card, ui, `<p class="distance" id="distance" hidden></p>
${Sealed.openButton(ui, demo)}
<p class="geo-error" id="geo-error" hidden></p>
<div id="opened" hidden></div>`);
  } else {
    const kindMark = o.kind === 'candle' ? CANDLE_SVG : o.kind === 'flower' ? MARIGOLD_SVG : '';
    sheet = `<article class="sheet${isLetter ? '' : ' small-offering'}" lang="${esc(lang)}">
<p class="dateline">${esc(place)}<br>${esc(date)}</p>
${isLetter ? '' : `<p class="addressee" lang="${ui}">${esc(title)}</p>`}
${kindMark}
${o.body ? `<div class="letter-body" id="letter-body">${esc(o.body)}</div>` : ''}
${o.from_name ? `<p class="signature">${esc(o.from_name)}</p>` : ''}
</article>`;
  }

  const main = `<header class="topline"><a href="/" class="wordmark">GeoLetter</a><span class="topline-right"><a href="/#${o.lat.toFixed(5)},${o.lng.toFixed(5)}" class="back">${esc(t(ui, 'backToMap'))}</a>${langSwitch(ui)}</span></header>
<main class="letter-page" id="letter" data-id="${esc(o.id)}" data-lang="${esc(lang)}" data-kind="${esc(o.kind)}"
 data-status="${esc(o.status)}" data-open="${showText ? '1' : '0'}" data-locked="${o.locked ? '1' : '0'}"
 data-lat="${o.lat}" data-lng="${o.lng}" data-radius="${esc(o.lock_radius_m)}" data-demo="${v.demo ? '1' : '0'}">
${authorNote(v)}
${sheet}
${Sealed.foot({ kind: o.kind, locked: o.locked, place: o.place, to: o.to_name }, ui, `${isLetter && o.status === 'approved' ? '<p><button type="button" class="link" id="translate" hidden></button></p><p class="translate-state" id="translate-state" hidden></p>' : ''}
${o.is_example ? `<p class="example">${esc(t(ui, 'exampleNote'))}</p>` : ''}`)}
</main>`;

  const description = `${title} · ${place}`;
  return page({
    lang: ui,
    title: `${title} · GeoLetter`,
    description,
    bodyClass: 'paper',
    main,
    scripts: ['/letter.js'],
    noindex: o.status !== 'approved',
  });
}

export function messagePage(lang: Lang, title: string, html: string, status = ''): string {
  return page({
    lang,
    title: `${title} · GeoLetter`,
    bodyClass: 'paper',
    noindex: true,
    main: `<header class="topline"><a href="/" class="wordmark">GeoLetter</a>${langSwitch(lang)}</header>
<main class="letter-page"><section class="sheet message${status ? ' ' + esc(status) : ''}">
<h1>${esc(title)}</h1>${html}</section></main>`,
  });
}
