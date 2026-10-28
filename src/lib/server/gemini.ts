import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";

/**
 * Google Gemini, server-side only. Keys come from GEMINI_API_KEY_1..3 (never
 * NEXT_PUBLIC_, never sent to the browser).
 *
 * Failover policy — for availability, not for quota:
 *  - 5xx / timeout / network error  → short backoff, then try the next key
 *    (max 3 attempts and 20 s in total)
 *  - invalid / revoked key (400/401/403) → skip that key for the rest of this process
 *  - 429 quota / rate limit → stop immediately and pause Gemini for the retryDelay Google
 *    returns; callers use the rule-based parser meanwhile. Keys share one project quota and
 *    are never rotated to get around it.
 */

const KEYS = [process.env.GEMINI_API_KEY_1, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3].filter(
  (k): k is string => Boolean(k?.trim()),
);
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 12_000; // per attempt
const BUDGET_MS = 20_000; // total across retries — a chat reply must not hang

const clients = new Map<string, GoogleGenAI>();
const badKeys = new Set<number>();
let cursor = 0; // index of the key that last worked
let lastError: string | undefined;
let quotaUntil = 0; // epoch ms; no Gemini calls before this

export const geminiEnabled = () => KEYS.length > 0 && badKeys.size < KEYS.length;
export const geminiStatus = () => ({
  keys: KEYS.length,
  usableKeys: KEYS.length - badKeys.size,
  model: GEMINI_MODEL,
  lastError,
  pausedForQuotaMs: Math.max(0, quotaUntil - Date.now()),
});

/** Google's 429 body carries e.g. "retryDelay":"36s". */
function retryDelayMs(message: string) {
  const m = /retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/.exec(message);
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : 60_000;
}

export class GeminiQuotaError extends Error {}
export class GeminiUnavailableError extends Error {}

const client = (key: string) => {
  let c = clients.get(key);
  if (!c) clients.set(key, (c = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: TIMEOUT_MS } })));
  return c;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function classify(e: unknown): "quota" | "bad_key" | "transient" | "fatal" {
  if (e instanceof ApiError) {
    if (e.status === 429) return "quota";
    if (e.status === 401 || e.status === 403) return "bad_key";
    if (e.status === 400 && /api key/i.test(e.message)) return "bad_key";
    if (e.status >= 500) return "transient";
    return "fatal";
  }
  // fetch failures, aborts and timeouts carry no status
  return "transient";
}

/** Fast, non-thinking settings for Flash models where the SDK supports them. */
const thinking = () => (GEMINI_MODEL.includes("2.5-flash") ? { thinkingConfig: { thinkingBudget: 0 } } : {});

async function generate(system: string, user: string, opts: { json: boolean; temperature: number }): Promise<string> {
  if (!geminiEnabled()) throw new GeminiUnavailableError("no usable Gemini key");
  if (Date.now() < quotaUntil) throw new GeminiQuotaError(`quota cooldown, ${Math.ceil((quotaUntil - Date.now()) / 1000)}s left`);
  let attempt = 0;
  let lastFailure: unknown;
  const started = Date.now();
  while (attempt < MAX_ATTEMPTS && Date.now() - started < BUDGET_MS) {
    // next usable key, starting from the last one that worked
    let idx = cursor;
    for (let n = 0; n < KEYS.length && badKeys.has(idx); n++) idx = (idx + 1) % KEYS.length;
    if (badKeys.has(idx)) break;
    attempt++;
    try {
      const res = await client(KEYS[idx]).models.generateContent({
        model: GEMINI_MODEL,
        contents: user,
        config: {
          systemInstruction: system,
          temperature: opts.temperature,
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
          ...thinking(),
        },
      });
      cursor = idx;
      lastError = undefined;
      const text = res.text?.trim();
      if (!text) throw new GeminiUnavailableError("empty response");
      return text;
    } catch (e) {
      lastFailure = e;
      const kind = classify(e);
      lastError = `${kind}: ${(e as Error).message.slice(0, 160)}`;
      console.error(`Gemini attempt ${attempt} (key #${idx + 1}) failed — ${lastError}`);
      if (kind === "quota") {
        quotaUntil = Date.now() + retryDelayMs((e as Error).message);
        throw new GeminiQuotaError((e as Error).message);
      }
      if (kind === "fatal") throw e;
      if (kind === "bad_key") badKeys.add(idx);
      if (kind === "transient") await sleep(250 * 2 ** (attempt - 1) + Math.random() * 150);
      cursor = (idx + 1) % KEYS.length;
    }
  }
  throw new GeminiUnavailableError(`Gemini unavailable after ${attempt} attempts: ${(lastFailure as Error)?.message ?? "no usable key"}`);
}

export async function geminiJson<T>(system: string, user: string, temperature = 0.1): Promise<T> {
  const text = await generate(system, user, { json: true, temperature });
  // tolerate a fenced block if the model adds one
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
}

export async function geminiText(system: string, user: string, temperature = 0.6): Promise<string> {
  return generate(system, user, { json: false, temperature });
}
