import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonObject, finalDecision, parseModeration, scanPersonalData } from '../src/moderation.ts';

test('parses a clean JSON verdict', () => {
  const v = parseModeration('{"allow": false, "reason": "Contains a phone number.", "categories": ["personal_data"], "lang": "pt"}');
  assert.deepEqual(v, { allow: false, reason: 'Contains a phone number.', categories: ['personal_data'], lang: 'pt' });
});

test('parses JSON wrapped in code fences and prose', () => {
  const raw = 'Sure! Here is my answer:\n```json\n{ "allow": true, "reason": "A letter to a grandmother {with braces}.", "categories": [], "lang": "es" }\n```\nThanks';
  const v = parseModeration(raw);
  assert.equal(v?.allow, true);
  assert.equal(v?.reason, 'A letter to a grandmother {with braces}.');
  assert.equal(v?.lang, 'es');
});

test('accepts "true"/"false" strings and normalises categories and lang', () => {
  const v = parseModeration('{"allow":"false","reason":"x","categories":["Hate Speech","PII","grief","pii"],"lang":"pt-BR"}');
  assert.equal(v?.allow, false);
  assert.deepEqual(v?.categories, ['hate', 'personal_data']);
  assert.equal(v?.lang, 'pt');
});

test('drops unknown categories and invalid lang', () => {
  const v = parseModeration('{"allow":true,"reason":"ok","categories":["grief","other"],"lang":"Portuguese"}');
  assert.deepEqual(v?.categories, []);
  assert.equal(v?.lang, null);
});

test('returns null for unusable answers', () => {
  assert.equal(parseModeration(''), null);
  assert.equal(parseModeration('I cannot help with that.'), null);
  assert.equal(parseModeration('{"reason":"missing allow"}'), null);
  assert.equal(parseModeration('{"allow": maybe}'), null);
  assert.equal(parseModeration('{"allow": true, "reason": "unterminated'), null);
});

test('extractJsonObject handles escaped quotes inside strings', () => {
  assert.equal(extractJsonObject('x {"a":"he said \\"}\\""} y'), '{"a":"he said \\"}\\""}');
});

test('scanPersonalData finds phones, CPF, emails and links, not years or dates', () => {
  assert.deepEqual(scanPersonalData('liga pra ela: (11) 98765-4321').map((h) => h.label), ['a phone number']);
  assert.ok(scanPersonalData('CPF 123.456.789-09').some((h) => h.label === 'a CPF number'));
  assert.ok(scanPersonalData('write to ana@example.com').some((h) => h.label === 'an email address'));
  assert.ok(scanPersonalData('see www.flores.example now').some((h) => h.category === 'spam'));
  assert.deepEqual(scanPersonalData('Vovó, 1932-2019. Você morreu em 12/03/2019, às 10h.'), []);
});

test('finalDecision only ever makes the verdict stricter', () => {
  const allowed = { allow: true, reason: 'ok', categories: [], lang: 'pt' as string | null };
  const stricter = finalDecision(allowed, 'me liga no 11 98765 4321');
  assert.equal(stricter.allow, false);
  assert.deepEqual(stricter.categories, ['personal_data']);
  assert.match(stricter.reason, /phone number/);
  assert.deepEqual(finalDecision(allowed, 'Saudades, mãe.'), allowed);
  const rejected = { allow: false, reason: 'hate', categories: ['hate' as const], lang: 'en' };
  assert.equal(finalDecision(rejected, 'nothing personal').allow, false);
});
