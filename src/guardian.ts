import type { DB, Offering } from './db.ts';
import { config } from './config.ts';
import { chat, llmQueue, PRIORITY } from './ollama.ts';
import {
  MODERATION_SCHEMA,
  MODERATION_SYSTEM,
  buildModerationPrompt,
  finalDecision,
  moderationText,
  parseModeration,
  type Verdict,
} from './moderation.ts';
import { buildNotice, emailHash, unsubscribeToken, type MailDriver } from './mail.ts';
import { langFromTag } from './i18n.ts';

const MAX_ATTEMPTS = 3;

export async function moderate(o: Offering): Promise<{ verdict: Verdict; ms: number }> {
  let lastError = 'no answer';
  for (let i = 0; i < 2; i++) {
    const res = await llmQueue.push(PRIORITY.background, () =>
      chat(
        [
          { role: 'system', content: MODERATION_SYSTEM },
          { role: 'user', content: buildModerationPrompt(o) },
        ],
        { format: MODERATION_SCHEMA, temperature: 0, numPredict: 200 },
      ),
    );
    const parsed = parseModeration(res.content);
    if (parsed) return { verdict: finalDecision(parsed, moderationText(o)), ms: res.ms };
    lastError = `unparseable answer: ${res.content.slice(0, 120)}`;
  }
  throw new Error(lastError);
}

/** Background worker: takes queued offerings one by one, oldest first. */
export class Guardian {
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  currentId: string | null = null;

  private readonly db: DB;
  private readonly mailer: MailDriver;
  constructor(db: DB, mailer: MailDriver) {
    this.db = db;
    this.mailer = mailer;
  }

  start(intervalMs = 1500): void {
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    const next = this.db
      .prepare(`SELECT * FROM offerings WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`)
      .get() as Offering | undefined;
    if (!next) return;
    this.running = true;
    this.currentId = next.id;
    try {
      await this.process(next);
    } finally {
      this.running = false;
      this.currentId = null;
    }
  }

  async process(o: Offering): Promise<void> {
    try {
      const { verdict, ms } = await moderate(o);
      this.db
        .prepare(
          `UPDATE offerings SET status = ?, mod_reason = ?, mod_categories = ?, mod_model = ?, mod_ms = ?,
             lang = COALESCE(?, lang, lang_hint), moderated_at = ?, attempts = attempts + 1 WHERE id = ?`,
        )
        .run(
          verdict.allow ? 'approved' : 'rejected',
          verdict.reason,
          JSON.stringify(verdict.categories),
          config.gemmaModel,
          ms,
          verdict.lang,
          Date.now(),
          o.id,
        );
      console.log(
        `[guardian] ${o.id} ${verdict.allow ? 'approved' : 'rejected'} in ${ms} ms` +
          (verdict.categories.length ? ` (${verdict.categories.join(',')})` : ''),
      );
      await this.afterDecision(o, verdict.allow);
    } catch (err) {
      const attempts = o.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      this.db
        .prepare(`UPDATE offerings SET attempts = ?, status = ? , mod_reason = ? WHERE id = ?`)
        .run(
          attempts,
          failed ? 'failed' : 'queued',
          failed ? 'The guardian could not read this letter. Please try again later.' : null,
          o.id,
        );
      console.error(`[guardian] ${o.id} attempt ${attempts} failed: ${(err as Error).message}`);
      if (failed) await this.afterDecision(o, false);
      else await new Promise((r) => setTimeout(r, 5000));
    }
  }

  /** The recipient is only told after the guardian approves. Otherwise the address is dropped. */
  async afterDecision(o: Offering, approved: boolean): Promise<void> {
    const pending = this.db.prepare('SELECT email FROM pending_emails WHERE offering_id = ?').get(o.id) as
      | { email: string }
      | undefined;
    if (!pending) return;
    const hash = emailHash(config.secret, pending.email);
    let status = 'skipped';
    try {
      const blocked = !!this.db.prepare('SELECT 1 FROM email_blocklist WHERE email_hash = ?').get(hash);
      if (approved && !blocked) {
        const langs = this.db.prepare('SELECT lang, lang_hint FROM offerings WHERE id = ?').get(o.id) as
          | { lang: string | null; lang_hint: string | null }
          | undefined;
        const notice = buildNotice({
          place: o.place,
          letterUrl: `${config.publicUrl}/l/${o.id}`,
          unsubscribeUrl: `${config.publicUrl}/unsubscribe?e=${hash}&t=${unsubscribeToken(config.secret, hash)}`,
          lang: langFromTag(langs?.lang || langs?.lang_hint || o.lang_hint),
        });
        await this.mailer.send({ to: pending.email, ...notice });
        status = 'sent';
      } else if (blocked) {
        status = 'blocked';
      }
    } catch (err) {
      status = 'error';
      console.error(`[mail] ${o.id} could not be sent: ${(err as Error).message}`);
    } finally {
      this.db.prepare('DELETE FROM pending_emails WHERE offering_id = ?').run(o.id);
      this.db
        .prepare(`UPDATE email_log SET status = ? WHERE offering_id = ? AND status = 'reserved'`)
        .run(status, o.id);
    }
  }
}

export const LANG_NAMES: Record<string, string> = {
  en: 'English', pt: 'Brazilian Portuguese', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  ja: 'Japanese', zh: 'Chinese', ko: 'Korean', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', ru: 'Russian',
  uk: 'Ukrainian', hi: 'Hindi', ar: 'Arabic', tl: 'Tagalog', vi: 'Vietnamese', id: 'Indonesian', sv: 'Swedish',
};

/**
 * Gemma 4 E2B translated "I miss your voice" as "Sinto sua voz" and "you bought" as "você compra":
 * word by word, and in the wrong tense. The prompt now asks for meaning over words, keeps tenses,
 * and shows how longing is said in each language, because that is most of what these letters say.
 */
export function translationSystem(target: string): string {
  const language = LANG_NAMES[target] ?? target;
  return `You translate personal letters left at memorials into ${language}.
Translate the meaning and the feeling, not word by word. Write it the way a native speaker would say it to someone they love, in natural word order.
Keep every verb in its tense. A past habit stays a past habit: English "you bought it every Sunday" = Portuguese "você comprava todo domingo"; Portuguese "como sempre ficava o meu" = English "the way mine always did". What is true now stays in the present.
Keep the line breaks exactly where they are. Keep names, nicknames and forms of address (Vó, seu Antônio, Dona Chayo, Tío Beto, Abuela) as written, and the writer's tone, including informal words. Translate everything else; leave no word in the original language.
Do not add, explain or soften anything.
Missing someone is said with idioms. Translate the idiom, never its literal words:
- English "I miss your voice" = Portuguese "Sinto falta da sua voz" = Spanish "Extraño tu voz" (not "Sinto sua voz")
- Portuguese "Que saudade de você" = English "I miss you so much" = Spanish "Te extraño muchísimo"
- Spanish "Echo de menos tus manos" = Portuguese "Sinto falta das suas mãos" = English "I miss your hands"
Output only the translation.`;
}

const inflight = new Map<string, Promise<string>>();

/** Translate an approved letter, once per language. Later readers get the cached text. */
export async function translateOffering(db: DB, o: Offering, target: string): Promise<{ body: string; cached: boolean; ms: number }> {
  const cached = db.prepare('SELECT body FROM translations WHERE offering_id = ? AND lang = ?').get(o.id, target) as
    | { body: string }
    | undefined;
  if (cached) return { body: cached.body, cached: true, ms: 0 };

  const key = `${o.id}:${target}`;
  let job = inflight.get(key);
  const started = Date.now();
  if (!job) {
    job = llmQueue
      .push(PRIORITY.interactive, () =>
        chat(
          [
            { role: 'system', content: translationSystem(target) },
            { role: 'user', content: o.body },
          ],
          { temperature: 0.2, numPredict: 900 },
        ),
      )
      .then((r) => {
        const body = r.content.trim();
        db.prepare(
          'INSERT OR REPLACE INTO translations (offering_id, lang, body, model, ms, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(o.id, target, body, config.gemmaModel, r.ms, Date.now());
        console.log(`[translate] ${o.id} -> ${target} in ${r.ms} ms`);
        return body;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return { body: await job, cached: false, ms: Date.now() - started };
}

export const DRAFT_SYSTEM = `You help someone write a short letter to a person they love, living or dead, to leave at a place on a map.
Use ONLY the facts in the notes. Never invent names, places, dates, events, objects or feelings that are not in the notes.
If the notes are thin, write a short letter. Write in the same language as the notes, in the first person, plain and warm.
No clichés, no "rest in peace", no poems, no title, 50 to 140 words. Do not sign it. Output only the letter.`;

export async function draftLetter(to: string, notes: string): Promise<{ body: string; ms: number }> {
  const r = await llmQueue.push(PRIORITY.interactive, () =>
    chat(
      [
        { role: 'system', content: DRAFT_SYSTEM },
        { role: 'user', content: `Letter to: ${to || '(not given)'}\nNotes:\n${notes}` },
      ],
      { temperature: 0.5, numPredict: 400 },
    ),
  );
  return { body: r.content.trim(), ms: r.ms };
}
