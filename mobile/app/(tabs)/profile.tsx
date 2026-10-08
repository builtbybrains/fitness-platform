/* Profile: the account and phone on file, every questionnaire answer
   (grouped, each group editable), what the coach remembers, check-ins,
   health apps (phones only), reminders, reports, the privacy note and
   sign out. */

import { useCallback, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { C, card as cardStyle, FONT, R, screen, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { isCloudUser } from '../../src/lib/cloud';
import { showConfirm } from '../../src/lib/dialog';
import { ageOf } from '../../src/api/profile';
import { listMyReports, unreadCount } from '../../src/api/reports';
import { disableHealthSync, enableHealthSync, syncHealth } from '../../src/api/health';
import { healthPlatform } from '../../src/api/device/health';
import { Button } from '../../src/components/Button';
import { Notice, ScreenHeader } from '../../src/components/Bits';
import { Icon } from '../../src/components/Icon';
import {
  ACTIVITY_LEVELS,
  ALLERGIES,
  DIETS,
  GOALS,
  INJURY_AREAS,
  JOB_ACTIVITIES,
  LOCATIONS,
  daysText,
  labelOf,
  labelsOf,
  phoneText,
  timeText,
} from '../../src/components/onboarding/options';
import { CheckinDueCard } from '../../src/components/profile/CheckinDue';
import { OfflineBlock, OfflineNotice } from '../../src/components/OfflineNotice';
import { StateBlock } from '../../src/components/training/Controls';
import { Row, RowGroup } from '../../src/components/profile/SubScreen';
import { ExtraIcon } from '../../src/components/profile/icons';
import type { ProfileV2 } from '../../src/types';

const join = (parts: (string | number | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

function summaries(p: ProfileV2) {
  const age = ageOf(p);
  const allergies = labelsOf(ALLERGIES, p.allergies.filter((a) => a !== 'other'));
  if (p.allergies.includes('other') && p.allergies_other) allergies.push(p.allergies_other);
  const injuries = labelsOf(INJURY_AREAS, p.injury_areas);
  return {
    about: join([p.name, age != null && `${age} years`, p.height_cm && `${p.height_cm} cm`, p.weight_kg && `${p.weight_kg} kg`]),
    lifestyle: join([labelOf(ACTIVITY_LEVELS, p.activity_level), labelOf(JOB_ACTIVITIES, p.job_activity), p.sleep_hours != null && `${p.sleep_hours} h sleep`]),
    goal: join([labelOf(GOALS, p.goal), p.timeline_months && `${p.timeline_months} month${p.timeline_months === 1 ? '' : 's'}`, p.target_weight_kg && `target ${p.target_weight_kg} kg`]),
    training: join([labelOf(LOCATIONS, p.train_location), daysText(p.training_days), timeText(p.training_time)]),
    food: join([labelOf(DIETS, p.diet_type), allergies.length ? `No ${allergies.join(', ').toLowerCase()}` : 'No allergies']),
    health: join([injuries.length ? injuries.join(', ') : 'No injuries noted', p.conditions.length ? `${p.conditions.length} condition${p.conditions.length === 1 ? '' : 's'}` : null]),
  };
}

function AccountCard() {
  const { profile, email, localMode } = useAuth();
  const name = profile?.name?.trim();
  return (
    <View style={[cardStyle, { flexDirection: 'row', alignItems: 'center', gap: 16 }]}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.greenTint, alignItems: 'center', justifyContent: 'center' }}>
        {name ? <Text style={{ fontFamily: FONT.displaySemi, fontSize: 22, color: C.green }}>{name.charAt(0).toUpperCase()}</Text> : <Icon name="person" size={26} />}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={T.h3}>{name || 'Your profile'}</Text>
        <Text style={T.meta}>{localMode ? 'No account. Your data stays on this phone.' : email ?? ''}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ExtraIcon name="phone" size={14} color={C.muted} />
          <Text style={T.small} accessibilityLabel={profile?.phone ? `Phone on file ${profile.phone}` : 'No phone on file'}>
            {profile?.phone ? phoneText(profile.phone) : 'No phone on file'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function HealthCard() {
  const { userId, profile, refreshProfile } = useAuth();
  const platform = healthPlatform();
  const [busy, setBusy] = useState<'toggle' | 'sync' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  if (Platform.OS === 'web' || !platform || !profile || !userId) return null;
  const name = platform === 'apple_health' ? 'Apple Health' : 'Health Connect';
  const on = !!profile.health_sync?.enabled;
  const last = profile.health_sync?.last_sync_at ? new Date(profile.health_sync.last_sync_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  async function toggle() {
    if (!userId || !profile) return;
    setBusy('toggle');
    setMsg(null);
    try {
      if (on) {
        await disableHealthSync(userId, profile);
        setMsg({ tone: 'success', text: `${name} disconnected. Nothing more is read from it.` });
      } else {
        const ok = await enableHealthSync(userId, profile);
        if (!ok) setMsg({ tone: 'error', text: `${name} didn't give access. Check BUILT in ${name}'s settings.` });
        else {
          await syncHealth(userId, { weightKg: profile.weight_kg }).catch(() => null);
          setMsg({ tone: 'success', text: `${name} connected.` });
        }
      }
      await refreshProfile();
    } finally {
      setBusy(null);
    }
  }

  async function syncNow() {
    if (!userId) return;
    setBusy('sync');
    setMsg(null);
    const r = await syncHealth(userId, { weightKg: profile?.weight_kg }).catch(() => null);
    setBusy(null);
    await refreshProfile();
    setMsg(r?.ok ? { tone: 'success', text: `Synced ${r.days} days and ${r.workouts} workouts.` } : { tone: 'error', text: `${name} couldn't be read right now. Try again later.` });
  }

  return (
    <View style={[cardStyle, { gap: 14 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ExtraIcon name="heart" size={24} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={T.h3}>{name}</Text>
          <Text style={T.meta}>{on ? (last ? `Connected. Last synced ${last}.` : 'Connected.') : 'Steps, active calories, workouts, weight and sleep.'}</Text>
        </View>
      </View>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Button compact variant={on ? 'secondary' : 'primary'} label={on ? 'Disconnect' : `Connect ${name}`} onPress={toggle} busy={busy === 'toggle'} />
        {on ? <Button compact variant="secondary" icon="refresh" label="Sync now" onPress={syncNow} busy={busy === 'sync'} /> : null}
      </View>
    </View>
  );
}

export default function ProfileTab() {
  const { signOut, session, profile, userId, profileLoaded, profileError, offline, refreshProfile } = useAuth();
  const unreachable = !!session && profileLoaded && !profile && !!profileError;
  const [unread, setUnread] = useState(0);
  const cloud = isCloudUser(userId);

  useFocusEffect(
    useCallback(() => {
      if (!cloud || !userId) return;
      let alive = true;
      listMyReports(userId)
        .then((r) => alive && setUnread(unreadCount(r)))
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [cloud, userId]),
  );

  async function confirmSignOut() {
    const ok = await showConfirm({
      title: 'Sign out?',
      message: session ? "You'll return to the sign-in screen. Your data stays in your account." : "You'll return to the sign-in screen. Your data stays on this device.",
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (!ok) return;
    await signOut();
    // The tabs stay mounted, so go to the sign-in screen explicitly.
    router.replace('/(auth)/login');
  }

  const s = profile ? summaries(profile) : null;
  const edit = (group: string) => () => router.push({ pathname: '/settings/[group]', params: { group } });

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 28, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <ScreenHeader title="Profile" />
        <AccountCard />
        <OfflineNotice text="Can't reach BUILT. Showing your last saved answers." show={!!session && !!profile && offline} onRetry={refreshProfile} />
        {profile ? <CheckinDueCard /> : null}

        {session && !profileLoaded ? (
          <View style={cardStyle}>
            <StateBlock kind="loading" title="Loading your answers" />
          </View>
        ) : unreachable ? (
          <OfflineBlock body="Your answers and daily targets show here as soon as BUILT answers again." onRetry={refreshProfile} />
        ) : null}

        {s ? (
          <RowGroup title="Your answers">
            <Row title="About you" detail={s.about} onPress={edit('about')} />
            <Row title="Activity and sleep" detail={s.lifestyle || 'Not answered yet'} onPress={edit('lifestyle')} />
            <Row title="Goal and timeline" detail={s.goal || 'Not answered yet'} onPress={edit('goal')} />
            <Row title="Training" detail={s.training} onPress={edit('training')} />
            <Row title="Food" detail={s.food} onPress={edit('food')} />
            <Row title="Health" detail={s.health} onPress={edit('health')} />
          </RowGroup>
        ) : null}

        {profile ? (
          <View style={[cardStyle, { flexDirection: 'row', alignItems: 'center' }]} accessibilityLabel={`Daily targets: ${profile.kcal_target} kcal and ${profile.water_target} glasses of water`}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: FONT.displaySemi, fontSize: 26, color: C.text }}>{profile.kcal_target.toLocaleString()}</Text>
              <Text style={T.small}>kcal a day</Text>
            </View>
            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.lineStrong, marginHorizontal: 16 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: FONT.displaySemi, fontSize: 26, color: C.text }}>{profile.water_target}</Text>
              <Text style={T.small}>glasses of water</Text>
            </View>
          </View>
        ) : null}

        <RowGroup title="Coach and progress">
          <Row icon="bars" title="Progress" detail="Workouts, activities, food and weight" onPress={() => router.push('/(tabs)/progress')} />
          <Row icon="brain" title="What your coach remembers" detail="See it all, delete anything" onPress={() => router.push('/memory')} />
          <Row icon="clock" title="Check-ins" detail="Weigh-ins, monthly reviews and plan changes" onPress={() => router.push('/checkin')} />
        </RowGroup>

        <HealthCard />

        <RowGroup title="Settings and help">
          <Row icon="bell" title="Reminders" detail="Each reminder on or off, quiet hours, vibration" onPress={() => router.push('/settings/reminders')} />
          <Row icon="flag" title="Report a problem" onPress={() => router.push('/report/new')} />
          <Row icon="list" title="My reports" badge={unread ? `${unread} new` : undefined} onPress={() => router.push('/report')} />
        </RowGroup>

        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16, borderRadius: R.tile, backgroundColor: C.surface }}>
          <ExtraIcon name="lock" size={20} color={C.muted} />
          <Text style={[T.small, { flex: 1, lineHeight: 19 }]}>
            Your body photos and your messages to the coach are processed by our AI provider to build your plan and reply to you. Faces are blurred on your phone before any photo is
            uploaded, and photos are stored privately: only you can see them.
          </Text>
        </View>

        <Button label="Sign out" variant="danger" onPress={confirmSignOut} />
      </ScrollView>
    </SafeAreaView>
  );
}
