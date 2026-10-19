import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

export const pageFeedbackSchema = z.object({
  submissionKey: z.uuid(), page: z.enum(["HOME", "SEARCH", "CONSULTATION"]),
  collectionSlug: z.string().regex(/^[a-z0-9-]{2,100}$/).optional(),
  rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000).default(""),
  website: z.literal("").default(""),
}).strict().refine(value => value.page === "CONSULTATION" ? Boolean(value.collectionSlug) : !value.collectionSlug, "Contexto de avaliação inválido.");

export const pageFeedbackRetentionDays = 365;

export async function recordPageFeedback(db: Pick<PrismaClient, "transparencyPageFeedback">, input: z.infer<typeof pageFeedbackSchema>) {
  const parsed = pageFeedbackSchema.parse(input);
  const data = { submissionKey: parsed.submissionKey, page: parsed.page, collectionSlug: parsed.collectionSlug, rating: parsed.rating, comment: parsed.comment };
  try {
    await db.transparencyPageFeedback.create({ data });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const previous = await db.transparencyPageFeedback.findUnique({ where: { submissionKey: data.submissionKey } });
    if (!previous || previous.page !== data.page || previous.collectionSlug !== (data.collectionSlug || null) || previous.rating !== data.rating || previous.comment !== data.comment) throw new Error("Esta avaliação já foi enviada com outro conteúdo.");
  }
  await db.transparencyPageFeedback.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - pageFeedbackRetentionDays * 86400000) } } });
}
