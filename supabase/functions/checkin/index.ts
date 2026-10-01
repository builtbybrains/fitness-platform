// BUILT check-ins: weekly weigh-ins and monthly check-ins.
// Deploy: supabase functions deploy checkin --project-ref <ref>
//
// POST {
//   kind: "weekly" | "monthly",
//   day?: "yyyy-mm-dd" (the person's local day; default today),
//   weight_kg?: number,
//   measurements?: { waist_cm?, hips_cm?, chest_cm?, arm_cm?, thigh_cm? },
//   answers?: { energy?, sleep?, hunger?, difficulty? (1..5), adherence? (0..100), notes? },
//   photo_set_id?: uuid   (monthly photos, uploaded and analysed first)
// }
// → 200 { checkin, summary, plan_changes: { changes, instruction, kcal_before, kcal_after } | null, plan: PlanV2 | null }
//
// Weekly: saves the weigh-in (also to weights and the profile) and answers
// with the trend. No plan change, no AI, no limit.
// Monthly: also compares with the previous check-in, the weight trend, the
// goal's pace and the latest photo estimate, asks the planner for an
// adjusted plan (calorie change and volume decided in code, see
// ../_shared/checkinReview.ts), writes a short review, saves both on the
// check-in row, remembers notable answers, and sends a "plan updated" push.
// One check-in per kind per day: sending again updates it.
// Limit: 6 monthly reviews per person per UTC day.

import { body, fail, json, localDay, preflight, serverError } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/env.ts';
import { aiProvider, chat, str } from '../_shared/ai.ts';
import { loadPerson } from '../_shared/profile.ts';
import { loadMemory, saveFacts, type MemoryCategory } from '../_shared/memory.ts';
import { asPlanV2, type BodyAnalysisResult, buildPlan } from '../_shared/plan.ts';
import { storePlan } from '../_shared/planStore.ts';
import { cleanAnswers, cleanMeasurements, review } from '../_shared/checkinReview.ts';
import { sendPush } from '../_shared/push.ts';
import { MINOR_RULES, SAFETY_RULES } from '../_shared/safety.ts';
import { LIMITS, limitReached, takeQuota } from '../_shared/usage.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const auth = await requireUser(req, 'Sign in to check in.');
    if (auth instanceof Response) return auth;
    const { supabase, user } = auth;
    const b = await body(req);

    const kind = b.kind === 'monthly' ? 'monthly' : b.kind === 'weekly' ? 'weekly' : null;
    if (!kind) return fail('bad_request', 'Choose a weekly or monthly check-in.', 400);
    const day = localDay(b.day ?? b.localDay);
    const weight = b.weight_kg == null || b.weight_kg === '' ? null : Number(b.weight_kg);
    if (weight != null && (!Number.isFinite(weight) || weight < 30 || weight > 300)) {
      return fail('bad_request', 'Weight should be between 30 and 300 kg.', 400);
    }
    const kg = weight == null ? null : Math.round(weight * 10) / 10;
    if (kind === 'weekly' && kg == null) return fail('bad_request', 'Enter your weight first.', 400);
    const measurements = cleanMeasurements(b.measurements);
    const answers = cleanAnswers(b.answers);
    const photoSet = UUID_RE.test(String(b.photo_set_id ?? '')) ? String(b.photo_set_id) : null;

    if (kind === 'monthly' && !(await takeQuota(supabase, 'checkin'))) {
      return limitReached(`You've sent ${LIMITS.checkin} monthly check-ins today, the daily limit. Try again tomorrow.`);
    }

    let photoIds: string[] = [];
    if (photoSet) {
      const { data } = await supabase.from('body_photos').select('id').eq('user_id', user.id).eq('set_id', photoSet);
      photoIds = (data ?? []).map((r) => String(r.id));
    }

    const { data: row, error: upErr } = await supabase
      .from('checkins')
      .upsert(
        { user_id: user.id, kind, day, weight_kg: kg, measurements, answers, photo_set_id: photoSet, photo_ids: photoIds, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,kind,day' },
      )
      .select('*')
      .single();
    if (upErr) throw new Error(`save checkin: ${upErr.message}`);

    if (kg != null) {
      const [w, p] = await Promise.all([
        supabase.from('weights').upsert({ user_id: user.id, day, kg }, { onConflict: 'user_id,day' }),
        supabase.from('profiles').update({ weight_kg: kg }).eq('id', user.id),
      ]);
      if (w.error) console.warn('[checkin] weights:', w.error.message);
      if (p.error) console.warn('[checkin] profile weight:', p.error.message);
    }

    const person = await loadPerson(supabase, user.id, day);
    const [prevRow, weights] = await Promise.all([
      supabase.from('checkins').select('day, weight_kg, measurements').eq('user_id', user.id).eq('kind', kind).lt('day', day).order('day', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('weights').select('day, kg').eq('user_id', user.id).lte('day', day).order('day', { ascending: false }).limit(120),
    ]);
    const history = (weights.data ?? []).map((w) => ({ day: String(w.day).slice(0, 10), kg: Number(w.kg) }));
    const nowKg = kg ?? history[0]?.kg ?? person.weight_kg;
    const startPoint = prevRow.data?.weight_kg != null
      ? { day: String(prevRow.data.day), kg: Number(prevRow.data.weight_kg) }
      : history.filter((h) => daysBetween(h.day, day) >= (kind === 'weekly' ? 5 : 21)).at(0) ?? history.at(-1) ?? null;
    const days = startPoint ? daysBetween(startPoint.day, day) : 0;

    const rev = review({
      goal: person.goal,
      minor: person.minor,
      startKg: startPoint && startPoint.day !== day ? startPoint.kg : null,
      nowKg,
      days,
      targetKg: person.target_weight_kg,
      months: person.timeline_months,
      answers,
      startWaist: Number((prevRow.data?.measurements as Record<string, unknown> | null)?.waist_cm) || null,
      nowWaist: measurements.waist_cm ?? null,
    });

    if (kind === 'weekly') {
      const summary = rev.lines.join(' ');
      const { data: saved } = await supabase.from('checkins').update({ ai_summary: summary }).eq('id', row.id).select('*').single();
      return json({ checkin: saved ?? { ...row, ai_summary: summary }, summary, plan_changes: null, plan: null });
    }

    // ── monthly: review, new plan, summary ──
    const [memory, analyses, planRow] = await Promise.all([
      loadMemory(supabase, user.id),
      supabase.from('body_analyses').select('result, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(2),
      supabase.from('ai_plans').select('plan, change_log, kcal_target').eq('user_id', user.id).maybeSingle(),
    ]);
    const [latest, earlier] = (analyses.data ?? []).map((a) => a.result as BodyAnalysisResult);
    const analysisLine = latest && earlier
      ? `Photo estimate: body fat about ${latest.body_fat_range[0]} to ${latest.body_fat_range[1]}% (was ${earlier.body_fat_range[0]} to ${earlier.body_fat_range[1]}%).`
      : '';
    const kcalBefore = asPlanV2(planRow.data?.plan)?.kcal_target ?? planRow.data?.kcal_target ?? person.kcal_target;
    const extra = [rev.lines.join(' '), analysisLine, answers.notes ? `They wrote: "${answers.notes}"` : ''].filter(Boolean).join(' ');

    const { plan, changes } = await buildPlan({
      person,
      memory,
      analysis: latest ?? null,
      previous: planRow.data?.plan ?? null,
      instruction: rev.instruction,
      kcalDelta: rev.kcalDelta,
      extra,
      today: day,
    });
    const stored = await storePlan(supabase, user.id, plan, planRow.data?.change_log, day);

    let summary = [...rev.lines, analysisLine].filter(Boolean).join(' ');
    const ai = await aiProvider('text');
    if (ai) {
      const answer = await chat(
        ai,
        {
          messages: [
            {
              role: 'system',
              content: [
                'You are the BUILT coach writing a monthly check-in review: warm, direct, specific, no guilt. 3 to 4 short sentences, plain text, second person.',
                'Say how the month went (use the numbers given), then what changed in the plan and why. Never invent numbers.',
                SAFETY_RULES,
                person.minor ? MINOR_RULES : '',
              ].filter(Boolean).join(' '),
            },
            { role: 'user', content: `Month review facts: ${extra || 'No weight data yet.'} Answers: ${JSON.stringify(answers)}. Plan changes: ${changes}` },
          ],
          max_tokens: 400,
          temperature: 0.5,
          timeoutMs: 30_000,
        },
        (t) => (t.length > 20 ? t : null),
        'checkin:summary',
      );
      if (answer) summary = str(answer.value, 1200);
    }
    if (!summary) summary = 'Thanks for checking in. Your plan is updated for the month ahead.';

    const planChanges = { changes, instruction: rev.instruction, kcal_before: kcalBefore, kcal_after: plan.kcal_target, kcal_delta: rev.kcalDelta };
    const { data: saved, error: saveErr } = await supabase
      .from('checkins')
      .update({ ai_summary: summary.slice(0, 4000), plan_changes: planChanges, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .select('*')
      .single();
    if (saveErr) console.error('[checkin] saving review failed:', saveErr.message);

    const facts: { fact: string; category: MemoryCategory }[] = [];
    if ((answers.difficulty ?? 3) >= 4) facts.push({ fact: `Found the plan too hard (check-in ${day})`, category: 'training' });
    if ((answers.difficulty ?? 3) <= 2) facts.push({ fact: `Found the plan too easy (check-in ${day})`, category: 'training' });
    if ((answers.hunger ?? 3) >= 4) facts.push({ fact: `Often hungry on the plan (check-in ${day})`, category: 'food' });
    if ((answers.sleep ?? 3) <= 2) facts.push({ fact: `Sleeping poorly (check-in ${day})`, category: 'health' });
    await saveFacts(supabase, user.id, facts, 'checkin', memory);

    if (stored) {
      await sendPush(serviceClient(), [user.id], { title: 'Your plan is updated', body: changes.slice(0, 160), data: { type: 'plan_updated' } }, 'plan_updated');
    }

    return json({ checkin: saved ?? { ...row, ai_summary: summary, plan_changes: planChanges }, summary, plan_changes: planChanges, plan });
  } catch (e) {
    return serverError('checkin', e);
  }
});

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}
