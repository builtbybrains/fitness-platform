/**
 * OpenRouter client for the AI coach.
 *
 * The key ships via EXPO_PUBLIC_OPENROUTER_API_KEY in .env (gitignored). Note
 * that any EXPO_PUBLIC_ value is embedded in the app bundle and extractable
 * from a shipped binary; fine for development and testing, but route this
 * through your own backend before a public store release.
 *
 * The default model is a reasoning model, so requests set a low reasoning
 * effort and a real completion budget; without both, the model spends its
 * entire token allowance thinking and returns empty content.
 */
export const AI_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ?? '';
export const AI_MODEL = process.env.EXPO_PUBLIC_AI_MODEL ?? 'stealth/ox-alpha';
export const aiConfigured = Boolean(AI_KEY);

const URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface RequestBody {
  model: string;
  messages: { role: string; content: string | ContentPart[] }[];
  max_tokens: number;
  reasoning: { effort: 'low' };
}

async function complete(body: RequestBody, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${AI_KEY}`,
        'Content-Type': 'application/json',
        // OpenRouter attribution headers; harmless elsewhere.
        'HTTP-Referer': 'https://vital.app',
        'X-Title': 'VITAL',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      error?: { message?: string };
    };
    if (data.error) throw new Error(data.error.message || 'provider error');
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('empty completion');
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

/** The model rate-limits sporadically and there is no canned fallback behind
 *  these calls, so transient failures are retried with a short backoff before
 *  the error is allowed to surface. */
async function withRetries<T>(fn: () => Promise<T>, delays: number[]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= delays.length) throw e;
      await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
}

export async function chat(system: string, history: ChatTurn[], question: string): Promise<string> {
  const body: RequestBody = {
    model: AI_MODEL,
    reasoning: { effort: 'low' },
    max_tokens: 700,
    messages: [
      { role: 'system', content: system },
      ...history.slice(-10),
      { role: 'user', content: question },
    ],
  };
  return withRetries(() => complete(body, 45000), [2000, 4000]);
}

/** Vision call for meal photos; returns the model's raw text (expected JSON). */
export async function describeImage(base64Jpeg: string, prompt: string): Promise<string> {
  const body: RequestBody = {
    model: AI_MODEL,
    reasoning: { effort: 'low' },
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` } },
        ],
      },
    ],
  };
  return withRetries(() => complete(body, 60000), [2500]);
}
