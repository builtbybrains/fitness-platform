// BUILT delete-account: deletes the signed-in person's account and data.
// Deploy: supabase functions deploy delete-account --project-ref <ref>
//
// POST { confirm: "DELETE" }
// → 200 { ok: true, removed: { photos: number, screenshots: number } }
//
// In this order, stopping at the first failure so a retry finishes the job
// (every step is safe to repeat):
//   1. every file under <user id>/ in the body-photos and
//      report-screenshots buckets;
//   2. their website contact messages (matched on their sign-in email,
//      case-insensitive);
//   3. the CRM copy of their name, email and phone on erp_customers
//      (the row stays for the business records, renamed "Deleted account");
//   4. the account itself. Every app table references auth.users with
//      on delete cascade, so their profile, logs, plans, photos rows,
//      check-ins, coach chat and memory, reports and push tokens go with it.
// Invoices and transactions keep pointing at the anonymised CRM row; they
// hold no name, email or phone of their own.
//
// Runs with the service role (storage and auth admin need it), for the
// person proven by their own token only. Logs counts, never personal data.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { body, fail, json, preflight, serverError } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/env.ts';

const BUCKETS = { photos: 'body-photos', screenshots: 'report-screenshots' } as const;
const PAGE = 1000;
const REMOVE_BATCH = 100;
const FAILED = "We couldn't finish deleting your account. Try again in a moment.";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail('method_not_allowed', 'Use POST.', 405);
  try {
    const auth = await requireUser(req, 'Sign in to delete your account.');
    if (auth instanceof Response) return auth;
    const { user } = auth;
    const b = await body(req);
    if (b.confirm !== 'DELETE') return fail('bad_request', 'Confirm that you want to delete your account.', 400);

    const admin = serviceClient();
    const uid = user.id;

    // 1. Storage. A failure here stops everything: the account must not go
    //    while its files are still stored.
    const removed = { photos: 0, screenshots: 0 };
    for (const key of ['photos', 'screenshots'] as const) {
      const r = await removeFolder(admin, BUCKETS[key], uid);
      if (r.error) {
        console.error(`[delete-account] ${BUCKETS[key]}: ${r.error}`);
        return fail('delete_failed', FAILED, 500);
      }
      removed[key] = r.count;
    }

    // 2. Contact messages sent from their email. `email` is plain text, so
    //    match case-insensitively: ilike finds candidates (its wildcards
    //    can only widen the match), the exact comparison picks the rows.
    const email = (user.email ?? '').trim().toLowerCase();
    let contacts = 0;
    if (email) {
      const { data, error } = await admin.from('contact_messages').select('id, email').ilike('email', email);
      if (error) {
        console.error(`[delete-account] contact_messages read: ${error.message}`);
        return fail('delete_failed', FAILED, 500);
      }
      const ids = (data ?? []).filter((r) => String(r.email).trim().toLowerCase() === email).map((r) => String(r.id));
      if (ids.length) {
        const del = await admin.from('contact_messages').delete().in('id', ids);
        if (del.error) {
          console.error(`[delete-account] contact_messages delete: ${del.error.message}`);
          return fail('delete_failed', FAILED, 500);
        }
      }
      contacts = ids.length;
    }

    // 3. The CRM row keeps the business history but loses the personal
    //    details. It must happen before step 4, which clears its user_id.
    const crm = await admin.from('erp_customers').update({ name: 'Deleted account', email: '', phone: '' }).eq('user_id', uid).select('id');
    if (crm.error) {
      console.error(`[delete-account] erp_customers: ${crm.error.message}`);
      return fail('delete_failed', FAILED, 500);
    }

    // 4. The account, and with it every row that cascades from it.
    const del = await admin.auth.admin.deleteUser(uid);
    if (del.error) {
      console.error(`[delete-account] deleteUser: ${del.error.message}`);
      return fail('delete_failed', FAILED, 500);
    }

    console.log(`[delete-account] done: photos=${removed.photos} screenshots=${removed.screenshots} contact_messages=${contacts} crm_rows=${crm.data?.length ?? 0}`);
    return json({ ok: true, removed });
  } catch (e) {
    return serverError('delete-account', e);
  }
});

/** Every file under `root`/ in `bucket`, removed in batches. list() is not
    recursive, so folders (entries without an id) are walked one by one,
    PAGE entries at a time. */
async function removeFolder(admin: SupabaseClient, bucket: string, root: string): Promise<{ count: number; error: string | null }> {
  const storage = admin.storage.from(bucket);
  const files: string[] = [];
  const folders = [root];
  while (folders.length) {
    const dir = folders.pop()!;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await storage.list(dir, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) return { count: 0, error: `list: ${error.message}` };
      for (const entry of data ?? []) {
        const path = `${dir}/${entry.name}`;
        if (entry.id === null) folders.push(path);
        else files.push(path);
      }
      if (!data || data.length < PAGE) break;
    }
  }
  let count = 0;
  for (let i = 0; i < files.length; i += REMOVE_BATCH) {
    const batch = files.slice(i, i + REMOVE_BATCH);
    const { data, error } = await storage.remove(batch);
    if (error) return { count, error: `remove: ${error.message}` };
    count += Array.isArray(data) ? data.length : batch.length;
  }
  return { count, error: null };
}
