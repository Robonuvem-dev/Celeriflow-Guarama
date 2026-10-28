import { eq, lt } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { transparencyPageFeedback } from "@/db/schema/transparency";
import { z } from "zod";

export const pageFeedbackSchema = z.object({
  submissionKey: z.uuid(), page: z.enum(["HOME", "SEARCH", "CONSULTATION"]),
  collectionSlug: z.string().regex(/^[a-z0-9-]{2,100}$/).optional(),
  rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000).default(""),
  website: z.literal("").default(""),
}).strict().refine(value => value.page === "CONSULTATION" ? Boolean(value.collectionSlug) : !value.collectionSlug, "Contexto de avaliação inválido.");

export const pageFeedbackRetentionDays = 365;

export async function recordPageFeedback(db: DatabaseExecutor, input: z.infer<typeof pageFeedbackSchema>) {
  const parsed = pageFeedbackSchema.parse(input);
  const data = { submissionKey: parsed.submissionKey, page: parsed.page, collectionSlug: parsed.collectionSlug, rating: parsed.rating, comment: parsed.comment };
  const [created] = await db.insert(transparencyPageFeedback).values(data).onConflictDoNothing({ target: transparencyPageFeedback.submissionKey }).returning({ id: transparencyPageFeedback.id });
  if (!created) {
    const [previous] = await db.select().from(transparencyPageFeedback).where(eq(transparencyPageFeedback.submissionKey, data.submissionKey)).limit(1);
    if (!previous || previous.page !== data.page || previous.collectionSlug !== (data.collectionSlug || null) || previous.rating !== data.rating || previous.comment !== data.comment) throw new Error("Esta avaliação já foi enviada com outro conteúdo.");
  }
  await db.delete(transparencyPageFeedback).where(lt(transparencyPageFeedback.createdAt, new Date(Date.now() - pageFeedbackRetentionDays * 86400000)));
}
