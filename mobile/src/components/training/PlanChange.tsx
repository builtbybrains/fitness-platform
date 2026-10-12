/* "Change my plan": a request in the person's own words goes to the
   planner, and the answer says what changed and why. Used on the Plan
   screen and after the coach suggests a change. */

import React, { useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { C, card as cardStyle, FONT, R, T } from '../../design';
import { Button, LinkButton } from '../Button';
import { Notice } from '../Bits';
import { Icon } from '../Icon';
import { Chip } from './Controls';
import type { PlanChangeResult } from '../../planStore';

const QUICK = ['My knee hurts', 'Only 3 days this week', 'Shorter sessions', 'No equipment this week'];

/** What changed and why, after a new plan. */
export function ChangeSummary({ changes, summary, onSeePlan, bare }: { changes?: string; summary?: string; onSeePlan?: () => void; bare?: boolean }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={bare ? { gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.lineStrong } : { gap: 10, padding: 16, borderRadius: R.tile, backgroundColor: C.surface, borderWidth: 1, borderColor: C.lineStrong }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="check" size={18} color={C.green} strokeWidth={2.6} />
        <Text style={T.h3}>Your plan is updated</Text>
      </View>
      <View style={{ gap: 4 }}>
        <Text style={[T.small, { color: C.stone }]}>What changed and why</Text>
        <Text style={[T.body, { color: C.stone }]}>{changes?.trim() || 'Your week was rebuilt from your latest answers.'}</Text>
      </View>
      {summary?.trim() ? <Text style={T.meta}>{summary.trim()}</Text> : null}
      {onSeePlan ? (
        <LinkButton align="flex-start" onPress={onSeePlan} accessibilityLabel="See my plan">
          <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.text }}>See my plan</Text>
        </LinkButton>
      ) : null}
    </View>
  );
}

/** Account needed: say so plainly and offer the sign-up. */
export function NeedsAccount({ message }: { message: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Notice>{message}</Notice>
      <LinkButton align="flex-start" onPress={() => router.push('/(auth)/register')} accessibilityLabel="Create a free account">
        <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.text }}>Create a free account</Text>
      </LinkButton>
    </View>
  );
}

export function ChangePlanCard({ regenerate, generating }: { regenerate: (instruction: string) => Promise<PlanChangeResult>; generating: boolean }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [result, setResult] = useState<PlanChangeResult | null>(null);

  async function submit(request = text) {
    const ask = request.trim();
    if (!ask || generating) return;
    setResult(null);
    const r = await regenerate(ask);
    setResult(r);
    if (r.ok) setText('');
  }

  return (
    <View style={[cardStyle, { gap: 14 }]}>
      <View style={{ gap: 4 }}>
        <Text style={T.h3} accessibilityRole="header">
          Change my plan
        </Text>
        <Text style={T.meta}>Say what changed. Your coach rebuilds the week and tells you what it changed.</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {QUICK.map((q) => (
          <Chip key={q} label={q} onPress={() => setText(q)} accessibilityLabel={`Use: ${q}`} />
        ))}
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="For example: I'm travelling, only 30 minutes a day"
        placeholderTextColor={C.faint}
        accessibilityLabel="What should change in your plan"
        multiline
        maxLength={400}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          {
            minHeight: 88,
            color: C.text,
            backgroundColor: C.surface,
            borderWidth: 1,
            borderColor: focused ? C.green : C.inputBorder,
            borderRadius: R.input,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 16,
            lineHeight: 22,
            fontFamily: FONT.body,
            textAlignVertical: 'top',
          },
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
        ]}
      />
      <Button
        variant="secondary"
        icon={generating ? undefined : 'refresh'}
        label={generating ? 'Updating your plan' : 'Update my plan'}
        onPress={() => void submit()}
        busy={generating}
        disabled={!text.trim()}
      />
      {result?.ok ? <ChangeSummary changes={result.changes} summary={result.summary} /> : null}
      {result && !result.ok ? (
        result.code === 'needs_account' ? <NeedsAccount message={result.error ?? ''} /> : <Notice tone="error">{result.error ?? "Your plan couldn't be changed right now. Try again."}</Notice>
      ) : null}
    </View>
  );
}
