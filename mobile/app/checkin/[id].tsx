/* One past check-in: the coach's review, what changed in the plan, the
   answers and the measurements. */

import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { asApiError } from '../../src/api/errors';
import { listCheckins } from '../../src/api/checkins';
import { dateText } from '../../src/components/onboarding/options';
import { answersSummary, CheckinResultView, MEASUREMENTS } from '../../src/components/profile/checkinBits';
import { EmptyState, ErrorState, goBack, Loading, Row, RowGroup, SubScreen } from '../../src/components/profile/SubScreen';
import type { Checkin } from '../../src/types';

export default function CheckinDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const [item, setItem] = useState<Checkin | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listCheckins(userId, undefined, 120);
      setItem(list.find((c) => c.id === id) ?? null);
    } catch (e) {
      setError(asApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, [userId, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = item ? `${item.kind === 'monthly' ? 'Monthly check-in' : 'Weigh-in'}, ${dateText(item.day)}` : 'Check-in';
  const answers = item ? answersSummary(item.answers) : [];
  const measurements = item ? MEASUREMENTS.filter((m) => item.measurements?.[m.key] != null) : [];

  return (
    <SubScreen title={title} onBack={() => goBack('/checkin')}>
      {loading && item === undefined ? (
        <Loading label="Loading your check-in" />
      ) : error && item === undefined ? (
        <ErrorState message={error} onRetry={load} retrying={loading} />
      ) : !item ? (
        <EmptyState icon="clock" title="Check-in not found" body="It may have been made on another phone before this one synced." />
      ) : (
        <View style={{ gap: 24 }}>
          <CheckinResultView summary={item.ai_summary} changes={item.plan_changes} weight={item.weight_kg} />
          {answers.length ? (
            <RowGroup title="Your answers">
              {answers.map((a) => (
                <Row key={a.label} title={a.label} value={a.value} />
              ))}
            </RowGroup>
          ) : null}
          {item.answers.notes ? (
            <View style={{ gap: 6 }}>
              <Text style={T.h3}>Your notes</Text>
              <Text style={T.body}>{item.answers.notes}</Text>
            </View>
          ) : null}
          {measurements.length ? (
            <RowGroup title="Measurements">
              {measurements.map((m) => (
                <Row key={m.key} title={m.label.replace(' (cm)', '')} value={`${item.measurements[m.key]} cm`} />
              ))}
            </RowGroup>
          ) : null}
        </View>
      )}
    </SubScreen>
  );
}
