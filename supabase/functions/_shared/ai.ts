// AI provider routing shared by every AI function.
//
// Provider (first one that is set wins; each read from the Edge Function
// secret, else the app_config table, see ./env.ts):
//   OPENROUTER_API_KEY   OpenRouter, any model (the default: free models)
//   OPENAI_API_KEY       OpenAI directly
// With neither set, callers fall back to their built-in rules (coach,
// planner, typed food, swaps) or answer "not set up yet" (photos).
//
// Model choice:
//   AI_MODEL      text models (coach, planner, meals, check-in). One id or a
//                 comma-separated list, tried in order. On OpenRouter the
//                 function's free defaults follow as a fallback; on OpenAI
//                 the first entry is the only model ("openai/" is dropped).
//   VISION_MODEL  the same for photos (meals, body analysis); must accept
//                 images.
// The OpenRouter defaults are free ":free" models (PRODUCT.md: the AI stays
// on free models for now). They are rate limited and sometimes
// unavailable; when one disappears, set AI_MODEL / VISION_MODEL to a new
// list in app_config without redeploying.

import { setting } from './env.ts';

export type AiProvider = {
  name: 'openrouter' | 'openai';
  url: string;
  headers: Record<string, string>;
  models: string[];
};

export const TEXT_DEFAULTS = ['nvidia/nemotron-3-super-120b-a12b:free', 'dots-studio/dots-3-note-preview:free'];
export const VISION_DEFAULTS = ['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', 'dots-studio/dots-3-note-preview:free'];

export async function aiProvider(kind: 'text' | 'vision'): Promise<AiProvider | null> {
  const override = (await setting(kind === 'text' ? 'AI_MODEL' : 'VISION_MODEL'))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = kind === 'text' ? TEXT_DEFAULTS : VISION_DEFAULTS;
  const orKey = await setting('OPENROUTER_API_KEY');
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
      models: [...new Set([...override, ...defaults])],
    };
  }
  const oaKey = await setting('OPENAI_API_KEY');
  if (oaKey) {
    return {
      name: 'openai',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${oaKey}` },
      models: [(override[0] || 'gpt-4o-mini').replace(/^openai\//, '')],
    };
  }
  return null;
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: unknown };

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

/** The outermost JSON object in a model reply (models wrap JSON in prose or
    code fences), or null. */
export function extractJson(text: string): Record<string, unknown> | null {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s === -1 || e <= s) return null;
  try {
    const v = JSON.parse(text.slice(s, e + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function str(v: unknown, max: number, fallback = ''): string {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return (s || fallback).slice(0, max);
}

export function strList(v: unknown, maxItems: number, maxLen: number): string[] {
  return Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];
}
