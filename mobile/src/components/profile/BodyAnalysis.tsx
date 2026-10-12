/* The photo estimate: runs runBodyAnalysis on an uploaded set, with a
   designed waiting state, then shows the result as an estimate (never a
   fact), or says plainly that the plan will use the answers alone. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { C, card, FONT, R, T } from '../../design';
import { ProgressBar } from '../Bits';
import { Icon } from '../Icon';
import { BuiltMark } from '../BuiltLogo';
import { useReduceMotion } from '../motion';
import { asApiError } from '../../api/errors';
import { runBodyAnalysis } from '../../api/photos';
import type { BodyAnalysis as Analysis } from '../../types';

export type AnalysisState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'done'; analysis: Analysis }
  /** No AI key, limit reached, or the AI failed: carry on without it. */
  | { phase: 'skipped'; message: string; retry: boolean };

export function useBodyAnalysis(userId: string | null, setId: string | null) {
  const [state, setState] = useState<AnalysisState>({ phase: 'idle' });
  const run = useCallback(async () => {
    if (!userId || !setId) return;
    setState({ phase: 'running' });
    try {
      const analysis = await runBodyAnalysis(userId, setId);
      setState({ phase: 'done', analysis });
    } catch (e) {
      const err = asApiError(e);
      const retry = err.code === 'ai_busy' || err.code === 'offline' || err.code === 'server_error';
      const message =
        err.code === 'not_configured'
          ? 'The photo estimate is switched off for now, so your plan uses your answers. Your photos are saved for your next check-in.'
          : err.code === 'limit_reached'
            ? `${err.message} Your plan will use your answers for now.`
            : `${err.message} You can try again, or carry on and your plan will use your answers.`;
      setState({ phase: 'skipped', message, retry });
    }
  }, [userId, setId]);
  return { state, run, reset: () => setState({ phase: 'idle' }) };
}

const PHOTO_LINES = ['Reading your photos', 'Estimating your starting point', 'Choosing your training focus'];

/** Waiting state: the mark, a line that advances, a bar that fills slowly. */
export function AnalysisWaiting({ title, lines = PHOTO_LINES, note = 'This takes up to a minute.' }: { title?: string; lines?: string[]; note?: string }) {
  const LINES = lines;
  const reduce = useReduceMotion();
  const [i, setI] = useState(0);
  const [fill, setFill] = useState(0.08);
  const t0 = useRef(Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      const s = (Date.now() - t0.current) / 1000;
      setI(Math.min(LINES.length - 1, Math.floor(s / 4)));
      setFill(Math.min(0.92, 0.08 + (1 - Math.exp(-s / 12)) * 0.84));
    }, reduce ? 2000 : 500);
    return () => clearInterval(id);
  }, [reduce]);
  return (
    <View style={{ gap: 24, paddingVertical: 24, alignItems: 'flex-start' }} accessibilityLiveRegion="polite" accessibilityLabel={`${title ? `${title}. ` : ''}${LINES[i]}.`}>
      <BuiltMark size={48} />
      <View style={{ gap: 8, alignSelf: 'stretch' }}>
        {title ? <Text style={T.h2}>{title}</Text> : null}
        <Text style={[T.body, { color: C.muted }]}>{LINES[i]}. {note}</Text>
      </View>
      <ProgressBar value={fill} style={{ alignSelf: 'stretch' }} />
      <View style={{ gap: 10 }}>
        {LINES.map((l, j) => (
          <View key={l} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            {j < i ? (
              <Icon name="check" size={18} />
            ) : (
              <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: j === i ? C.green : C.raised }} />
              </View>
            )}
            <Text style={{ fontFamily: j === i ? FONT.bodySemi : FONT.body, fontSize: 15, color: j <= i ? C.text : C.faint }}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const BUILD_LABEL: Record<string, string> = {
  lean: 'Lean build',
  average: 'Average build',
  athletic: 'Athletic build',
  muscular: 'Muscular build',
  heavier: 'Heavier build',
  unclear: 'Build unclear from these photos',
};

export function AnalysisResult({ analysis }: { analysis: Analysis }) {
  const r = analysis.result;
  const [lo, hi] = r.body_fat_range;
  return (
    <View style={{ gap: 16 }}>
      <View style={[card, { gap: 6 }]}>
        <Text style={T.small}>Estimated body fat</Text>
        <Text style={[T.number, { color: C.text }]}>
          {lo} to {hi}%
        </Text>
        <Text style={T.meta}>
          {BUILD_LABEL[r.build] ?? 'Build noted'}. An estimate from photos, not a measurement{r.confidence === 'low' ? ', and a rough one' : ''}.
        </Text>
      </View>
      {r.summary ? <Text style={[T.body, { color: C.stone }]}>{r.summary}</Text> : null}
      {r.training_focus.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.stone }}>Your training focus</Text>
          {r.training_focus.map((f) => (
            <View key={f} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginTop: 9 }} />
              <Text style={[T.body, { flex: 1 }]}>{f}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {r.posture_notes.length ? (
        <View style={{ gap: 8, padding: 16, borderRadius: R.tile, backgroundColor: C.surface }}>
          <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.stone }}>Posture notes</Text>
          {r.posture_notes.map((n) => (
            <Text key={n} style={T.meta}>
              {n}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
