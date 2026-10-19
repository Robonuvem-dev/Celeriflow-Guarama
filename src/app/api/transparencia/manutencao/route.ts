import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { pageFeedbackRetentionDays } from "@/lib/transparencia/page-feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Chave técnica não configurada." }, { status: 503 });
  const supplied = Buffer.from(request.headers.get("authorization") || ""), expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  const feedback = await prisma.transparencyPageFeedback.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - pageFeedbackRetentionDays * 86400000) } } });
  const accesses = await prisma.transparencyAccess.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86400000) } } });
  return Response.json({ removedFeedback: feedback.count, removedAccesses: accesses.count }, { headers: { "Cache-Control": "no-store" } });
}
