/** Fixed-window rate limiter kept in memory. Good enough for one process behind nginx. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  private readonly limit: number;
  private readonly windowMs: number;
  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** Returns 0 when allowed, or the seconds to wait. */
  take(key: string, now = Date.now()): number {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.sweep(now);
      return 0;
    }
    if (entry.count >= this.limit) return Math.ceil((entry.resetAt - now) / 1000);
    entry.count++;
    return 0;
  }

  private sweep(now: number): void {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
