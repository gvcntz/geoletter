import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../src/ratelimit.ts';
import { LlmQueue } from '../src/ollama.ts';

test('rate limiter allows N per window', () => {
  const rl = new RateLimiter(2, 1000);
  assert.equal(rl.take('ip', 0), 0);
  assert.equal(rl.take('ip', 10), 0);
  assert.ok(rl.take('ip', 20) > 0);
  assert.equal(rl.take('other', 20), 0);
  assert.equal(rl.take('ip', 1001), 0);
});

test('LLM queue runs one job at a time, interactive first', async () => {
  const q = new LlmQueue();
  const order: string[] = [];
  let active = 0;
  let maxActive = 0;
  const job = (name: string) => async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 5));
    order.push(name);
    active--;
  };
  const all = [q.push(1, job('bg1')), q.push(1, job('bg2')), q.push(0, job('ui'))];
  await Promise.all(all);
  assert.equal(maxActive, 1);
  assert.deepEqual(order, ['bg1', 'ui', 'bg2']);
});
