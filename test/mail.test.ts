import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.ts';
import {
  LogDriver, blockEmail, buildNotice, checkEmailAllowed, emailHash, isBlocked, reserveEmail,
  unsubscribeToken, verifyUnsubscribe,
} from '../src/mail.ts';
import { Guardian } from '../src/guardian.ts';

const SECRET = 'test-secret-test-secret-test-secret-0123';

function freshDb() {
  const db = openDb(':memory:');
  return db;
}

function addOffering(db: ReturnType<typeof openDb>, id: string, place = 'Praça da Sé, São Paulo') {
  db.prepare(
    `INSERT INTO offerings (id, kind, lat, lng, place, body, author_key_hash, created_at) VALUES (?, 'letter', 0, 0, ?, 'oi', 'h', ?)`,
  ).run(id, place, Date.now());
}

test('email hash is stable, case-insensitive and does not contain the address', () => {
  const a = emailHash(SECRET, 'Maria@Example.com ');
  assert.equal(a, emailHash(SECRET, 'maria@example.com'));
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.ok(!a.includes('maria'));
  assert.notEqual(a, emailHash('another-secret-another-secret-another', 'maria@example.com'));
});

test('sender limit: 3 per day, then blocked until the window passes', () => {
  const db = freshDb();
  const now = Date.now();
  for (let i = 0; i < 3; i++) {
    addOffering(db, `o${i}`);
    const r = emailHash(SECRET, `r${i}@example.com`);
    assert.deepEqual(checkEmailAllowed(db, 'sender', r, 3, now), { ok: true });
    reserveEmail(db, 'sender', r, `o${i}`, `r${i}@example.com`, now);
  }
  const fourth = emailHash(SECRET, 'r3@example.com');
  assert.deepEqual(checkEmailAllowed(db, 'sender', fourth, 3, now), { ok: false, reason: 'sender_limit' });
  // Another sender is not affected.
  assert.deepEqual(checkEmailAllowed(db, 'other', fourth, 3, now), { ok: true });
  // 25 hours later the sender can send again.
  assert.deepEqual(checkEmailAllowed(db, 'sender', fourth, 3, now + 25 * 3600 * 1000), { ok: true });
});

test('one notice per recipient per day, whoever sends it', () => {
  const db = freshDb();
  addOffering(db, 'a');
  const r = emailHash(SECRET, 'same@example.com');
  reserveEmail(db, 'sender1', r, 'a', 'same@example.com');
  assert.deepEqual(checkEmailAllowed(db, 'sender2', r, 3), { ok: false, reason: 'recipient_limit' });
});

test('blocked addresses are refused and only the hash is stored', () => {
  const db = freshDb();
  const r = emailHash(SECRET, 'stop@example.com');
  assert.equal(isBlocked(db, r), false);
  blockEmail(db, r);
  blockEmail(db, r); // idempotent
  assert.equal(isBlocked(db, r), true);
  assert.deepEqual(checkEmailAllowed(db, 'sender', r, 3), { ok: false, reason: 'blocked' });
  const rows = db.prepare('SELECT * FROM email_blocklist').all() as Record<string, unknown>[];
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows).includes('stop@'));
});

test('unsubscribe tokens verify only for their own hash', () => {
  const h1 = emailHash(SECRET, 'a@example.com');
  const h2 = emailHash(SECRET, 'b@example.com');
  const t1 = unsubscribeToken(SECRET, h1);
  assert.equal(verifyUnsubscribe(SECRET, h1, t1), true);
  assert.equal(verifyUnsubscribe(SECRET, h2, t1), false);
  assert.equal(verifyUnsubscribe(SECRET, 'not-a-hash', t1), false);
  assert.equal(verifyUnsubscribe(SECRET, h1, t1.slice(1)), false);
});

test('notice carries place and link, never the letter', () => {
  const n = buildNotice({ place: 'Oaxaca <b>', letterUrl: 'https://x/l/abc', unsubscribeUrl: 'https://x/unsubscribe?e=1&t=2' });
  assert.equal(n.subject, 'Someone left a letter for you in Oaxaca <b>');
  assert.match(n.text, /https:\/\/x\/l\/abc/);
  assert.match(n.html, /Oaxaca &lt;b&gt;/);
});

test('after approval the notice is sent once and the address is forgotten', async () => {
  process.env.GEOLETTER_SECRET ||= SECRET;
  const db = freshDb();
  const mailer = new LogDriver(true);
  const g = new Guardian(db, mailer);
  addOffering(db, 'ok1');
  const { config } = await import('../src/config.ts');
  const r = emailHash(config.secret, 'kid@example.com');
  reserveEmail(db, 'sender', r, 'ok1', 'kid@example.com');
  const o = db.prepare('SELECT * FROM offerings WHERE id = ?').get('ok1') as never;
  await g.afterDecision(o, true);
  assert.equal(mailer.sent.length, 1);
  assert.equal(mailer.sent[0].to, 'kid@example.com');
  assert.ok(!mailer.sent[0].text.includes('oi'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pending_emails').get()!.n, 0);
  assert.equal((db.prepare('SELECT status FROM email_log').get() as { status: string }).status, 'sent');
});

test('rejected letters and blocked addresses send nothing', async () => {
  process.env.GEOLETTER_SECRET ||= SECRET;
  const { config } = await import('../src/config.ts');
  const db = freshDb();
  const mailer = new LogDriver(true);
  const g = new Guardian(db, mailer);
  addOffering(db, 'bad');
  addOffering(db, 'blk');
  reserveEmail(db, 's', emailHash(config.secret, 'x@example.com'), 'bad', 'x@example.com');
  const hb = emailHash(config.secret, 'blocked@example.com');
  reserveEmail(db, 's', hb, 'blk', 'blocked@example.com');
  blockEmail(db, hb);
  await g.afterDecision(db.prepare('SELECT * FROM offerings WHERE id = ?').get('bad') as never, false);
  await g.afterDecision(db.prepare('SELECT * FROM offerings WHERE id = ?').get('blk') as never, true);
  assert.equal(mailer.sent.length, 0);
  const statuses = (db.prepare('SELECT offering_id, status FROM email_log ORDER BY offering_id').all() as { status: string }[]).map((r) => r.status);
  assert.deepEqual(statuses, ['skipped', 'blocked']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pending_emails').get()!.n, 0);
});
