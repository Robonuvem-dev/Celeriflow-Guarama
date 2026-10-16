import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { processTaxAnnualCron } from "@/lib/tributacao/annual-batch-cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.TAX_ANNUAL_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: "Chave do agendamento tributário não configurada." }, { status: 503 });
  const supplied = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const result = await processTaxAnnualCron(prisma, process.env.TAX_ANNUAL_ACTOR_USER_ID);
    const failed = result.results.some(batch => batch.failures.length);
    return Response.json({ status: failed ? "ATTENTION" : "PROCESSED", ...result }, { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Verifique o ator tributário, suas UGs e a configuração do módulo." }, { status: 503 }); }
}
