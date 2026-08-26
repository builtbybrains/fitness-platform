/**
 * AI client for the coach. Works with an OpenAI key or an OpenRouter key.
 *
 * The provider is inferred from the key itself: OpenRouter keys start with
 * "sk-or-", anything else is treated as OpenAI. Both speak the same chat
 * completions shape; they differ in base URL, default model, and a couple of
 * request fields handled in buildBody below.
 *
 * The key ships via EXPO_PUBLIC_AI_API_KEY in .env (gitignored); the old
 * EXPO_PUBLIC_OPENROUTER_API_KEY name still works. Any EXPO_PUBLIC_ value is
 * embedded in the app bundle and extractable from a shipped binary; fine for
 * development and testing, but route this through your own backend before a
 * public store release.
 */
export const AI_KEY =
  process.env.EXPO_PUBLIC_AI_API_KEY ?? process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ?? '';
export const aiConfigured = Boolean(AI_KEY);

const isOpenRouter = AI_KEY.startsWith('sk-or-');
export const AI_MODEL =
  process.env.EXPO_PUBLIC_AI_MODEL ?? (isOpenRouter ? 'stealth/ox-alpha' : 'gpt-4o-mini');

const URL = isOpenRouter
  ? 'https://openrouter.ai/api/v1/chat/completions'
  : 'https://api.openai.com/v1/chat/completions';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type ChatMessage = { role: string; content: string | ContentPart[] };

interface RequestBody {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning?: { effort: 'low' };
}

/**
 * OpenRouter's default model is a reasoning model: without a low reasoning
 * effort and a real completion budget it spends the whole token allowance
 * thinking and returns empty content. OpenAI rejects the reasoning field on
 * chat completions and prefers max_completion_tokens, so each provider gets
 * its own shape.
 */
function buildBody(messages: ChatMessage[], budget: number): RequestBody {
  return isOpenRouter
    ? { model: AI_MODEL, messages, max_tokens: budget, reasoning: { effort: 'low' } }
    : { model: AI_MODEL, messages, max_completion_tokens: budget };
}

async function complete(body: RequestBody, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${AI_KEY}`,
      'Content-Type': 'application/json',
    };
    if (isOpenRouter) {
      // OpenRouter attribution headers.
      headers['HTTP-Referer'] = 'https://vital.app';
      headers['X-Title'] = 'VITAL';
    }
    const res = await fetch(URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers,
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string | null } }[];
      error?: { message?: string };
    };
    if (data.error) throw new Error(data.error.message || 'provider error');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('empty completion');
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

/** There is no canned fallback behind these calls, so transient failures are
 *  retried with a short backoff before the error is allowed to surface. */
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
  const body = buildBody(
    [{ role: 'system', content: system }, ...history.slice(-10), { role: 'user', content: question }],
    700,
  );
  return withRetries(() => complete(body, 45000), [2000, 4000]);
}

/** Vision call for meal photos; returns the model's raw text (expected JSON). */
export async function describeImage(base64Jpeg: string, prompt: string): Promise<string> {
  const body = buildBody(
    [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` } },
        ],
      },
    ],
    800,
  );
  return withRetries(() => complete(body, 60000), [2500]);
}
