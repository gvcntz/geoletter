import type { Offering } from './db.ts';

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

// Hand-drawn marigold: a ring of petals in thin ochre strokes. Used once per page, small.
export const MARIGOLD_SVG = `<svg class="marigold" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
<g fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round">
<path d="M32 22c-3-6-1-11 0-12 1 1 3 6 0 12z"/><path d="M32 42c-3 6-1 11 0 12 1-1 3-6 0-12z"/>
<path d="M22 32c-6-3-11-1-12 0 1 1 6 3 12 0z"/><path d="M42 32c6-3 11-1 12 0-1 1-6 3-12 0z"/>
<path d="M25 25c-5-4-6-9-6-10 1 0 6 1 9 7z"/><path d="M39 39c5 4 6 9 6 10-1 0-6-1-9-7z"/>
<path d="M39 25c4-5 9-6 10-6 0 1-1 6-7 9z"/><path d="M25 39c-4 5-9 6-10 6 0-1 1-6 7-9z"/>
<circle cx="32" cy="32" r="6.5"/><circle cx="32" cy="32" r="2.6"/></g></svg>`;

export const CANDLE_SVG = `<svg class="candle" viewBox="0 0 40 72" aria-hidden="true" focusable="false">
<path class="flame" d="M20 6c4 7 6 10 6 14a6 6 0 0 1-12 0c0-4 2-7 6-14z"/>
<path d="M20 26v6" stroke="currentColor" stroke-width="1.2"/>
<rect x="11" y="32" width="18" height="34" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>
<path d="M8 66h24" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;

export const SEALED_SVG = `<svg class="candle unlit" viewBox="0 0 40 72" aria-hidden="true" focusable="false">
<path d="M20 26v6" stroke="currentColor" stroke-width="1.2"/>
<path d="M20 24c-1-3 1-5 0-8M22 20c1-2 0-4 1-6" fill="none" stroke="currentColor" stroke-width=".8" opacity=".5"/>
<rect x="11" y="32" width="18" height="34" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>
<path d="M8 66h24" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`;

export interface PageOpts {
  title: string;
  description?: string;
  bodyClass?: string;
  main: string;
  scripts?: string[];
  noindex?: boolean;
}

export function page(o: PageOpts): string {
  return `<!doctype html>
<html lang="en">
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
${(o.scripts ?? []).map((s) => `<script src="${esc(s)}" defer></script>`).join('\n')}
</body>
</html>`;
}

const KIND_LINE: Record<string, (to: string) => string> = {
  flower: (to) => (to ? `A marigold for ${to}` : 'A marigold'),
  candle: (to) => (to ? `A candle for ${to}` : 'A candle'),
  item: (to) => (to ? `Something left for ${to}` : 'Something left here'),
  letter: (to) => (to ? `A letter for ${to}` : 'A letter'),
};

export function offeringTitle(o: Pick<Offering, 'kind' | 'to_name'>): string {
  return (KIND_LINE[o.kind] ?? KIND_LINE.letter)(o.to_name);
}

export interface LetterView {
  o: Offering;
  open: boolean;
  demo: boolean;
  author: boolean;
  queueAhead: number;
}

function authorNote(v: LetterView): string {
  const { o } = v;
  if (!v.author) return '';
  if (o.status === 'queued') {
    const ahead =
      v.queueAhead === 0
        ? 'Yours is the next one she reads.'
        : `There ${v.queueAhead === 1 ? 'is 1 offering' : `are ${v.queueAhead} offerings`} ahead of yours.`;
    return `<div class="note" data-status="queued" role="status"><p>Your ${esc(o.kind)} is with the guardian.
Gemma reads everything before it goes on the map. ${ahead} This page updates by itself.</p></div>`;
  }
  if (o.status === 'rejected' || o.status === 'failed') {
    return `<div class="note refused" data-status="${esc(o.status)}" role="status"><p>The guardian kept this back. Only you can see it.</p>
<p class="reason">${esc(o.mod_reason || 'No reason was given.')}</p>
<p>You can copy the text below, change it, and leave it again from the map.</p></div>`;
  }
  return `<div class="note" data-status="approved"><p>The guardian let it through. It is on the map now. Keep this address if you want to come back to it.</p></div>`;
}

export function letterPage(v: LetterView): string {
  const { o } = v;
  const lang = o.lang || o.lang_hint || 'en';
  const date = formatDate(o.created_at, lang);
  const title = offeringTitle(o);
  const place = o.place || 'a place on the map';
  const isLetter = o.kind === 'letter';
  const showText = v.open || v.author;

  let sheet: string;
  if (!showText) {
    sheet = `<section class="sheet sealed" aria-live="polite">
${SEALED_SVG}
<p class="sealed-line">This letter waits for whoever passes by.</p>
<p class="sealed-sub">It only opens for someone standing within ${esc(o.lock_radius_m)} m of ${esc(place)}.</p>
<p class="distance" id="distance" hidden></p>
<p class="actions"><button type="button" id="open-here">I am here. Open it</button>
${v.demo ? '<button type="button" class="quiet" id="open-demo">Demo: open as if I were there</button>' : ''}</p>
<p class="geo-error" id="geo-error" hidden></p>
<div id="opened" hidden></div>
</section>`;
  } else {
    const kindMark = o.kind === 'candle' ? CANDLE_SVG : o.kind === 'flower' ? MARIGOLD_SVG : '';
    sheet = `<article class="sheet${isLetter ? '' : ' small-offering'}" lang="${esc(lang)}">
<p class="dateline">${esc(place)}<br>${esc(date)}</p>
${isLetter ? '' : `<p class="addressee">${esc(title)}</p>`}
${kindMark}
${o.body ? `<div class="letter-body" id="letter-body">${esc(o.body)}</div>` : ''}
${o.from_name ? `<p class="signature">${esc(o.from_name)}</p>` : ''}
</article>`;
  }

  const main = `<header class="topline"><a href="/" class="wordmark">GeoLetter</a><a href="/#${o.lat.toFixed(5)},${o.lng.toFixed(5)}" class="back">Back to the map</a></header>
<main class="letter-page" id="letter" data-id="${esc(o.id)}" data-lang="${esc(lang)}" data-kind="${esc(o.kind)}"
 data-status="${esc(o.status)}" data-open="${showText ? '1' : '0'}" data-locked="${o.locked ? '1' : '0'}"
 data-lat="${o.lat}" data-lng="${o.lng}" data-radius="${esc(o.lock_radius_m)}" data-demo="${v.demo ? '1' : '0'}">
${authorNote(v)}
${sheet}
<footer class="letter-foot">
${MARIGOLD_SVG}
<p>${isLetter && o.to_name ? `Left for ${esc(o.to_name)} at ${esc(place)}` : `Left at ${esc(place)}`}${o.locked ? ', sealed to the place' : ''}.</p>
${isLetter && o.status === 'approved' ? '<p><button type="button" class="link" id="translate" hidden></button></p><p class="translate-state" id="translate-state" hidden></p>' : ''}
${o.is_example ? '<p class="example">This is an example offering. The people in it are invented.</p>' : ''}
</footer>
</main>`;

  const description = v.open && !o.locked ? `${title}, left at ${place}.` : `${title}, waiting at ${place}.`;
  return page({
    title: `${title} · GeoLetter`,
    description,
    bodyClass: 'paper',
    main,
    scripts: ['/letter.js'],
    noindex: o.status !== 'approved',
  });
}

export function messagePage(title: string, html: string, status = ''): string {
  return page({
    title: `${title} · GeoLetter`,
    bodyClass: 'paper',
    noindex: true,
    main: `<header class="topline"><a href="/" class="wordmark">GeoLetter</a></header>
<main class="letter-page"><section class="sheet message${status ? ' ' + esc(status) : ''}">
<h1>${esc(title)}</h1>${html}</section></main>`,
  });
}
