import "server-only";
import { ApiError, GoogleGenAI, type ThinkingLevel } from "@google/genai";

/**
 * Google Gemini, server-side only. Keys come from GEMINI_API_KEY_1..3 (never
 * NEXT_PUBLIC_, never sent to the browser).
 *
 * Failover policy — for availability, not for quota:
 *  - no answer after 1.5 s → hedge: the same request goes out on the next key and the first
 *    answer wins (the model's latency is bursty under load; most replies take ~1.4 s)
 *  - 5xx / network error → try the next key right away
 *  - at most 3 attempts and 3.5 s in total; after that callers answer with the rule-based
 *    parser, so a chat reply never waits on an overloaded model
 *  - invalid / revoked key (400/401/403) → skip that key for the rest of this process
 *  - 429 quota / rate limit → stop immediately and pause Gemini for the retryDelay Google
 *    returns; callers use the rule-based parser meanwhile. Keys share one project quota and
 *    are never rotated to get around it.
 */

const KEYS = [process.env.GEMINI_API_KEY_1, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3].filter(
  (k): k is string => Boolean(k?.trim()),
);
// Flash-Lite answers in ~1–2 s; bigger Flash models often took 10 s+ or returned 503 under load.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const MAX_ATTEMPTS = 3;
const HEDGE_MS = 1_500; // start a parallel attempt if the current one hasn't answered by then
// Total wait, enforced client-side (the API rejects server deadlines under 10 s).
export const BUDGET_MS = 3_500;

const clients = new Map<string, GoogleGenAI>();
const badKeys = new Set<number>();
let cursor = 0; // index of the key that last worked
let quotaUntil = 0; // epoch ms; no Gemini calls before this

export const geminiEnabled = () => KEYS.length > 0 && badKeys.size < KEYS.length;
export const geminiStatus = () => ({ model: GEMINI_MODEL, usableKeys: KEYS.length - badKeys.size });

/** Google's 429 body carries e.g. "retryDelay":"36s". */
function retryDelayMs(message: string) {
  const m = /retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/.exec(message);
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : 60_000;
}

export class GeminiQuotaError extends Error {}
class GeminiUnavailableError extends Error {}

const client = (key: string) => {
  let c = clients.get(key);
  if (!c) clients.set(key, (c = new GoogleGenAI({ apiKey: key })));
  return c;
};

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

/** Least thinking each model family allows: parsing a request doesn't need reasoning, and thinking is most of the latency. */
const thinking = () => {
  if (GEMINI_MODEL.includes("2.5-flash")) return { thinkingConfig: { thinkingBudget: 0 } };
  if (GEMINI_MODEL.startsWith("gemini-3")) return { thinkingConfig: { thinkingLevel: (GEMINI_MODEL.includes("lite") || GEMINI_MODEL.startsWith("gemini-3-flash") ? "minimal" : "low") as ThinkingLevel } };
  return {};
};

async function generate(system: string, user: string, opts: { json: boolean; temperature: number; budgetMs?: number }): Promise<string> {
  const budget = opts.budgetMs ?? BUDGET_MS;
  if (!geminiEnabled()) throw new GeminiUnavailableError("no usable Gemini key");
  if (Date.now() < quotaUntil) throw new GeminiQuotaError(`quota cooldown, ${Math.ceil((quotaUntil - Date.now()) / 1000)}s left`);

  return new Promise<string>((resolve, reject) => {
    const controllers: AbortController[] = [];
    let attempts = 0;
    let running = 0;
    let done = false;
    let lastFailure: unknown;
    let hedge: ReturnType<typeof setTimeout> | undefined;

    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(hedge);
      clearTimeout(deadline);
      controllers.forEach((c) => c.abort());
      settle();
    };
    const deadline = setTimeout(
      () => finish(() => reject(new GeminiUnavailableError(`no Gemini answer within ${budget} ms (${attempts} attempts)`))),
      budget,
    );

    const launch = () => {
      if (done) return;
      // next usable key, starting from the last one that worked
      let idx = cursor;
      for (let n = 0; n < KEYS.length && badKeys.has(idx); n++) idx = (idx + 1) % KEYS.length;
      if (badKeys.has(idx) || attempts >= MAX_ATTEMPTS) {
        if (running === 0) {
          finish(() => reject(new GeminiUnavailableError(`Gemini unavailable after ${attempts} attempts: ${(lastFailure as Error)?.message ?? "no usable key"}`)));
        }
        return;
      }
      const attempt = ++attempts;
      running++;
      cursor = (idx + 1) % KEYS.length; // a hedge or retry goes to a different key
      const ctrl = new AbortController();
      controllers.push(ctrl);
      clearTimeout(hedge);
      hedge = setTimeout(launch, HEDGE_MS);

      client(KEYS[idx])
        .models.generateContent({
          model: GEMINI_MODEL,
          contents: user,
          config: {
            systemInstruction: system,
            temperature: opts.temperature,
            ...(opts.json ? { responseMimeType: "application/json" } : {}),
            ...thinking(),
            abortSignal: ctrl.signal,
          },
        })
        .then((res) => {
          const text = res.text?.trim();
          if (!text) throw new GeminiUnavailableError("empty response");
          cursor = idx;
          finish(() => resolve(text));
        })
        .catch((e) => {
          running--;
          if (done) return; // aborted because another attempt already answered
          lastFailure = e;
          const kind = classify(e);
          console.error(`Gemini attempt ${attempt} (key #${idx + 1}) failed — ${kind}: ${(e as Error).message.slice(0, 160)}`);
          if (kind === "quota") {
            quotaUntil = Date.now() + retryDelayMs((e as Error).message);
            return finish(() => reject(new GeminiQuotaError((e as Error).message)));
          }
          if (kind === "fatal") return finish(() => reject(e));
          if (kind === "bad_key") badKeys.add(idx);
          launch(); // failed fast: try the next key now instead of waiting for the hedge
        });
    };
    launch();
  });
}

export async function geminiJson<T>(system: string, user: string, temperature = 0.1, budgetMs?: number): Promise<T> {
  const text = await generate(system, user, { json: true, temperature, budgetMs });
  // tolerate a fenced block if the model adds one
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
}

export async function geminiText(system: string, user: string, temperature = 0.6): Promise<string> {
  return generate(system, user, { json: false, temperature });
}
