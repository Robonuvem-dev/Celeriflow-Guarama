import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { resolveTaxWorkerActor } from "@/lib/tributacao/tax-worker-actor";
import { expireProvisionalEconomicRegistrations } from "@/lib/tributacao/economic-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.TAX_ECONOMIC_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: "Chave do agendamento econômico não configurada." }, { status: 503 });
  const supplied = Buffer.from(request.headers.get("authorization") ?? ""); const expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const actor = await resolveTaxWorkerActor(prisma, process.env.TAX_ECONOMIC_ACTOR_USER_ID || process.env.TAX_ANNUAL_ACTOR_USER_ID);
    const units = await prisma.planningEntityUnit.findMany({ where: { budgetUnitId: { in: actor.allowedBudgetUnitIds } }, select: { governmentEntityId: true, budgetUnitId: true } });
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TAX_ECONOMIC_TIME_ZONE || "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const results = [];
    for (const unit of units) { try { results.push({ ...unit, ...(await expireProvisionalEconomicRegistrations(prisma, actor, { ...unit, date })) }); } catch { results.push({ ...unit, error: "EXPIRY_SCOPE_OR_CONFIGURATION" }); } }
    return Response.json({ date, results }, { status: results.some(result => "error" in result) ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Verifique ator tributário, UGs, módulo e fuso do agendamento." }, { status: 503 }); }
}
