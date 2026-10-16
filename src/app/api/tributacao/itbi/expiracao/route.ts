import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { resolveTaxWorkerActor } from "@/lib/tributacao/tax-worker-actor";
import { cancelOverdueItbiProcesses, itbiExpiryPolicySchema } from "@/lib/tributacao/itbi-expiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.TAX_ITBI_CRON_SECRET || process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return Response.json({ error: "Chave do agendamento ITBI não configurada." }, { status: 503 });
  const supplied = Buffer.from(request.headers.get("authorization") ?? ""); const expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const actor = await resolveTaxWorkerActor(prisma, process.env.TAX_ITBI_ACTOR_USER_ID || process.env.TAX_ANNUAL_ACTOR_USER_ID);
    const entries = await prisma.taxRegistryEntry.findMany({ where: { entityType: "BUDGET_UNIT", entityId: { in: actor.allowedBudgetUnitIds }, category: "ITBI_EXPIRY_POLICY" }, orderBy: { version: "desc" } });
    const latest = new Map<string, typeof entries[number]>(); for (const row of entries) if (!latest.has(row.entityId)) latest.set(row.entityId, row);
    const results = [];
    for (const entry of latest.values()) { const policy = itbiExpiryPolicySchema.parse(entry.data); if (policy.active) results.push({ budgetUnitId: entry.entityId, ...await cancelOverdueItbiProcesses(prisma, actor, { governmentEntityId: policy.governmentEntityId, budgetUnitId: policy.budgetUnitId, expectedPolicyVersion: entry.version }) }); }
    return Response.json({ results }, { status: results.some(row => row.results.some(item => item.status === "ERRO_SEM_ALTERACAO")) ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Verifique ator, UGs, política e exercício contábil do agendamento ITBI." }, { status: 503 }); }
}
