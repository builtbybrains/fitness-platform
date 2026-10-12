import { describe, expect, it } from 'vitest';

import { slug } from '../lib/slug';

const LABELS: [string, string][] = [
  ["Za'atar manoushe with tomato and mint", 'za-atar-manoushe-with-tomato-and-mint'],
  ['Whey shake + banana', 'whey-shake-banana'],
  ['Crème fraîche, açaí & jalapeño', 'creme-fraiche-acai-jalapeno'],
  ['Greek yogurt bowl, berries, oats', 'greek-yogurt-bowl-berries-oats'],
  ['  Labneh (2 tbsp)  ', 'labneh-2-tbsp'],
  ['Eggs on rye, avocado', 'eggs-on-rye-avocado'],
];

describe('slug', () => {
  it.each(LABELS)('%s', (label, want) => {
    expect(slug(label)).toBe(want);
  });

  it('matches slug() in scripts/gen-media.mjs, which names the photo files', async () => {
    // File contents as text (Vite ?raw import; no Node types needed).
    const rel = '../../../scripts/gen-media.mjs';
    const src = ((await import(/* @vite-ignore */ `${new URL(rel, import.meta.url).pathname}?raw`)) as { default: string }).default;
    const body = /export function slug\(label\) \{([\s\S]*?)\n\}/.exec(src)?.[1];
    expect(body).toBeTruthy();
    const generator = new Function('label', body as string) as (l: string) => string;
    for (const [label] of LABELS) expect(slug(label)).toBe(generator(label));
  });
});
