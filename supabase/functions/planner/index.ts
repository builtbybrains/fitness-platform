// BUILT planner v2: builds (or changes) the person's weekly training and
// meal plan and their daily targets.
// Deploy: supabase functions deploy planner --project-ref <ref>
//
// POST { instruction?: string, goal?: string, localDay?: "yyyy-mm-dd" }
//   instruction  a change request in the person's words ("my knee hurts",
//                "only 3 days this week", "no equipment this week").
//                Omit it to build a fresh plan from the questionnaire.
//   goal         v1 field, treated as an instruction (older app builds).
// → 200 { plan: PlanV2, changes: string, summary: string, stored: boolean, model: string }
//
// Reads (RLS, the person's own token): the questionnaire, coach memory, the
// latest body-photo estimate and the current plan. Writes: ai_plans (with a
// change_log entry), the kcal/water targets on the profile, a coach-memory
// fact when a change request mentions an injury, and clears this week's and
// later exercise swaps (they pointed at the old plan's exercises).
// The rules and the safety checks live in ../_shared/plan.ts and rules.ts.
//
// Limit: 8 plans or change requests per person per UTC day.

import { body, fail, localDay, preflight, serverError, json } from '../_shared/http.ts';
import { requireUser } from '../_shared/env.ts';
import { str } from '../_shared/ai.ts';
import { loadPerson } from '../_shared/profile.ts';
import { loadMemory, saveFacts } from '../_shared/memory.ts';
import { buildPlan, type BodyAnalysisResult } from '../_shared/plan.ts';
import { injuriesFromText } from '../_shared/exercises.ts';
import { storePlan } from '../_shared/planStore.ts';
import { LIMITS, limitReached, takeQuota } from '../_shared/usage.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const auth = await requireUser(req, 'Sign in to build a plan.');
    if (auth instanceof Response) return auth;
    const { supabase, user } = auth;

    const b = await body(req);
    const instruction = str(b.instruction, 500) || str(b.goal, 300) || null;
    const today = localDay(b.localDay);

    if (!(await takeQuota(supabase, 'plan'))) {
      return limitReached(`You've changed your plan ${LIMITS.plan} times today, the daily limit. Try again tomorrow.`);
    }

    const person = await loadPerson(supabase, user.id, today);
    if (person.rule === 'blocked') return fail('forbidden', 'BUILT is for people aged 13 and over.', 403);

    const [memory, analysisRow, planRow] = await Promise.all([
      loadMemory(supabase, user.id),
      supabase.from('body_analyses').select('result').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('ai_plans').select('plan, change_log').eq('user_id', user.id).maybeSingle(),
    ]);

    const { plan, changes, model } = await buildPlan({
      person,
      memory,
      analysis: (analysisRow.data?.result as BodyAnalysisResult | undefined) ?? null,
      previous: planRow.data?.plan ?? null,
      instruction,
      today,
    });

    const stored = await storePlan(supabase, user.id, plan, planRow.data?.change_log, today);

    if (instruction) {
      const areas = injuriesFromText(instruction);
      if (areas.length && /(hurt|pain|sore|injur|ache|tweak|strain|sprain)/i.test(instruction)) {
        await saveFacts(supabase, user.id, [{ fact: `Reported ${areas.map((a) => a.replace('_', ' ')).join(' and ')} pain (${today}): "${instruction.slice(0, 120)}"`, category: 'injury' }], 'chat', memory);
      }
    }

    return json({ plan, changes, summary: plan.summary, stored, model });
  } catch (e) {
    return serverError('planner', e);
  }
});
