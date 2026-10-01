/* My reports: every problem report with its status and whether support
   replied, newest activity first. */

import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { C, FONT, R, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { asApiError } from '../../src/api/errors';
import { listMyReports } from '../../src/api/reports';
import { Button } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { EmptyState, ErrorState, Loading, SubScreen } from '../../src/components/profile/SubScreen';
import { categoryLabel, shortDate, StatusPill } from '../../src/components/profile/reportBits';
import type { ProblemReportWithThread } from '../../src/types';

export default function Reports() {
  const { userId } = useAuth();
  const [items, setItems] = useState<ProblemReportWithThread[] | null>(null);
  const [error, setError] = useState<{ message: string; account: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listMyReports(userId));
    } catch (e) {
      const err = asApiError(e);
      setError({ message: err.message, account: err.code === 'needs_account' });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Reload when coming back from a thread or a new report.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const footer = error?.account ? null : <Button label="Report a problem" onPress={() => router.push('/report/new')} />;

  return (
    <SubScreen title="My reports" subtitle="Tell us when something isn't right. We read every report and reply here." footer={footer}>
      {loading && !items ? (
        <Loading label="Loading your reports" />
      ) : error?.account ? (
        <EmptyState icon="flag" title="Reports need an account" body={error.message} />
      ) : error && !items ? (
        <ErrorState message={error.message} onRetry={load} retrying={loading} />
      ) : !items?.length ? (
        <EmptyState icon="flag" title="No reports yet" body="If something breaks, your plan looks wrong or a food estimate is off, report it and we'll reply here." />
      ) : (
        <View style={{ gap: 10 }}>
          {items.map((r) => {
            const last = r.messages[r.messages.length - 1];
            return (
              <Pressable
                key={r.id}
                onPress={() => router.push(`/report/${r.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${categoryLabel(r.category)}. ${r.message}. ${r.status === 'fixed' ? 'Fixed' : r.status === 'in_progress' ? 'In progress' : 'Sent'}.${r.unread ? ' New reply.' : ''}`}
                style={({ pressed }) => ({ backgroundColor: pressed ? C.raised : C.card, borderRadius: R.tile, padding: 16, gap: 10 })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <StatusPill status={r.status} />
                  <Text style={[T.small, { flex: 1 }]}>
                    {categoryLabel(r.category)} · {shortDate(r.created_at)}
                  </Text>
                  {r.unread ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.green }} />
                      <Text style={{ fontFamily: FONT.bodySemi, fontSize: 13, color: C.green }}>New reply</Text>
                    </View>
                  ) : null}
                  <Icon name="chevronRight" size={18} color={C.faint} />
                </View>
                <Text style={T.body} numberOfLines={2}>
                  {r.message}
                </Text>
                {last ? (
                  <Text style={T.meta} numberOfLines={1}>
                    {last.author === 'admin' ? 'BUILT support: ' : 'You: '}
                    {last.body}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </SubScreen>
  );
}
