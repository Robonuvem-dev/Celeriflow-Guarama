import { eq } from "drizzle-orm";
import { processes } from "@/db/schema/processes";

/** Keep subject filtering on the authoritative process, not the service snapshot. */
export function serviceQueueSubjectCondition(subjectId: string) {
  return subjectId ? eq(processes.subjectId, subjectId) : undefined;
}
