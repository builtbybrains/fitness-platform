/* Per-key serial queues. Work queued under the same key runs strictly one
   after another, in the order it was queued, so two rapid taps on the same
   day can never race each other to the database or the local mirror. */

const tails = new Map<string, Promise<unknown>>();

export function runSerial<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const run = prev.then(task, task);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}
