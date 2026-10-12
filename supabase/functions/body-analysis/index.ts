// BUILT body analysis: a rough starting point from the person's
// face-blurred body photos plus their questionnaire.
// Deploy: supabase functions deploy body-analysis --project-ref <ref>
//
// POST { photo_set_id: uuid, localDay?: "yyyy-mm-dd" }
// → 200 { analysis: { id, photo_set_id, created_at, result: BodyAnalysisResult, model } }
//
// The photos must already be uploaded (the app blurs faces on the phone,
// uploads to the private body-photos bucket at <user id>/<set id>/<kind>.jpg
// and adds the body_photos rows). This function reads the set's rows and
// files with the person's OWN token, so row-level security and the storage
// policies guarantee it can only ever see their photos; it also checks that
// every path is inside their folder. Photos go to the vision model and
// nowhere else; nothing about them is logged.
//
// The prompt asks for estimates only, as ranges, with no comments on looks
// and no diagnosis; the result is checked again in code.
// Limit: 6 analyses per person per UTC day.

import { body, fail, json, localDay, preflight, serverError } from '../_shared/http.ts';
import { requireUser } from '../_shared/env.ts';
import { aiProvider, chat } from '../_shared/ai.ts';
import { parseBodyAnalysis } from '../_shared/bodyAnalysis.ts';
import { describePerson, loadPerson } from '../_shared/profile.ts';
import { BODY_PHOTO_RULES, MINOR_RULES } from '../_shared/safety.ts';
import { LIMITS, limitReached, takeQuota } from '../_shared/usage.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOTAL_BASE64 = 7_000_000;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const auth = await requireUser(req, 'Sign in to get a photo estimate.');
    if (auth instanceof Response) return auth;
    const { supabase, user } = auth;
    const b = await body(req);
    const setId = String(b.photo_set_id ?? '');
    if (!UUID_RE.test(setId)) return fail('bad_request', 'Take your photos first.', 400);

    const ai = await aiProvider('vision');
    if (!ai) return fail('not_configured', "Photo estimates aren't set up yet. Your plan will use your answers instead.", 503);

    const { data: rows, error } = await supabase
      .from('body_photos')
      .select('id, kind, storage_path')
      .eq('user_id', user.id)
      .eq('set_id', setId);
    if (error) throw new Error(`read body_photos: ${error.message}`);
    const photos = (rows ?? []).filter((r) => String(r.storage_path).startsWith(`${user.id}/`));
    if (!photos.length || !photos.some((r) => r.kind === 'front')) {
      return fail('bad_request', 'Add a front photo first.', 400);
    }

    if (!(await takeQuota(supabase, 'body_analysis'))) {
      return limitReached(`You've asked for ${LIMITS.body_analysis} photo estimates today, the daily limit. Try again tomorrow.`);
    }

    const images: { kind: string; b64: string }[] = [];
    let total = 0;
    for (const r of photos.sort((a, z) => ['front', 'side', 'back'].indexOf(a.kind) - ['front', 'side', 'back'].indexOf(z.kind))) {
      const { data: blob, error: dlErr } = await supabase.storage.from('body-photos').download(String(r.storage_path));
      if (dlErr || !blob) {
        console.warn('[body-analysis] download failed for one photo:', dlErr?.message);
        continue;
      }
      const b64 = toBase64(new Uint8Array(await blob.arrayBuffer()));
      total += b64.length;
      if (total > MAX_TOTAL_BASE64) return fail('payload_too_large', 'Those photos are too large. Retake them and try again.', 413);
      images.push({ kind: String(r.kind), b64 });
    }
    if (!images.length) return fail('not_found', "We couldn't open your photos. Retake them and try again.", 404);

    const person = await loadPerson(supabase, user.id, localDay(b.localDay));
    const answer = await chat(
      ai,
      {
        messages: [
          {
            role: 'system',
            content: [
              BODY_PHOTO_RULES,
              person.minor ? MINOR_RULES : '',
              'Use the questionnaire too. Reply with ONLY JSON, no markdown:',
              '{"body_fat_range":[low,high],"build":"lean"|"average"|"athletic"|"muscular"|"heavier"|"unclear","posture_notes":["..."],"training_focus":["..."],"confidence":"low"|"medium"|"high","summary":"2 encouraging sentences about the starting point and the best training approach"}',
              'body_fat_range: whole percentages, at least 4 points apart. posture_notes: 0 to 3 short observations. training_focus: 2 to 4 short priorities for their plan.',
            ].filter(Boolean).join(' '),
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Questionnaire: ${describePerson(person)} Photos: ${images.map((i) => i.kind).join(', ')}.` },
              ...images.map((i) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${i.b64}` } })),
            ],
          },
        ],
        max_tokens: 900,
        temperature: 0.2,
        timeoutMs: 90_000,
      },
      parseBodyAnalysis,
      'body-analysis',
    );
    if (!answer) return fail('ai_busy', 'Photo estimates are busy right now. Try again in a moment.', 502);

    const { data: saved, error: insErr } = await supabase
      .from('body_analyses')
      .insert({ user_id: user.id, photo_set_id: setId, result: answer.value, model: answer.model })
      .select('id, photo_set_id, created_at, result, model')
      .single();
    if (insErr) console.error('[body-analysis] saving failed:', insErr.message);
    return json({
      analysis: saved ?? { id: null, photo_set_id: setId, created_at: new Date().toISOString(), result: answer.value, model: answer.model },
      stored: !insErr,
    });
  } catch (e) {
    return serverError('body-analysis', e);
  }
});

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
