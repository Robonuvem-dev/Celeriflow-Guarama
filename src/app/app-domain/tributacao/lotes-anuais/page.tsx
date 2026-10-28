import Link from "next/link";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { AnnualBatchesClient } from "./AnnualBatchesClient";
import { db } from "@/db/client";
import { readAnnualBatchPage } from "@/db/repositories/taxation-pages/annual-batches";

export default async function TaxAnnualBatchesPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context;
  const query = await searchParams;
  const page = Math.max(1, Math.min(100000, Number(query.page) || 1));
  if (!Number.isSafeInteger(page)) return <p className="p-5">Página inválida.</p>;
  const units = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const { taxes, parameters, taxpayers, properties, registrations, batches, count } = await readAnnualBatchPage(context.database ?? db, user.id, units, query.q, page);
  return <section className="space-y-4 p-5"><h1 className="text-xl font-semibold">Simulação e efetivação anual tributária</h1><Link href="/tributacao/operacoes" className="underline">Voltar às operações tributárias</Link><form className="flex gap-2"><input name="q" defaultValue={query.q} className="rounded border p-2" aria-label="Buscar cadastro por nome ou inscrição" placeholder="Nome / inscrição dos cadastros" /><button className="rounded border p-2">Buscar opções</button></form><p className="text-sm">Até 500 opções por tipo e busca. A base tributável é informada e fundamentada; não é inferida de valores legados. A regra vigente calcula principal, mínimos e calendário. Guias e acordos continuam nas rotinas fiscais nativas.</p><AnnualBatchesClient taxes={taxes} parameters={parameters.filter(parameter => taxes.some(tax => tax.id === parameter.taxId)).map(parameter => ({ ...parameter, name: `${parameter.name} — ${parameter.effectiveFrom.toISOString().slice(0, 10)}` }))} targets={[...taxpayers.map(row => ({ id: row.id, name: row.person?.fullName ?? row.company?.corporateName ?? row.id, type: "TAXPAYER" as const })), ...properties.map(row => ({ id: row.id, name: `Imóvel ${row.municipalInsc ?? row.id}`, type: "REAL_ESTATE" as const })), ...registrations.map(row => ({ id: row.id, name: `Inscrição ${row.municipalInsc}`, type: "ECONOMIC_REGISTRATION" as const }))]} batches={batches.map(batch => ({ id: batch.id, year: batch.year, status: batch.status, reason: batch.reason, scheduledAt: batch.scheduledAt?.toISOString() ?? null, items: batch.items.map(item => ({ id: item.id, targetId: item.targetId, status: item.status, base: item.taxableBase.toFixed(2), amount: item.simulatedAmount.toFixed(2), assessmentId: item.assessmentId, error: item.error })) }))} /><nav className="flex gap-3">{page > 1 && <Link href={`?page=${page - 1}`}>Anterior</Link>}<span>Página {page} · {count} lotes</span>{page * 20 < count && <Link href={`?page=${page + 1}`}>Próxima</Link>}</nav></section>;
}
