/* "Check-in due" for Today and Profile.

     const { due, next, loading, refresh } = useCheckinsDue();
     <CheckinDueCard />            // renders nothing when nothing is due

   Weekly: no weight logged for 7 days. Monthly: 30 days since the last
   monthly check-in (or since finishing the questionnaire). Every mounted
   hook refreshes after a check-in is saved (markCheckinsChanged). */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';

import { C, FONT, R, T } from '../../design';
import { Icon } from '../Icon';
import { useAuth } from '../../auth';
import { fetchWeights } from '../../data';
import { checkinsDue, lastMonthlyCheckinDay } from '../../api/checkins';
import type { CheckinsDue } from '../../types';

let version = 0;
const listeners = new Set<() => void>();

/** Call after a check-in or weigh-in is saved. */
export function markCheckinsChanged(): void {
  version++;
  listeners.forEach((l) => l());
}

export type CheckinDueState = {
  loading: boolean;
  due: CheckinsDue;
  /** The one to show first: the monthly check-in includes a weigh-in. */
  next: 'weekly' | 'monthly' | null;
  refresh: () => Promise<void>;
};

export function useCheckinsDue(): CheckinDueState {
  const { userId, profile } = useAuth();
  const v = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => version,
  );
  const [due, setDue] = useState<CheckinsDue>({ weekly: false, monthly: false });
  const [loading, setLoading] = useState(true);
  const started = profile?.onboarding_done_at?.slice(0, 10) ?? null;

  const refresh = useCallback(async () => {
    if (!userId || !started) {
      setDue({ weekly: false, monthly: false });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [w, lastMonthly] = await Promise.all([fetchWeights(userId), lastMonthlyCheckinDay(userId).catch(() => null)]);
      const entries = w.entries ?? [];
      setDue(checkinsDue({ lastWeightDay: entries.length ? entries[entries.length - 1].date : null, lastMonthlyDay: lastMonthly, startedDay: started }));
    } catch {
      setDue({ weekly: false, monthly: false });
    } finally {
      setLoading(false);
    }
  }, [userId, started]);

  useEffect(() => {
    void refresh();
  }, [refresh, v]);

  return { loading, due, next: due.monthly ? 'monthly' : due.weekly ? 'weekly' : null, refresh };
}

/** A tappable card that opens the due check-in. Nothing when none is due. */
export function CheckinDueCard() {
  const { next, loading } = useCheckinsDue();
  if (loading || !next) return null;
  const monthly = next === 'monthly';
  return (
    <Pressable
      onPress={() => router.push(monthly ? '/checkin/monthly' : '/checkin/weekly')}
      accessibilityRole="button"
      accessibilityLabel={monthly ? 'Monthly check-in due. Start it.' : 'Weekly weigh-in due. Log your weight.'}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 16,
        borderRadius: R.card,
        backgroundColor: pressed ? C.raised : C.card,
        borderWidth: 1,
        borderColor: C.greenBorder,
      })}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.greenTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={monthly ? 'bars' : 'scale'} size={22} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: FONT.displaySemi, fontSize: 16, color: C.text }}>{monthly ? 'Monthly check-in due' : 'Weekly weigh-in due'}</Text>
        <Text style={T.meta}>{monthly ? 'Ten minutes. Your coach reviews the month and updates your plan.' : "Log this week's weight. It takes a few seconds."}</Text>
      </View>
      <Icon name="chevronRight" size={20} color={C.muted} />
    </Pressable>
  );
}
