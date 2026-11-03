import type { runAutomaticRightsSchedule } from "./automatic-rights-scheduler";

type Batch = Awaited<ReturnType<typeof runAutomaticRightsSchedule>>;

/** Drain bounded batches once per daily invocation, never retrying a failed holder
 * in the same invocation. The persisted scheduler keeps overdue holders first. */
export async function drainAutomaticRightsBatches(runBatch: (excluded: readonly string[], deadline: number) => Promise<Batch>, deadline: number, clock = Date.now) {
  const attempted = new Set<string>();
  const results: Batch["results"] = [];
  let completed = false;
  while (clock() < deadline) {
    const batch = await runBatch([...attempted], deadline);
    if (!batch.results.length) {
      completed = clock() < deadline;
      break;
    }
    const fresh = batch.results.filter(row => !attempted.has(row.contractId));
    if (!fresh.length) break;
    for (const row of fresh) {
      attempted.add(row.contractId);
      results.push(row);
    }
  }
  return { results, completed };
}
