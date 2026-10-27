import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { assertConfig, config } from './config.ts';
import { openDb, type DB, type Kind, type Offering } from './db.ts';
import { boxAround, checkLock, haversineMeters, isValidLatLng } from './geo.ts';
import { Guardian, draftLetter, translateOffering } from './guardian.ts';
import {
  LogDriver, SmtpDriver, blockEmail, checkEmailAllowed, emailHash, isPlausibleEmail, reserveEmail,
  verifyUnsubscribe, type MailDriver,
} from './mail.ts';
import { RateLimiter } from './ratelimit.ts';
import { reversePlace, searchPlaces } from './nominatim.ts';
import { esc, letterPage, messagePage, offeringTitle } from './html.ts';
import { llmQueue, ollamaHealth } from './ollama.ts';

const PUBLIC_DIR = resolve(import.meta.dirname, '..', 'public');
const MAX_BODY_BYTES = 16 * 1024;
export const LIMITS = { body: 2000, note: 280, name: 60, place: 120, notes: 1500 };
const KINDS: Kind[] = ['flower', 'candle', 'letter', 'item'];
const PLACE_RADIUS_M = 60;

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob: https://tiles.openfreemap.org",
  "connect-src 'self' https://tiles.openfreemap.org",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "child-src blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------- helpers ----------

function securityHeaders(res: ServerResponse): void {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

function send(res: ServerResponse, status: number, body: string | Buffer, type: string, extra: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': type, ...extra });
  res.end(body);
}

function json(res: ServerResponse, status: number, data: unknown) {
  send(res, status, JSON.stringify(data), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
}

function html(res: ServerResponse, status: number, body: string) {
  send(res, status, body, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' });
}

function clientIp(req: IncomingMessage): string {
  const remote = req.socket.remoteAddress ?? '';
  const fromProxy = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  const real = req.headers['x-real-ip'];
  return fromProxy && typeof real === 'string' && real ? real : remote;
}

function hmac(label: string, value: string): string {
  return createHmac('sha256', config.secret).update(`${label}:${value}`).digest('hex');
}

const senderHash = (req: IncomingMessage) => hmac('ip', clientIp(req)).slice(0, 32);

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const demoCookieValue = () => hmac('demo', 'on').slice(0, 40);

function isDemo(req: IncomingMessage): boolean {
  if (config.demoMode) return true;
  const c = cookies(req).gl_demo;
  return !!c && safeEqual(c, demoCookieValue());
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const type = req.headers['content-type'] ?? '';
  if (!type.startsWith('application/json')) throw new HttpError(415, 'Send JSON.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'That is too long.');
    chunks.push(chunk as Buffer);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'That did not arrive in one piece.');
  }
}

/** Trim, remove control characters, cap length. Single-line fields also lose newlines. */
export function cleanText(value: unknown, max: number, multiline = false): string {
  if (typeof value !== 'string') return '';
  let s = value.normalize('NFC').replace(/\r\n?/g, '\n');
  s = multiline
    ? s.replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '').replace(/\n{4,}/g, '\n\n\n')
    : s.replace(/[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ');
  s = s.trim();
  return [...s].length > max ? [...s].slice(0, max).join('') : s;
}

function tooLong(value: unknown, max: number): boolean {
  return typeof value === 'string' && [...value.trim()].length > max;
}

function langOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^([a-z]{2})(?:[-_]|$)/i.exec(value.trim());
  return m ? m[1].toLowerCase() : null;
}

function newId(): string {
  // 12 chars of base32 (no look-alike letters): about 60 bits, unguessable for a public link.
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function rateLimit(limiter: RateLimiter, req: IncomingMessage, what: string): void {
  const wait = limiter.take(clientIp(req));
  if (wait > 0) {
    throw new HttpError(429, `Too many ${what} from here. Try again in ${Math.ceil(wait / 60)} min.`);
  }
}

function num(v: string | null): number | undefined {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// ---------- app ----------

export function createApp(db: DB, mailer: MailDriver) {
  const guardian = new Guardian(db, mailer);
  const limits = {
    create: new RateLimiter(8, 10 * 60_000),
    draft: new RateLimiter(6, 10 * 60_000),
    translate: new RateLimiter(20, 10 * 60_000),
    geo: new RateLimiter(30, 60_000),
    unsub: new RateLimiter(20, 10 * 60_000),
  };

  const getOffering = (id: string) =>
    db.prepare('SELECT * FROM offerings WHERE id = ?').get(id) as Offering | undefined;

  const queueAhead = (o: Offering) =>
    (db
      .prepare(`SELECT COUNT(*) AS n FROM offerings WHERE status = 'queued' AND created_at < ?`)
      .get(o.created_at) as { n: number }).n;

  const isAuthor = (o: Offering, key: string | null) => !!key && safeEqual(sha256(key), o.author_key_hash);

  function publicSummary(o: Offering, reader: { lat?: number; lng?: number } | null, demo: boolean) {
    const lock = checkLock(o, reader, demo);
    const text = lock.open ? o.body : '';
    return {
      id: o.id,
      kind: o.kind,
      lat: o.lat,
      lng: o.lng,
      place: o.place,
      to: o.to_name,
      from: lock.open ? o.from_name : '',
      lang: o.lang,
      created_at: o.created_at,
      locked: !!o.locked,
      radius: o.lock_radius_m,
      open: lock.open,
      distance: lock.distance === null ? null : Math.round(lock.distance),
      excerpt: text.length > 180 ? text.slice(0, 180).replace(/\s+\S*$/, '') + '…' : text,
      example: !!o.is_example,
      title: offeringTitle(o),
    };
  }

  async function createOffering(req: IncomingMessage, res: ServerResponse) {
    rateLimit(limits.create, req, 'offerings');
    const b = await readJson(req);
    const kind = b.kind as Kind;
    if (!KINDS.includes(kind)) throw new HttpError(400, 'Choose a flower, a candle, a letter or something else.');
    const lat = typeof b.lat === 'number' ? b.lat : NaN;
    const lng = typeof b.lng === 'number' ? b.lng : NaN;
    if (!isValidLatLng(lat, lng)) throw new HttpError(400, 'Pick a place on the map first.');

    const maxBody = kind === 'letter' ? LIMITS.body : LIMITS.note;
    if (tooLong(b.body, maxBody)) throw new HttpError(400, `Keep it under ${maxBody} characters.`);
    if (tooLong(b.to, LIMITS.name) || tooLong(b.from, LIMITS.name)) throw new HttpError(400, `Names can have up to ${LIMITS.name} characters.`);
    const place = cleanText(b.place, LIMITS.place);
    const to = cleanText(b.to, LIMITS.name);
    const from = cleanText(b.from, LIMITS.name);
    const body = cleanText(b.body, maxBody, kind === 'letter');
    if (kind === 'letter' && body.length < 2) throw new HttpError(400, 'The letter is empty.');
    if (kind === 'item' && body.length < 2) throw new HttpError(400, 'Say what you are leaving.');

    const locked = kind === 'letter' && b.locked === true;
    let radius = typeof b.radius === 'number' ? Math.round(b.radius) : config.lockRadiusDefault;
    radius = Math.min(5000, Math.max(50, radius));

    const email = kind === 'letter' && typeof b.email === 'string' ? b.email.trim() : '';
    if (email && !isPlausibleEmail(email)) throw new HttpError(400, 'That email address does not look right.');
    const sender = senderHash(req);
    let recipientHash = '';
    if (email) {
      recipientHash = emailHash(config.secret, email);
      const check = checkEmailAllowed(db, sender, recipientHash, config.emailDailyLimit);
      // A blocked address is not reported back: that would tell strangers who opted out.
      if (!check.ok && check.reason === 'sender_limit') {
        throw new HttpError(429, `You have already sent ${config.emailDailyLimit} notices today. Leave the letter without an email, or try again tomorrow.`);
      }
      if (!check.ok && check.reason === 'recipient_limit') {
        throw new HttpError(429, 'This person was already told about a letter today. Leave it without an email, or try again tomorrow.');
      }
    }

    // A bare flower or candle has nothing to read, as long as the place label is the one
    // the map itself suggested. Anything a person typed waits for the guardian.
    const langHint = langOf(b.lang);
    let trustedPlace = place === '';
    if (!trustedPlace && !to && !from && !body) {
      try {
        trustedPlace = place === (await reversePlace(db, lat, lng, langHint ?? 'en'));
      } catch {
        trustedPlace = false;
      }
    }
    const needsGuardian = !!(to || from || body) || !trustedPlace;

    const id = newId();
    const key = randomBytes(18).toString('base64url');
    const now = Date.now();
    db.prepare(
      `INSERT INTO offerings (id, kind, lat, lng, place, to_name, from_name, body, lang_hint, status, mod_reason,
         locked, lock_radius_m, author_key_hash, sender_hash, created_at, moderated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, kind, lat, lng, place, to, from, body, langHint,
      needsGuardian ? 'queued' : 'approved',
      needsGuardian ? null : 'Nothing written, nothing to read.',
      locked ? 1 : 0, radius, sha256(key), sender, now, needsGuardian ? null : now,
    );
    if (email) reserveEmail(db, sender, recipientHash, id, email, now);
    const o = getOffering(id)!;
    json(res, 201, {
      id,
      key,
      status: o.status,
      queueAhead: needsGuardian ? queueAhead(o) : 0,
      url: `/l/${id}?k=${key}`,
      notice: email ? 'pending' : null,
    });
    if (needsGuardian) void guardian.tick();
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    securityHeaders(res);
    const url = new URL(req.url ?? '/', 'http://local');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    // Demo mode for recording: /?demo=1&token=ADMIN_TOKEN sets a cookie for this browser only.
    if (method === 'GET' && url.searchParams.get('demo') === '1' && url.searchParams.has('token')) {
      const ok = !!config.adminToken && safeEqual(url.searchParams.get('token')!, config.adminToken);
      url.searchParams.delete('demo');
      url.searchParams.delete('token');
      const headers: Record<string, string> = { Location: path + (url.search || '') };
      if (ok) headers['Set-Cookie'] = `gl_demo=${demoCookieValue()}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`;
      res.writeHead(303, headers);
      res.end();
      return;
    }

    // ----- API -----
    if (path === '/api/health') {
      const ollama = await ollamaHealth();
      json(res, 200, { ok: true, ollama, queue: llmQueue.pending, mail: mailer.name });
      return;
    }

    if (path === '/api/config' && method === 'GET') {
      json(res, 200, {
        demo: isDemo(req),
        lockRadiusDefault: config.lockRadiusDefault,
        model: config.gemmaModel,
        limits: LIMITS,
      });
      return;
    }

    if (path === '/api/offerings' && method === 'GET') {
      const rows = db
        .prepare(`SELECT id, kind, lat, lng, locked FROM offerings WHERE status = 'approved' ORDER BY created_at DESC LIMIT 5000`)
        .all() as Pick<Offering, 'id' | 'kind' | 'lat' | 'lng' | 'locked'>[];
      json(res, 200, {
        type: 'FeatureCollection',
        features: rows.map((r) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
          properties: { id: r.id, kind: r.kind, locked: r.locked ? 1 : 0 },
        })),
      });
      return;
    }

    if (path === '/api/recent' && method === 'GET') {
      const rows = db
        .prepare(`SELECT * FROM offerings WHERE status = 'approved' ORDER BY created_at DESC LIMIT 6`)
        .all() as unknown as Offering[];
      json(res, 200, {
        offerings: rows.map((o) => ({ id: o.id, kind: o.kind, lat: o.lat, lng: o.lng, place: o.place, created_at: o.created_at, title: offeringTitle(o) })),
      });
      return;
    }

    if (path === '/api/offerings' && method === 'POST') {
      await createOffering(req, res);
      return;
    }

    if (path === '/api/place' && method === 'GET') {
      const lat = num(url.searchParams.get('lat'));
      const lng = num(url.searchParams.get('lng'));
      if (!isValidLatLng(lat, lng)) throw new HttpError(400, 'Bad position.');
      const reader = { lat: num(url.searchParams.get('rlat')), lng: num(url.searchParams.get('rlng')) };
      const box = boxAround(lat as number, lng as number, PLACE_RADIUS_M);
      const rows = (db
        .prepare(
          `SELECT * FROM offerings WHERE status = 'approved' AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
           ORDER BY created_at DESC LIMIT 200`,
        )
        .all(box.minLat, box.maxLat, box.minLng, box.maxLng) as unknown as Offering[]).filter(
        (o) => haversineMeters(lat as number, lng as number, o.lat, o.lng) <= PLACE_RADIUS_M,
      );
      const demo = isDemo(req);
      json(res, 200, { offerings: rows.map((o) => publicSummary(o, reader, demo)) });
      return;
    }

    if (path === '/api/draft' && method === 'POST') {
      rateLimit(limits.draft, req, 'drafts');
      const b = await readJson(req);
      if (tooLong(b.notes, LIMITS.notes)) throw new HttpError(400, `Keep the notes under ${LIMITS.notes} characters.`);
      const notes = cleanText(b.notes, LIMITS.notes, true);
      const to = cleanText(b.to, LIMITS.name);
      if (notes.length < 10) throw new HttpError(400, 'Write a few memories first, even loose ones.');
      const draft = await draftLetter(to, notes);
      json(res, 200, { body: draft.body.slice(0, LIMITS.body), ms: draft.ms });
      return;
    }

    const apiMatch = /^\/api\/offerings\/([a-z0-9]{6,20})(\/translate)?$/.exec(path);
    if (apiMatch) {
      const o = getOffering(apiMatch[1]);
      const key = url.searchParams.get('k');
      if (!o) throw new HttpError(404, 'Nothing rests here.');
      const author = isAuthor(o, key);
      if (o.status !== 'approved' && !author) throw new HttpError(404, 'Nothing rests here.');
      const demo = isDemo(req);

      if (!apiMatch[2] && method === 'GET') {
        const reader = { lat: num(url.searchParams.get('lat')), lng: num(url.searchParams.get('lng')) };
        const summary = publicSummary(o, reader, demo || author);
        json(res, 200, {
          ...summary,
          body: summary.open ? o.body : null,
          from: summary.open ? o.from_name : '',
          status: o.status,
          ...(author
            ? {
                reason: o.mod_reason,
                categories: o.mod_categories ? JSON.parse(o.mod_categories) : [],
                queueAhead: o.status === 'queued' ? queueAhead(o) : 0,
                reviewing: guardian.currentId === o.id,
              }
            : {}),
        });
        return;
      }

      if (apiMatch[2] && method === 'POST') {
        rateLimit(limits.translate, req, 'translations');
        const b = await readJson(req);
        const target = langOf(b.to);
        if (o.status !== 'approved' || o.kind === 'flower' || o.kind === 'candle' || !o.body) {
          throw new HttpError(400, 'There is nothing to translate.');
        }
        if (!target) throw new HttpError(400, 'Unknown language.');
        if (target === o.lang) throw new HttpError(400, 'It is already in that language.');
        const lock = checkLock(o, { lat: b.lat as number, lng: b.lng as number }, demo || author);
        if (!lock.open) throw new HttpError(403, 'This letter only opens near its place.');
        const t = await translateOffering(db, o, target);
        json(res, 200, { lang: target, body: t.body, cached: t.cached, ms: t.ms, model: config.gemmaModel });
        return;
      }
      throw new HttpError(405, 'Not allowed.');
    }

    if (path === '/api/geo/search' && method === 'GET') {
      rateLimit(limits.geo, req, 'searches');
      const results = await searchPlaces(db, url.searchParams.get('q') ?? '', langOf(url.searchParams.get('lang')) ?? 'en');
      json(res, 200, { results });
      return;
    }

    if (path === '/api/geo/reverse' && method === 'GET') {
      rateLimit(limits.geo, req, 'lookups');
      const lat = num(url.searchParams.get('lat'));
      const lng = num(url.searchParams.get('lng'));
      if (!isValidLatLng(lat, lng)) throw new HttpError(400, 'Bad position.');
      const name = await reversePlace(db, lat as number, lng as number, langOf(url.searchParams.get('lang')) ?? 'en');
      json(res, 200, { name });
      return;
    }

    if (path.startsWith('/api/')) throw new HttpError(404, 'Not found.');

    // ----- pages -----
    const letterMatch = /^\/l\/([a-z0-9]{6,20})$/.exec(path);
    if (letterMatch && method === 'GET') {
      const o = getOffering(letterMatch[1]);
      const author = !!o && isAuthor(o, url.searchParams.get('k'));
      if (!o || (o.status !== 'approved' && !author)) {
        html(res, 404, messagePage('Nothing rests here', '<p>This letter is not on the map. It may still be with the guardian, or it was never left.</p><p><a href="/">Back to the map</a></p>'));
        return;
      }
      const demo = isDemo(req);
      const open = !o.locked || demo;
      html(res, 200, letterPage({ o, open, demo, author, queueAhead: o.status === 'queued' ? queueAhead(o) : 0 }));
      return;
    }

    if (path === '/unsubscribe') {
      rateLimit(limits.unsub, req, 'requests');
      let e = url.searchParams.get('e') ?? '';
      let t = url.searchParams.get('t') ?? '';
      if (method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8').slice(0, 2000));
        e = form.get('e') ?? '';
        t = form.get('t') ?? '';
      }
      if (!verifyUnsubscribe(config.secret, e, t)) {
        html(res, 400, messagePage('This link does not work', '<p>It may have been cut in two by your email app. Try opening it again from the email.</p>'));
        return;
      }
      if (method === 'POST') {
        blockEmail(db, e);
        html(res, 200, messagePage('Done', '<p>GeoLetter will not write to this address again. We only kept a one-way fingerprint of it, never the address itself.</p>'));
        return;
      }
      // Confirm with a button: link scanners in mail apps follow GET links on their own.
      html(res, 200, messagePage('No more letters by email', `<p>Press the button and GeoLetter will never email this address again.</p>
<form method="post" action="/unsubscribe"><input type="hidden" name="e" value="${esc(e)}"><input type="hidden" name="t" value="${esc(t)}">
<button type="submit">Stop these emails</button></form>`));
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'Not allowed.');
    await serveStatic(path === '/' ? '/index.html' : path, res);
  }

  async function serveStatic(path: string, res: ServerResponse) {
    const filePath = normalize(join(PUBLIC_DIR, decodeURIComponent(path)));
    if (!filePath.startsWith(PUBLIC_DIR + '/')) throw new HttpError(404, 'Not found.');
    try {
      const s = await stat(filePath);
      if (!s.isFile()) throw new Error();
    } catch {
      html(res, 404, messagePage('Nothing rests here', '<p><a href="/">Back to the map</a></p>'));
      return;
    }
    const ext = extname(filePath);
    const longCache = path.startsWith('/fonts/') || path.startsWith('/vendor/');
    send(res, 200, await readFile(filePath), MIME[ext] ?? 'application/octet-stream', {
      'Cache-Control': longCache ? 'public, max-age=2592000' : 'public, max-age=300',
    });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error('[http]', req.method, req.url?.split('?')[0], err);
      if (res.headersSent) return res.end();
      const message = err instanceof HttpError ? err.message : 'Something went wrong on our side.';
      if ((req.url ?? '').startsWith('/api/')) json(res, status, { error: message });
      else html(res, status, messagePage('Something went wrong', `<p>${esc(message)}</p>`));
    });
  });

  return { server, guardian };
}

function makeMailer(): MailDriver {
  if (config.mailDriver === 'smtp') {
    if (!config.smtpHost) throw new Error('MAIL_DRIVER=smtp needs SMTP_HOST.');
    return new SmtpDriver(
      { host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure, user: config.smtpUser, pass: config.smtpPass },
      config.mailFrom,
    );
  }
  return new LogDriver();
}

if (import.meta.main) {
  assertConfig();
  const db = openDb(config.dbPath);
  const mailer = makeMailer();
  const { server, guardian } = createApp(db, mailer);
  // Offerings that were mid-review when the process stopped go back in line.
  guardian.start();
  server.listen(config.port, config.host, () => {
    console.log(
      `GeoLetter listening on http://${config.host}:${config.port} · model ${config.gemmaModel} · ` +
        `${config.ollamaThreads} threads · mail ${mailer.name}${config.demoMode ? ' · DEMO MODE' : ''}`,
    );
  });
  const shutdown = () => {
    guardian.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
