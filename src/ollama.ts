import { config } from './config.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  format?: object;
  temperature?: number;
  numPredict?: number;
}

export interface ChatResult {
  content: string;
  ms: number;
  evalCount?: number;
}

/** Interactive work (translation, drafting) jumps ahead of background moderation. */
export const PRIORITY = { interactive: 0, background: 1 } as const;

interface Job {
  priority: number;
  seq: number;
  run: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

/**
 * One Gemma call at a time. The VPS has 4 cores shared with other services,
 * so we never run two generations in parallel and each call uses 2 threads.
 */
export class LlmQueue {
  private jobs: Job[] = [];
  private busy = false;
  private seq = 0;

  push<T>(priority: number, run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.jobs.push({ priority, seq: this.seq++, run, resolve: resolve as (v: unknown) => void, reject });
      this.jobs.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
      void this.next();
    });
  }

  get pending(): number {
    return this.jobs.length + (this.busy ? 1 : 0);
  }

  private async next(): Promise<void> {
    if (this.busy) return;
    const job = this.jobs.shift();
    if (!job) return;
    this.busy = true;
    try {
      job.resolve(await job.run());
    } catch (err) {
      job.reject(err);
    } finally {
      this.busy = false;
      void this.next();
    }
  }
}

export const llmQueue = new LlmQueue();

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  const body: Record<string, unknown> = {
    model: config.gemmaModel,
    messages,
    stream: false,
    keep_alive: config.ollamaKeepAlive,
    options: {
      temperature: opts.temperature ?? 0,
      num_thread: config.ollamaThreads,
      num_ctx: 4096,
      num_predict: opts.numPredict ?? 512,
    },
  };
  if (opts.format) body.format = opts.format;
  // Gemma 4 can "think" before answering; for short structured tasks that only adds latency.
  if (/gemma4|gemma-4/i.test(config.gemmaModel)) body.think = false;

  const started = Date.now();
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.ollamaTimeoutMs),
  });
  if (!res.ok) {
    throw new Error(`Ollama answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { message?: { content?: string }; eval_count?: number };
  return { content: data.message?.content ?? '', ms: Date.now() - started, evalCount: data.eval_count };
}

export async function ollamaHealth(): Promise<{ ok: boolean; model: string; installed: boolean }> {
  try {
    const res = await fetch(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const data = (await res.json()) as { models?: { name: string }[] };
    const installed = !!data.models?.some((m) => m.name === config.gemmaModel);
    return { ok: res.ok, model: config.gemmaModel, installed };
  } catch {
    return { ok: false, model: config.gemmaModel, installed: false };
  }
}
