/* Shared pieces for "Report a problem": labels and the status pill. */

import { Text, View } from 'react-native';

import { C, FONT, R } from '../../design';
import type { ReportCategory, ReportStatus } from '../../types';

export const REPORT_CATEGORIES: { id: ReportCategory; label: string }[] = [
  { id: 'bug', label: 'Something broke' },
  { id: 'plan', label: 'My plan' },
  { id: 'food', label: 'Food' },
  { id: 'account', label: 'My account' },
  { id: 'other', label: 'Other' },
];

export const categoryLabel = (c: ReportCategory) => REPORT_CATEGORIES.find((x) => x.id === c)?.label ?? 'Other';

const STATUS: Record<ReportStatus, { label: string; fg: string; bg: string; border: string }> = {
  new: { label: 'Sent', fg: C.stone, bg: 'transparent', border: C.lineStrong },
  in_progress: { label: 'In progress', fg: C.warn, bg: 'rgba(255,197,61,0.10)', border: 'rgba(255,197,61,0.35)' },
  fixed: { label: 'Fixed', fg: C.green, bg: C.greenTint, border: C.greenBorder },
};

export function StatusPill({ status }: { status: ReportStatus }) {
  const s = STATUS[status] ?? STATUS.new;
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill, backgroundColor: s.bg, borderWidth: 1, borderColor: s.border, alignSelf: 'flex-start' }}>
      <Text style={{ fontFamily: FONT.bodySemi, fontSize: 12, color: s.fg }}>{s.label}</Text>
    </View>
  );
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function timeOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
