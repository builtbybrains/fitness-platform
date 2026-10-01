// Checking what the vision model says about body photos: ranges only, no
// comments on looks, no diagnosis. Pure (unit tested).

import { extractJson, str, strList } from './ai.ts';
import type { BodyAnalysisResult } from './plan.ts';

const BUILDS = ['lean', 'average', 'athletic', 'muscular', 'heavier', 'unclear'];
export const BANNED = /\b(attractive|unattractive|ugly|beautiful|pretty|handsome|sexy|hot|gorgeous|disgusting|flabby|diagnos\w*|disease|disorder|obes\w*|scoliosis|kyphosis|lordosis|syndrome)\b/i;

function clean(list: string[]): string[] {
  return list.filter((s) => !BANNED.test(s));
}

export function parseBodyAnalysis(text: string): BodyAnalysisResult | null {
  const j = extractJson(text);
  if (!j) return null;
  const range = Array.isArray(j.body_fat_range) ? j.body_fat_range.map(Number) : [];
  if (range.length !== 2 || !range.every(Number.isFinite)) return null;
  let lo = Math.round(Math.min(range[0], range[1]));
  let hi = Math.round(Math.max(range[0], range[1]));
  lo = Math.min(55, Math.max(4, lo));
  hi = Math.min(60, Math.max(lo + 4, hi));
  const summary = str(j.summary, 400);
  return {
    body_fat_range: [lo, hi],
    build: BUILDS.includes(String(j.build)) ? String(j.build) : 'unclear',
    posture_notes: clean(strList(j.posture_notes, 3, 160)),
    training_focus: clean(strList(j.training_focus, 4, 120)),
    confidence: j.confidence === 'high' || j.confidence === 'low' ? j.confidence : 'medium',
    summary: BANNED.test(summary) ? 'A rough starting point from your photos and answers. Your plan focuses on steady, safe progress.' : summary,
  };
}
