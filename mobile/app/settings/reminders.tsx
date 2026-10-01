/* Reminder settings: each reminder on or off, and quiet hours (default
   22:00 to 07:00). Saved to the profile, so they follow the account; the
   phone reschedules as soon as anything changes. */

import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Switch, Text, View } from 'react-native';

import { C, FONT, R, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { useReminders } from '../../src/useReminders';
import { clockOf, daysText } from '../../src/components/onboarding/options';
import { Button } from '../../src/components/Button';
import { Field } from '../../src/components/Field';
import { Notice } from '../../src/components/Bits';
import { SubScreen } from '../../src/components/profile/SubScreen';
import { ExtraIcon } from '../../src/components/profile/icons';
import type { ReminderPrefs } from '../../src/types';

type Key = Exclude<keyof ReminderPrefs, 'meal_times' | 'water_every_hours'>;

function ToggleRow({ title, detail, value, onChange }: { title: string; detail: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      aria-checked={value}
      accessibilityLabel={`${title}. ${detail}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: pressed ? C.raised : C.card })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 16, lineHeight: 22, color: C.text }}>{title}</Text>
        <Text style={T.meta}>{detail}</Text>
      </View>
      {/* The whole row is the control; the switch only shows the state. */}
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden>
        <Switch
          value={value}
          trackColor={{ true: C.green, false: '#4A4A4A' }}
          thumbColor={value ? C.onGreen : C.stone}
          {...(Platform.OS === 'web' ? { activeThumbColor: C.onGreen, tabIndex: -1 } : {})}
        />
      </View>
    </Pressable>
  );
}

const clock = (t: string) => {
  const m = /^(\d{1,2})[:.h]?(\d{2})$/.exec(t.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
};

export default function ReminderSettings() {
  const { profile } = useAuth();
  const r = useReminders();
  const [local, setLocal] = useState(r.prefs);
  const [flash, setFlash] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [from, setFrom] = useState(r.quietStart);
  const [to, setTo] = useState(r.quietEnd);
  const [savingQuiet, setSavingQuiet] = useState(false);
  const [asking, setAsking] = useState(false);

  // Keep the switches in step with the saved profile.
  const savedKey = JSON.stringify(r.prefs);
  useEffect(() => {
    setLocal(r.prefs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  async function toggle(key: Key, v: boolean) {
    setLocal((p) => ({ ...p, [key]: v }));
    setFlash(null);
    const res = await r.update({ [key]: v });
    if (res.error) {
      setLocal((p) => ({ ...p, [key]: !v }));
      setFlash({ tone: 'error', text: res.error });
    } else setFlash({ tone: 'success', text: 'Saved.' });
  }

  async function saveQuiet() {
    const a = clock(from);
    const b = clock(to);
    if (!a || !b) return setFlash({ tone: 'error', text: 'Enter quiet hours as times like 22:00 and 07:00.' });
    setSavingQuiet(true);
    const res = await r.setQuietHours(a, b);
    setSavingQuiet(false);
    if (res.error) setFlash({ tone: 'error', text: res.error });
    else {
      setFrom(a);
      setTo(b);
      setFlash({ tone: 'success', text: `Quiet from ${a} to ${b}. No reminders in between.` });
    }
  }

  const train = profile ? `${daysText(profile.training_days)} at ${clockOf(profile.training_time)}` : 'On your training days';
  const water = `Every ${local.water_every_hours ?? 2} hours, 10:00 to 20:00`;

  return (
    <SubScreen title="Reminders" subtitle="Pick the nudges you want. Nothing arrives during your quiet hours.">
      {r.web ? (
        <Notice>Reminders arrive in the BUILT app on your phone. Your choices here are saved to your account and apply there.</Notice>
      ) : !r.supported ? (
        <Notice>Reminders need the full BUILT app. Your choices are saved and apply when you install it.</Notice>
      ) : r.permission !== 'granted' ? (
        <View style={{ gap: 12, padding: 16, borderRadius: R.card, backgroundColor: C.card, borderWidth: 1, borderColor: C.greenBorder }}>
          <Text style={T.h3}>Notifications are off</Text>
          <Text style={T.meta}>
            {r.permission === 'denied' ? 'Allow notifications for BUILT in your phone settings to get these reminders.' : 'Turn them on so these reminders can reach you.'}
          </Text>
          {r.permission === 'denied' ? (
            <Button compact label="Open phone settings" onPress={() => void Linking.openSettings()} style={{ alignSelf: 'flex-start' }} />
          ) : (
            <Button
              compact
              label={asking ? 'Asking' : 'Turn on notifications'}
              busy={asking}
              onPress={async () => {
                setAsking(true);
                await r.allow();
                setAsking(false);
              }}
              style={{ alignSelf: 'flex-start' }}
            />
          )}
        </View>
      ) : null}

      {flash ? <Notice tone={flash.tone}>{flash.text}</Notice> : null}

      <View style={{ gap: 10 }}>
        <Text style={T.h3}>On your phone</Text>
        <View style={{ borderRadius: R.card, overflow: 'hidden', gap: 1, backgroundColor: C.line }}>
          <ToggleRow title="Workout" detail={train} value={local.workout} onChange={(v) => void toggle('workout', v)} />
          <ToggleRow title="Meals" detail="Breakfast 8:00, lunch 13:00, dinner 19:30" value={local.meals} onChange={(v) => void toggle('meals', v)} />
          <ToggleRow title="Water" detail={water} value={local.water} onChange={(v) => void toggle('water', v)} />
          <ToggleRow title="Weekly weigh-in" detail="Mondays at 8:00" value={local.weigh_in} onChange={(v) => void toggle('weigh_in', v)} />
          <ToggleRow title="Monthly check-in" detail="9:00 on the day it is due" value={local.checkin} onChange={(v) => void toggle('checkin', v)} />
          <ToggleRow title="Streak at risk" detail="20:00 on training days, only if the workout isn't done" value={local.streak} onChange={(v) => void toggle('streak', v)} />
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Text style={T.h3}>From BUILT</Text>
        <View style={{ borderRadius: R.card, overflow: 'hidden', gap: 1, backgroundColor: C.line }}>
          <ToggleRow title="Plan updated" detail="When your coach changes your plan" value={local.plan_updated} onChange={(v) => void toggle('plan_updated', v)} />
          <ToggleRow title="Replies to your reports" detail="When BUILT support answers a problem you reported" value={local.report_reply} onChange={(v) => void toggle('report_reply', v)} />
        </View>
      </View>

      <View style={{ gap: 12, padding: 20, borderRadius: R.card, backgroundColor: C.card }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ExtraIcon name="moon" size={22} />
          <Text style={T.h3}>Quiet hours</Text>
        </View>
        <Text style={T.meta}>Reminders that fall in quiet hours move to when they end, or are skipped when they would be too late to help.</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="From" value={from} onChangeText={setFrom} placeholder="22:00" keyboardType="numbers-and-punctuation" maxLength={5} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="To" value={to} onChangeText={setTo} placeholder="07:00" keyboardType="numbers-and-punctuation" maxLength={5} />
          </View>
        </View>
        <Button compact variant="secondary" label={savingQuiet ? 'Saving' : 'Save quiet hours'} onPress={saveQuiet} busy={savingQuiet} style={{ alignSelf: 'flex-start' }} />
      </View>
    </SubScreen>
  );
}
