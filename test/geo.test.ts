import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLock, haversineMeters, isValidLatLng } from '../src/geo.ts';

test('haversine: zero distance and known distances', () => {
  assert.equal(haversineMeters(10, 20, 10, 20), 0);
  // One degree of latitude is ~111.2 km.
  assert.ok(Math.abs(haversineMeters(0, 0, 1, 0) - 111_195) < 50);
  // Paris (Notre-Dame) to London (Big Ben) is ~341 km.
  const d = haversineMeters(48.853, 2.3499, 51.5007, -0.1246);
  assert.ok(d > 338_000 && d < 344_000, String(d));
  // Antimeridian: 179.9 E to 179.9 W at the equator is ~22 km, not 40 000 km.
  assert.ok(haversineMeters(0, 179.9, 0, -179.9) < 23_000);
});

test('lock: open within the radius, closed outside, closed without position', () => {
  const letter = { lat: -23.5505, lng: -46.6333, locked: 1, lock_radius_m: 200 };
  // ~111 m north
  assert.equal(checkLock(letter, { lat: -23.5495, lng: -46.6333 }).open, true);
  // ~333 m north
  const far = checkLock(letter, { lat: -23.5475, lng: -46.6333 });
  assert.equal(far.open, false);
  assert.ok(far.distance! > 300 && far.distance! < 360);
  assert.deepEqual(checkLock(letter, null), { open: false, distance: null });
  assert.equal(checkLock(letter, { lat: 999, lng: 0 }).open, false);
});

test('lock: boundary is inclusive', () => {
  const letter = { lat: 0, lng: 0, locked: 1, lock_radius_m: 1000 };
  const edge = 1000 / 111_195; // degrees of latitude for 1000 m
  assert.equal(checkLock(letter, { lat: edge * 0.999, lng: 0 }).open, true);
  assert.equal(checkLock(letter, { lat: edge * 1.01, lng: 0 }).open, false);
});

test('lock: unlocked letters and demo mode always open', () => {
  assert.equal(checkLock({ lat: 0, lng: 0, locked: 0, lock_radius_m: 200 }, null).open, true);
  const demo = checkLock({ lat: 0, lng: 0, locked: 1, lock_radius_m: 200 }, { lat: 40, lng: 40 }, true);
  assert.equal(demo.open, true);
  assert.ok(demo.distance! > 1_000_000);
});

test('isValidLatLng', () => {
  assert.equal(isValidLatLng(0, 0), true);
  assert.equal(isValidLatLng(-91, 0), false);
  assert.equal(isValidLatLng(0, 181), false);
  assert.equal(isValidLatLng('1', 2), false);
  assert.equal(isValidLatLng(NaN, 2), false);
});
