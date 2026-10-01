/* Outbox: writes a signed-in person made while the server was unreachable.

   Every cloud write in the data layer goes through `writeThrough(userId,
   key, entry)`. The key names the row (for example `plan_days:2026-09-29`),
   and writes under one key run strictly in order (see ./serial.ts), so:
   - success removes any older queued entry for that key;
   - failure stores this entry, replacing any older one for that key.
   `flushOutbox(userId)` retries whatever is queued. Each entry carries the
   full intended row (upserts) or a match (deletes), so replaying is safe.

   Only ever used for accounts (UUID ids). Device-only identities stay on
   the device. */

import { supabase } from './supabase';
import { loadLocal, saveLocal } from './localFallback';
import { runSerial } from './serial';

export type OutboxEntry =
  | { op: 'upsert'; table: string; row: Record<string, unknown>; onConflict: string }
  | { op: 'delete'; table: string; match: Record<string, string> };

type Box = Record<string, OutboxEntry>;

const boxes = new Map<string, Box>();
const loading = new Map<string, Promise<Box>>();

async function box(userId: string): Promise<Box> {
  const have = boxes.get(userId);
  if (have) return have;
  let p = loading.get(userId);
  if (!p) {
    p = loadLocal<Box>(userId, 'outbox').then((b) => {
      const loaded = b && typeof b === 'object' ? b : {};
      boxes.set(userId, loaded);
      loading.delete(userId);
      return loaded;
    });
    loading.set(userId, p);
  }
  return p;
}

function persist(userId: string) {
  void saveLocal(userId, 'outbox', boxes.get(userId) ?? {});
}

/** Postgres rejected the row itself (constraint, permission). Retrying will
    never succeed, so the entry is dropped instead of queued forever. */
function isPermanent(error: { code?: string } | null): boolean {
  return !!error?.code && /^[0-9A-Z]{5}$/.test(error.code);
}

async function perform(entry: OutboxEntry): Promise<'ok' | 'retry' | 'drop'> {
  try {
    const { error } =
      entry.op === 'upsert'
        ? await supabase.from(entry.table).upsert(entry.row, { onConflict: entry.onConflict })
        : await supabase.from(entry.table).delete().match(entry.match);
    if (!error) return 'ok';
    return isPermanent(error) ? 'drop' : 'retry';
  } catch {
    return 'retry';
  }
}

/** Send one write now; queue it when the server can't be reached.
    Resolves true when the row reached the server. */
export function writeThrough(userId: string, key: string, entry: OutboxEntry): Promise<boolean> {
  return runSerial(`outbox:${userId}:${key}`, async () => {
    const b = await box(userId);
    const result = await perform(entry);
    if (result === 'retry') b[key] = entry;
    else delete b[key];
    persist(userId);
    return result === 'ok';
  });
}

const flushing = new Map<string, Promise<void>>();

/** Retry everything queued for this user. One flush at a time per user. */
export function flushOutbox(userId: string): Promise<void> {
  const running = flushing.get(userId);
  if (running) return running;
  const run = (async () => {
    const b = await box(userId);
    for (const key of Object.keys(b)) {
      await runSerial(`outbox:${userId}:${key}`, async () => {
        const entry = b[key];
        if (!entry) return; // a newer direct write already landed
        const result = await perform(entry);
        if (result !== 'retry' && b[key] === entry) delete b[key];
      });
    }
    persist(userId);
  })().finally(() => flushing.delete(userId));
  flushing.set(userId, run);
  return run;
}

/** Queued entries whose key starts with `prefix` (e.g. "plan_days:"), so a
    fresh server read can be overlaid with writes that haven't landed yet. */
export async function pendingEntries(userId: string, prefix: string): Promise<[string, OutboxEntry][]> {
  const b = await box(userId);
  return Object.entries(b).filter(([k]) => k.startsWith(prefix));
}

export async function pendingCount(userId: string): Promise<number> {
  return Object.keys(await box(userId)).length;
}
