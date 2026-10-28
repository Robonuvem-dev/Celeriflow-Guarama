import { timingSafeEqual } from "node:crypto";
import { db } from "@/db/client";
import { lt } from "drizzle-orm";
import { transparencyAccesses, transparencyPageFeedback } from "@/db/schema/transparency";
import { pageFeedbackRetentionDays } from "@/lib/transparencia/page-feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Chave técnica não configurada." }, { status: 503 });
  const supplied = Buffer.from(request.headers.get("authorization") || ""), expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  const feedback = await db.delete(transparencyPageFeedback).where(lt(transparencyPageFeedback.createdAt, new Date(Date.now() - pageFeedbackRetentionDays * 86400000))).returning({ id: transparencyPageFeedback.id });
  const accesses = await db.delete(transparencyAccesses).where(lt(transparencyAccesses.createdAt, new Date(Date.now() - 90 * 86400000))).returning({ id: transparencyAccesses.id });
  return Response.json({ removedFeedback: feedback.length, removedAccesses: accesses.length }, { headers: { "Cache-Control": "no-store" } });
}
