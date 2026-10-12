/* One report and its conversation with BUILT support. Opening it marks
   the admin's replies as read; the person can reply. */

import { useCallback, useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { C, FONT, R, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { asApiError } from '../../src/api/errors';
import { getReport, markReportRead, replyToReport, reportScreenshotUrl } from '../../src/api/reports';
import { Button } from '../../src/components/Button';
import { Field } from '../../src/components/Field';
import { Notice } from '../../src/components/Bits';
import { BuiltMark } from '../../src/components/BuiltLogo';
import { ErrorState, goBack, Loading, SubScreen } from '../../src/components/profile/SubScreen';
import { categoryLabel, StatusPill, timeOf } from '../../src/components/profile/reportBits';
import type { ProblemReportWithThread, ReportMessage } from '../../src/types';

function Bubble({ author, body, at }: { author: 'user' | 'admin'; body: string; at: string }) {
  const mine = author === 'user';
  return (
    <View style={{ flexDirection: 'row', gap: 10, justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-end' }}>
      {mine ? null : <BuiltMark size={28} />}
      <View
        style={{
          maxWidth: '82%',
          gap: 4,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: R.card,
          borderBottomRightRadius: mine ? 6 : R.card,
          borderBottomLeftRadius: mine ? R.card : 6,
          backgroundColor: mine ? C.raised : C.card,
          borderWidth: mine ? 0 : 1,
          borderColor: C.greenBorder,
        }}
      >
        {mine ? null : <Text style={{ fontFamily: FONT.bodySemi, fontSize: 13, color: C.green }}>BUILT support</Text>}
        <Text style={T.body}>{body}</Text>
        <Text style={[T.small, { color: C.muted }]}>{timeOf(at)}</Text>
      </View>
    </View>
  );
}

export default function ReportThread() {
  const { id, sent } = useLocalSearchParams<{ id: string; sent?: string }>();
  const { userId } = useAuth();
  const [report, setReport] = useState<ProblemReportWithThread | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getReport(userId, id);
      setReport(r);
      if (r.unread) markReportRead(userId, id).catch(() => {});
      if (r.screenshot_path) reportScreenshotUrl(r.screenshot_path).then(setShotUrl).catch(() => setShotUrl(null));
    } catch (e) {
      setError(asApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, [userId, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    if (!userId || !id || !reply.trim()) return;
    setSending(true);
    setSendErr(null);
    try {
      const m: ReportMessage = await replyToReport(userId, id, reply);
      setReport((r) => (r ? { ...r, messages: [...r.messages, m] } : r));
      setReply('');
    } catch (e) {
      setSendErr(asApiError(e).message);
    } finally {
      setSending(false);
    }
  }

  const footer = report ? (
    <View style={{ gap: 8 }}>
      {sendErr ? <Notice tone="error">{sendErr}</Notice> : null}
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field value={reply} onChangeText={setReply} placeholder="Write a reply" accessibilityLabel="Your reply" multiline style={{ maxHeight: 120 }} />
        </View>
        <Button compact label={sending ? 'Sending' : 'Send'} onPress={send} busy={sending} disabled={!reply.trim()} style={{ minHeight: 48 }} />
      </View>
    </View>
  ) : null;

  return (
    <SubScreen title={report ? categoryLabel(report.category) : 'Report'} footer={footer} onBack={() => goBack('/report')}>
      {sent ? <Notice tone="success">Report sent. We'll reply here, and you'll get a notification when we do.</Notice> : null}
      {loading && !report ? (
        <Loading label="Loading your report" />
      ) : error && !report ? (
        <ErrorState message={error} onRetry={load} retrying={loading} />
      ) : report ? (
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <StatusPill status={report.status} />
            <Text style={T.small}>Sent {timeOf(report.created_at)}</Text>
          </View>
          <Bubble author="user" body={report.message} at={report.created_at} />
          {shotUrl ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Image source={{ uri: shotUrl }} style={{ width: 120, height: 200, borderRadius: R.input, backgroundColor: C.card }} resizeMode="cover" accessibilityLabel="Your screenshot" />
            </View>
          ) : null}
          {report.messages.map((m) => (
            <Bubble key={m.id} author={m.author} body={m.body} at={m.created_at} />
          ))}
          {report.messages.every((m) => m.author !== 'admin') ? (
            <Text style={[T.meta, { textAlign: 'center' }]}>No reply yet. You'll get a notification when support replies.</Text>
          ) : null}
        </View>
      ) : null}
    </SubScreen>
  );
}
