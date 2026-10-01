/* "Report a problem": the person sends a message, a category and an
   optional screenshot, sees their reports and the admin's replies (with a
   push when one arrives), and can reply. Statuses: new, in_progress,
   fixed (set by the admin). Needs an account. */

import { supabase } from '../lib/supabase';
import { newId } from '../lib/cloud';
import { base64Bytes, base64ToBytes, stripDataUri } from './base64';
import { requireAccount } from './client';
import { ApiError, fromDbError } from './errors';
import type { ProblemReport, ProblemReportWithThread, ReportInput, ReportMessage } from '../types';

const BUCKET = 'report-screenshots';
const REPORT_ACCOUNT = 'Reporting a problem needs an account so we can reply. Sign up free, or use the contact form on our website.';
const CATEGORIES = ['bug', 'plan', 'food', 'account', 'other'];

function withThread(r: ProblemReport, messages: ReportMessage[]): ProblemReportWithThread {
  const mine = messages.filter((m) => m.report_id === r.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const unread = mine.some((m) => m.author === 'admin' && (!r.user_last_read_at || m.created_at > r.user_last_read_at));
  return { ...r, messages: mine, unread };
}

/** Send a report (uploads the screenshot first when there is one). */
export async function createReport(userId: string, input: ReportInput): Promise<ProblemReportWithThread> {
  requireAccount(userId, REPORT_ACCOUNT);
  const message = input.message.trim();
  if (!message) throw new ApiError('bad_request', 'Tell us what happened first.', 400);
  if (!CATEGORIES.includes(input.category)) throw new ApiError('bad_request', 'Pick a category.', 400);
  const id = newId();
  let screenshotPath: string | null = null;
  if (input.screenshotBase64) {
    const b64 = stripDataUri(input.screenshotBase64);
    if (base64Bytes(b64) > 6 * 1024 * 1024) throw new ApiError('payload_too_large', 'That screenshot is too large.', 413);
    const mime = input.screenshotMime ?? 'image/jpeg';
    screenshotPath = `${userId}/${id}.${mime === 'image/png' ? 'png' : 'jpg'}`;
    const up = await supabase.storage.from(BUCKET).upload(screenshotPath, base64ToBytes(b64), { contentType: mime, upsert: false });
    if (up.error) throw new ApiError('server_error', "The screenshot couldn't be attached. Try again, or send the report without it.", 500);
  }
  const { data, error } = await supabase
    .from('problem_reports')
    .insert({
      id,
      user_id: userId,
      category: input.category,
      message: message.slice(0, 4000),
      screenshot_path: screenshotPath,
      platform: (input.platform ?? '').slice(0, 20),
      app_version: (input.appVersion ?? '').slice(0, 40),
    })
    .select('*')
    .single();
  if (error) throw fromDbError(error, "Your report couldn't be sent. Try again in a moment.");
  return withThread(data as ProblemReport, []);
}

/** The person's reports with their threads, newest activity first. */
export async function listMyReports(userId: string): Promise<ProblemReportWithThread[]> {
  requireAccount(userId, REPORT_ACCOUNT);
  const [reports, messages] = await Promise.all([
    supabase.from('problem_reports').select('*').eq('user_id', userId).order('last_message_at', { ascending: false }).limit(100),
    supabase.from('report_messages').select('id, report_id, author, body, created_at').eq('user_id', userId).order('created_at', { ascending: true }).limit(1000),
  ]);
  if (reports.error) throw fromDbError(reports.error, "Couldn't load your reports.");
  const all = (messages.data ?? []) as ReportMessage[];
  return ((reports.data ?? []) as ProblemReport[]).map((r) => withThread(r, all));
}

export async function getReport(userId: string, reportId: string): Promise<ProblemReportWithThread> {
  requireAccount(userId, REPORT_ACCOUNT);
  const [report, messages] = await Promise.all([
    supabase.from('problem_reports').select('*').eq('id', reportId).eq('user_id', userId).maybeSingle(),
    supabase.from('report_messages').select('id, report_id, author, body, created_at').eq('report_id', reportId).order('created_at', { ascending: true }),
  ]);
  if (report.error) throw fromDbError(report.error, "Couldn't load that report.");
  if (!report.data) throw new ApiError('not_found', 'That report was not found.', 404);
  return withThread(report.data as ProblemReport, (messages.data ?? []) as ReportMessage[]);
}

/** Add the person's reply to a report. */
export async function replyToReport(userId: string, reportId: string, body: string): Promise<ReportMessage> {
  requireAccount(userId, REPORT_ACCOUNT);
  const text = body.trim();
  if (!text) throw new ApiError('bad_request', 'Write a reply first.', 400);
  const { data, error } = await supabase
    .from('report_messages')
    .insert({ id: newId(), report_id: reportId, user_id: userId, body: text.slice(0, 4000) })
    .select('id, report_id, author, body, created_at')
    .single();
  if (error) throw fromDbError(error, "Your reply couldn't be sent. Try again.");
  return data as ReportMessage;
}

/** Mark a report's thread as read (clears its unread badge). */
export async function markReportRead(userId: string, reportId: string): Promise<void> {
  requireAccount(userId, REPORT_ACCOUNT);
  const { error } = await supabase.from('problem_reports').update({ user_last_read_at: new Date().toISOString() }).eq('id', reportId).eq('user_id', userId);
  if (error) throw fromDbError(error, "Couldn't update that report.");
}

/** A short-lived link to the person's own screenshot. */
export async function reportScreenshotUrl(path: string, expiresInSeconds = 600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) throw new ApiError('not_found', "That screenshot couldn't be opened.", 404);
  return data.signedUrl;
}

/** How many reports have an admin reply the person hasn't opened. */
export function unreadCount(reports: readonly ProblemReportWithThread[]): number {
  return reports.filter((r) => r.unread).length;
}
