/* Check-ins: start the weekly weigh-in or the monthly check-in, and the
   history of both. Before the first one, a faint sample trend shows what
   the history turns into. */

import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { card, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { asApiError } from '../../src/api/errors';
import { listCheckins } from '../../src/api/checkins';
import { useCheckinsDue } from '../../src/components/profile/CheckinDue';
import { monthlyDueDay } from '../../src/useReminders';
import { dateText } from '../../src/components/onboarding/options';
import { ErrorState, Loading, Row, RowGroup, SubScreen } from '../../src/components/profile/SubScreen';
import { SampleChart } from '../../src/components/training/Charts';
import type { Checkin } from '../../src/types';

export default function Checkins() {
  const { userId, profile } = useAuth();
  const { due } = useCheckinsDue();
  const [items, setItems] = useState<Checkin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listCheckins(userId, undefined, 50));
    } catch (e) {
      setError(asApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const lastMonthly = items?.find((c) => c.kind === 'monthly')?.day ?? null;
  const nextMonthly = monthlyDueDay(lastMonthly, profile?.onboarding_done_at);

  return (
    <SubScreen title="Check-ins" subtitle="A weigh-in every week and a full check-in every month keep your plan matched to you.">
      <RowGroup>
        <Row
          icon="scale"
          title="Weekly weigh-in"
          detail={due.weekly ? 'Due now' : 'Done this week'}
          badge={due.weekly ? 'Due' : undefined}
          onPress={() => router.push('/checkin/weekly')}
        />
        <Row
          icon="bars"
          title="Monthly check-in"
          detail={due.monthly ? 'Due now. Weight, photos and how the month felt.' : nextMonthly ? `Next on ${dateText(nextMonthly)}` : 'Weight, photos and how the month felt.'}
          badge={due.monthly ? 'Due' : undefined}
          onPress={() => router.push('/checkin/monthly')}
        />
      </RowGroup>

      <View style={{ gap: 10 }}>
        <Text style={T.h3}>History</Text>
        {loading && !items ? (
          <Loading label="Loading your check-ins" />
        ) : error && !items ? (
          <ErrorState message={error} onRetry={load} retrying={loading} />
        ) : !items?.length ? (
          <View style={card}>
            <SampleChart
              kind="line"
              caption="Your trend appears here after your first check-in."
              action={{ label: 'Log your first check-in', onPress: () => router.push('/checkin/weekly') }}
            />
          </View>
        ) : (
          <RowGroup>
            {items.map((c) => (
              <Row
                key={c.id}
                title={`${c.kind === 'monthly' ? 'Monthly check-in' : 'Weigh-in'}, ${dateText(c.day)}`}
                detail={c.ai_summary || undefined}
                value={c.weight_kg != null ? `${c.weight_kg} kg` : undefined}
                onPress={() => router.push({ pathname: '/checkin/[id]', params: { id: c.id } })}
              />
            ))}
          </RowGroup>
        )}
      </View>
    </SubScreen>
  );
}
