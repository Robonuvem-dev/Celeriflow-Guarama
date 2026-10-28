import { and, asc, count, gte, lt } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { transparencyPageFeedback } from "@/db/schema/transparency";

export async function readPageFeedbackRatings(db: DatabaseExecutor, from: Date, until: Date) {
  return db.select({ rating: transparencyPageFeedback.rating, _count: count() }).from(transparencyPageFeedback)
    .where(and(gte(transparencyPageFeedback.createdAt, from), lt(transparencyPageFeedback.createdAt, until)))
    .groupBy(transparencyPageFeedback.rating).orderBy(asc(transparencyPageFeedback.rating));
}
