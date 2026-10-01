// AI provider routing shared by coach, planner and analyze-meal.
//
// Provider (first secret that is set wins):
//   supabase secrets set OPENROUTER_API_KEY=sk-or-...   # OpenRouter, any model
//   supabase secrets set OPENAI_API_KEY=sk-...          # OpenAI directly
// With neither set, callers fall back to their built-in rules (coach,
// planner) or report that photo estimates are not configured (analyze-meal).
//
// Model choice:
//   AI_MODEL      overrides the text model (coach, planner). On OpenRouter it
//                 is tried first and the function's default chain follows as
//                 a fallback. On OpenAI it is the only model (an OpenRouter
//                 id like "openai/gpt-4o-mini" is accepted: the prefix is
//                 dropped).
//   VISION_MODEL  the same, for analyze-meal (must accept images).
// The OpenRouter defaults are free ":free" models, which are rate limited
// and sometimes unavailable; set AI_MODEL / VISION_MODEL to a paid model
// once the paid-provider decision is made.

export type AiProvider = {
  name: 'openrouter' | 'openai';
  url: string;
  headers: Record<string, string>;
  models: string[];
};

export function aiConfig(opts: {
  modelEnv: 'AI_MODEL' | 'VISION_MODEL';
  openRouterDefaults: string[];
  openAiDefault: string;
}): AiProvider | null {
  const override = (Deno.env.get(opts.modelEnv) ?? '').trim();
  const orKey = Deno.env.get('OPENROUTER_API_KEY');
  if (orKey) {
    return {
      name: 'openrouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${orKey}`,
        'HTTP-Referer': 'https://builtbybrains.github.io/fitness-platform/',
        'X-Title': 'BUILT',
      },
      models: [...new Set([...(override ? [override] : []), ...opts.openRouterDefaults])],
    };
  }
  const oaKey = Deno.env.get('OPENAI_API_KEY');
  if (oaKey) {
    return {
      name: 'openai',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${oaKey}` },
      models: [(override || opts.openAiDefault).replace(/^openai\//, '')],
    };
  }
  return null;
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: unknown };

/** Walk the model chain until one answer passes `accept`. Resolves null when
    every model failed (errors are logged, never returned to clients). */
export async function chat<T>(
  ai: AiProvider,
  req: { messages: ChatMessage[]; max_tokens: number; temperature: number; timeoutMs: number },
  accept: (text: string) => T | null,
  where: string,
): Promise<{ value: T; model: string } | null> {
  for (const model of ai.models) {
    try {
      const r = await fetch(ai.url, {
        method: 'POST',
        headers: ai.headers,
        signal: AbortSignal.timeout(req.timeoutMs),
        body: JSON.stringify({
          model,
          messages: req.messages,
          max_tokens: req.max_tokens,
          temperature: req.temperature,
          // OpenRouter only: reasoning models otherwise spend the token
          // budget (and leak) chain-of-thought. OpenAI rejects this field.
          ...(ai.name === 'openrouter' ? { reasoning: { enabled: false } } : {}),
        }),
      });
      if (!r.ok) {
        console.warn(`[${where}] ${model} -> HTTP ${r.status}`);
        continue;
      }
      const j = await r.json();
      const text = String(j?.choices?.[0]?.message?.content ?? '').trim();
      const value = text ? accept(text) : null;
      if (value !== null) return { value, model };
      console.warn(`[${where}] ${model} -> empty or unusable reply`);
    } catch (e) {
      console.warn(`[${where}] ${model} -> ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return null;
}
