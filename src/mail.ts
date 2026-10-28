import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DB } from './db.ts';
import { t, type Lang } from './i18n.ts';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailDriver {
  readonly name: string;
  send(msg: MailMessage): Promise<void>;
}

/** Default driver: no email provider yet, so we only write to the journal. */
export class LogDriver implements MailDriver {
  readonly name = 'log';
  readonly sent: MailMessage[] = [];
  private readonly quiet: boolean;
  constructor(quiet = false) {
    this.quiet = quiet;
  }
  async send(msg: MailMessage): Promise<void> {
    this.sent.push(msg);
    if (!this.quiet) {
      console.log(
        `[mail:log] to=${maskEmail(msg.to)} subject=${JSON.stringify(msg.subject)}\n${msg.text
          .split('\n')
          .map((l) => '  | ' + l)
          .join('\n')}`,
      );
    }
  }
}

export class SmtpDriver implements MailDriver {
  readonly name = 'smtp';
  private transport: Promise<{ sendMail: (o: object) => Promise<unknown> }>;
  private readonly from: string;
  constructor(opts: { host: string; port: number; secure: boolean; user: string; pass: string }, from: string) {
    this.from = from;
    this.transport = import('nodemailer').then((m) =>
      m.default.createTransport({
        host: opts.host,
        port: opts.port,
        secure: opts.secure,
        auth: opts.user ? { user: opts.user, pass: opts.pass } : undefined,
      }),
    );
  }
  async send(msg: MailMessage): Promise<void> {
    const t = await this.transport;
    await t.sendMail({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(email.trim());
}

/** We never store a recipient address for longer than it takes to send; this hash is what stays. */
export function emailHash(secret: string, email: string): string {
  return createHmac('sha256', secret).update('email:' + normalizeEmail(email)).digest('hex');
}

export function unsubscribeToken(secret: string, hash: string): string {
  return createHmac('sha256', secret).update('unsub:' + hash).digest('base64url').slice(0, 32);
}

export function verifyUnsubscribe(secret: string, hash: string, token: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(hash) || typeof token !== 'string') return false;
  const expected = Buffer.from(unsubscribeToken(secret, hash));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user.slice(0, 1)}***@${domain}`;
}

const DAY = 24 * 60 * 60 * 1000;

export type EmailCheck =
  | { ok: true }
  | { ok: false; reason: 'blocked' | 'sender_limit' | 'recipient_limit' };

/**
 * Rules before we promise an email:
 * - the address has not asked to stop receiving them,
 * - the sender (hashed IP) has sent fewer than `limit` in the last 24 h,
 * - the same address has not been notified in the last 24 h (no flooding one person).
 */
export function checkEmailAllowed(
  db: DB,
  senderHash: string,
  recipientHash: string,
  limit: number,
  now = Date.now(),
): EmailCheck {
  if (isBlocked(db, recipientHash)) return { ok: false, reason: 'blocked' };
  const since = now - DAY;
  const bySender = db
    .prepare(`SELECT COUNT(*) AS n FROM email_log WHERE sender_hash = ? AND created_at > ? AND status != 'skipped'`)
    .get(senderHash, since) as { n: number };
  if (bySender.n >= limit) return { ok: false, reason: 'sender_limit' };
  const byRecipient = db
    .prepare(`SELECT COUNT(*) AS n FROM email_log WHERE email_hash = ? AND created_at > ? AND status != 'skipped'`)
    .get(recipientHash, since) as { n: number };
  if (byRecipient.n >= 1) return { ok: false, reason: 'recipient_limit' };
  return { ok: true };
}

export function reserveEmail(
  db: DB,
  senderHash: string,
  recipientHash: string,
  offeringId: string,
  email: string,
  now = Date.now(),
): void {
  db.prepare(
    `INSERT INTO email_log (sender_hash, email_hash, offering_id, status, created_at) VALUES (?, ?, ?, 'reserved', ?)`,
  ).run(senderHash, recipientHash, offeringId, now);
  db.prepare(`INSERT OR REPLACE INTO pending_emails (offering_id, email, created_at) VALUES (?, ?, ?)`).run(
    offeringId,
    normalizeEmail(email),
    now,
  );
}

export function isBlocked(db: DB, recipientHash: string): boolean {
  return !!db.prepare('SELECT 1 FROM email_blocklist WHERE email_hash = ?').get(recipientHash);
}

export function blockEmail(db: DB, recipientHash: string, now = Date.now()): void {
  db.prepare('INSERT OR IGNORE INTO email_blocklist (email_hash, created_at) VALUES (?, ?)').run(recipientHash, now);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** The notice never carries the letter itself: only the place and a link. */
export function buildNotice(opts: {
  place: string;
  letterUrl: string;
  unsubscribeUrl: string;
  /** The recipient's language is unknown; the letter's language is the best guess. */
  lang?: Lang;
}): Omit<MailMessage, 'to'> {
  const lang = opts.lang ?? 'en';
  const place = opts.place.trim() || t(lang, 'somePlace');
  const subject = t(lang, 'mailSubject', { place }).slice(0, 150);
  const text = [
    t(lang, 'mailLine', { place }),
    '',
    t(lang, 'mailReadAt', { url: opts.letterUrl }),
    '',
    t(lang, 'mailOnly'),
    t(lang, 'mailStopAt', { url: opts.unsubscribeUrl }),
  ].join('\n');
  const html = `<div lang="${lang === 'pt' ? 'pt-BR' : 'en'}" style="font-family:Georgia,serif;color:#3a2e24;background:#f5efe3;padding:24px;line-height:1.6">
<p>${escapeHtml(t(lang, 'mailLine', { place }))}</p>
<p><a href="${escapeHtml(opts.letterUrl)}" style="color:#8a5a1c">${escapeHtml(t(lang, 'mailRead'))}</a></p>
<p style="font-size:13px;color:#6b5a48">${escapeHtml(t(lang, 'mailOnly'))}<br>
<a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#6b5a48">${escapeHtml(t(lang, 'mailStop'))}</a></p>
</div>`;
  return { subject, text, html };
}
