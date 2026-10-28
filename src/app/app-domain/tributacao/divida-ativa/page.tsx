import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";
import { readVisibleDebtIds, readActiveDebtPage } from "@/db/repositories/taxation-pages/active-debt";
import { daBook, ensureS9Defaults, listEnrollmentCandidates, selectProtestCandidates } from "@/lib/tributacao/s9-service";
import DividaAtivaClient from "./DividaAtivaClient";
export const dynamic = "force-dynamic";
export default async function DividaAtivaPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db;
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const visibleDebtIds = allowed ? await readVisibleDebtIds(database, allowed) : [];
  await ensureS9Defaults(database, { usuarioId: user.id });
  const [taxpayers, candidates, { debts, portfolios, protestBatches, executionBatches, guides, budgetUnits, versions, suspensions, events }, protestCandidates] = await Promise.all([
    listPageTaxpayers(database, { active: true, order: "created-asc", limit: 200 }),
    listEnrollmentCandidates(database, allowed),
    readActiveDebtPage(database, allowed, visibleDebtIds),
    selectProtestCandidates(database, allowed),
  ]);
  const book = await daBook(database, undefined, allowed);
  const names = new Map(taxpayers.map((row) => [row.id, row.company?.corporateName ?? row.person?.fullName ?? row.id]));
  const nameOf = (id: string) => names.get(id) ?? id;
  return <DividaAtivaClient data={{
    budgetUnits,
    taxpayers: taxpayers.map((row) => ({ id: row.id, name: nameOf(row.id), document: row.company?.cnpj ?? row.person?.cpf ?? "" })),
    candidates,
    debts: debts.map((row) => ({
      id: row.id, cda: row.cdaNumber ?? "SEM CDA", origin: row.originDebtType, year: row.year, taxpayer: nameOf(row.taxpayerId),
      original: Number(row.originalValueDecimal ?? row.originalValue), updated: Number(row.updatedValueDecimal ?? row.updatedValue),
      status: row.status, assessmentId: row.assessmentId ?? null, sourceKey: row.sourceKey ?? null,
      versions: versions.filter((v) => v.activeDebtId === row.id).map((v) => ({ id: v.id, version: v.versionNumber, cda: v.cdaNumber, annotation: v.annotation ?? null, signature: v.signatureStatus, createdAt: v.createdAt.toISOString() })),
      suspensions: suspensions.filter((s) => s.activeDebtId === row.id).map((s) => ({ id: s.id, reason: s.reason, status: s.status })),
      events: events.filter((e) => e.activeDebtId === row.id).map((e) => `${e.eventType}: ${e.description}`).slice(0, 12),
    })),
    portfolios: portfolios.map((p) => ({ id: p.id, name: p.name, status: p.status, items: p.items.map((i) => ({ id: i.id, debtId: i.activeDebtId, outstanding: Number(i.outstandingDecimal) })) })),
    protestBatches: protestBatches.map((b) => ({ id: b.id, number: b.batchNumber, status: b.status, items: b.items.map((i) => ({ id: i.id, debtId: i.activeDebtId, status: i.status, returnCode: i.returnCode ?? null, returnMessage: i.returnMessage ?? null })) })),
    executionBatches: executionBatches.map((b) => ({ id: b.id, number: b.batchNumber, protocol: b.internalProtocol, status: b.status, prosecutor: b.prosecutor ?? null, cases: b.cases.map((c) => ({ id: c.id, protocol: c.internalProtocol, debtId: c.activeDebtId, status: c.status, prosecutor: c.prosecutor ?? null, mni: c.mniStatus, nextHearing: c.nextHearingAt?.toISOString() ?? null, events: c.events.map((e) => `${e.eventType}: ${e.description}`) })) })),
    guides: guides.map((g) => ({ id: g.id, number: g.guideNumber ?? g.id, debtId: g.assessment.activeDebt?.id ?? "", status: g.status, total: Number(g.totalValueDecimal ?? g.totalValue) })),
    protestCandidates,
    book: book.slice(0, 100),
  }} />;
}
