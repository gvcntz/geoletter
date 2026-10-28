import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Local development reads .env from the project root. In production systemd
// passes the same file through EnvironmentFile, so this is a no-op there.
const envPath = resolve(import.meta.dirname, '..', '.env');
if (existsSync(envPath) && !process.env.GEOLETTER_ENV_LOADED) {
  process.loadEnvFile(envPath);
  process.env.GEOLETTER_ENV_LOADED = '1';
}

function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function int(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) ? v : fallback;
}

const secret = str('GEOLETTER_SECRET', '');

export const config = {
  port: int('PORT', 3520),
  host: str('HOST', '127.0.0.1'),
  publicUrl: str('PUBLIC_URL', 'http://127.0.0.1:3520').replace(/\/$/, ''),
  dbPath: resolve(import.meta.dirname, '..', str('DB_PATH', 'data/geoletter.db')),

  ollamaUrl: str('OLLAMA_URL', 'http://127.0.0.1:11434').replace(/\/$/, ''),
  gemmaModel: str('GEMMA_MODEL', 'gemma4-local:e2b'),
  // The VPS is shared: Gemma gets at most this many CPU threads per call.
  ollamaThreads: int('OLLAMA_NUM_THREAD', 2),
  ollamaKeepAlive: str('OLLAMA_KEEP_ALIVE', '5m'),
  ollamaTimeoutMs: int('OLLAMA_TIMEOUT_MS', 180_000),

  // Used for HMACs (email hashes, unsubscribe links, IP hashes, demo cookie).
  secret,
  adminToken: str('ADMIN_TOKEN', ''),
  demoMode: str('DEMO_MODE', '0') === '1',

  mailDriver: str('MAIL_DRIVER', 'log') as 'log' | 'smtp',
  mailFrom: str('MAIL_FROM', 'GeoLetter <letters@localhost>'),
  smtpHost: str('SMTP_HOST', ''),
  smtpPort: int('SMTP_PORT', 587),
  smtpUser: str('SMTP_USER', ''),
  smtpPass: str('SMTP_PASS', ''),
  smtpSecure: str('SMTP_SECURE', '0') === '1',
  emailDailyLimit: int('EMAIL_DAILY_LIMIT', 3),

  lockRadiusDefault: int('LOCK_RADIUS_DEFAULT', 200),
  nominatimUrl: str('NOMINATIM_URL', 'https://nominatim.openstreetmap.org').replace(/\/$/, ''),
  photonUrl: str('PHOTON_URL', 'https://photon.komoot.io').replace(/\/$/, ''),
  // Sent to Nominatim and Photon so they know who is asking.
  nominatimUserAgent: str('NOMINATIM_USER_AGENT', 'GeoLetter/0.1 (open-source memorial map; self-hosted)'),
};

export function assertConfig(): void {
  if (config.secret.length < 32) {
    throw new Error('GEOLETTER_SECRET must be set to at least 32 random characters (see .env.example).');
  }
}
