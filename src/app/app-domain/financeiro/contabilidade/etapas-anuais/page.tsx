import type { JsonObject, JsonValue } from "@/db/json";
import { db } from "@/db/client";
import { listFinancePageAccounts, listFinancePageUnits, listFinancePageYears } from "@/db/repositories/finance-pages/catalog";
import { readFinanceAnnualStages } from "@/db/repositories/finance-pages/accounting";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import AnnualStagesClient from "./AnnualStagesClient";
import AnnualEstimativeClient from "./AnnualEstimativeClient";
import ExtraNoteTransportClient from "./ExtraNoteTransportClient";
import PaymentProgramTransportClient from "./PaymentProgramTransportClient";

export const dynamic = "force-dynamic";
const object = (value: JsonValue | undefined): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export default async function AnnualStagesPage() {
  const { database, user } = await getTenantContextForModule("FINANCEIRO");
  const executor = database ?? db;
  const units = await listFinancePageUnits(executor, { allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds });
  const entityIds = [...new Set(units.map(unit => unit.governmentEntityId))];
  const years = await listFinancePageYears(executor, {}, entityIds);
  const [accounts, { editions, registrationStages, estimativeStages, extraStages, extraUndone, extraNotes, programStages, programUndone, programs }] = await Promise.all([
    listFinancePageAccounts(executor, "Passivo"),
    readFinanceAnnualStages(executor, entityIds, years.map(year => year.id)),
  ]);
  // Editions contain all units of an entity; restrict their memory to operators with full entity access.
  const allUnits = await listFinancePageUnits(executor, {}, entityIds);
  const fullEntities = new Set(entityIds.filter(id => isSystemAdministrator(user) || allUnits.filter(unit => unit.governmentEntityId === id).every(unit => user.allowedBudgetUnitIds.includes(unit.budgetUnitId))));
  const authorizedYears = years.filter(year => fullEntities.has(year.governmentEntityId!)).map(year => ({ id: year.id, year: year.year, status: year.status, governmentEntityId: year.governmentEntityId!, entityName: year.governmentEntity?.name ?? "" }));
  return <><PaymentProgramTransportClient years={authorizedYears} programs={programs.filter(program => program.status === "Emitida" && authorizedYears.some(year => year.id === (program.executionFinancialYearId ?? program.commitment.appropriation.financialYearId))).map(program => ({ id: program.id, orderNumber: program.orderNumber, financialYearId: program.executionFinancialYearId ?? program.commitment.appropriation.financialYearId, value: program.valueDecimal?.toFixed(2) ?? "Não conciliado", bankStatus: program.bankStatus }))} stages={programStages.flatMap(stage => {
    const year = authorizedYears.find(year => year.id === stage.financialYearId);
    if (!year) return [];
    const payload = object(stage.payload);
    const copies = Array.isArray(payload.copies) ? payload.copies.map(value => { const copy = object(value); const payment = programs.find(row => row.id === copy.targetPaymentId); return { sourcePaymentId: String(copy.sourcePaymentId), targetPaymentId: String(copy.targetPaymentId), paymentOrderExternalId: String(copy.paymentOrderExternalId ?? ""), netValue: String(copy.netValue), bankStatus: payment?.bankStatus ?? null, status: payment?.status ?? "Não encontrado" }; }) : [];
    return [{ id: stage.id, year: year.year, reason: String(payload.reason ?? ""), undone: programUndone.some(row => row.entityId === stage.id), copies }];
  })} /><ExtraNoteTransportClient years={authorizedYears} stages={extraStages.flatMap(stage => {
    const year = authorizedYears.find(year => year.id === stage.financialYearId);
    if (!year) return [];
    const payload = object(stage.payload);
    const noteIds = Array.isArray(payload.noteIds) ? payload.noteIds : [];
    return [{ id: stage.id, year: year.year, reason: String(payload.reason ?? ""), total: String(payload.total ?? "0.00"), undone: extraUndone.some(row => row.entityId === stage.id), notes: extraNotes.filter(note => noteIds.includes(note.id)).map(note => { const data = object(note.payload); return { id: note.id, title: String(data.title), value: String(data.value), sourceId: String(data.sourceId), resourceSourceId: String(data.resourceSourceId), budgetUnitId: String(data.budgetUnitId) }; }) }];
  })} /><div className="p-3"><AnnualEstimativeClient years={authorizedYears} stages={estimativeStages.flatMap(stage => {
    const year = authorizedYears.find(year => year.id === stage.financialYearId);
    if (!year) return [];
    const payload = object(stage.payload);
    return [{ id: stage.id, year: year.year, operation: String(payload.operation), reason: String(payload.reason ?? ""), createdAt: stage.createdAt.toISOString(), summary: JSON.stringify(payload.summary ?? {}, null, 2) }];
  })} /></div><AnnualStagesClient accounts={accounts} registrationStages={registrationStages.flatMap(stage => {
    const year = years.find(year => year.id === stage.financialYearId);
    if (!year || !fullEntities.has(year.governmentEntityId!)) return [];
    const payload = object(stage.payload);
    return [{ id: stage.id, year: year.year, operation: String(payload.operation), reason: String(payload.reason ?? ""), createdAt: stage.createdAt.toISOString(), summary: JSON.stringify(payload.summary ?? {}, null, 2) }];
  })} years={years.filter(year => fullEntities.has(year.governmentEntityId!)).map(year => ({ id: year.id, year: year.year, status: year.status, governmentEntityId: year.governmentEntityId!, entityName: year.governmentEntity?.name ?? "" }))} editions={editions.filter(edition => fullEntities.has(String(object(edition.payload).governmentEntityId))).map(edition => {
    const payload = object(edition.payload);
    const cashBalances = Array.isArray(payload.cashBalances) ? payload.cashBalances.flatMap(value => { const row = object(value); return typeof row.bankAccountId === "string" && typeof row.resourceSourceId === "string" && typeof row.cash === "string" ? [{ bankAccountId: row.bankAccountId, resourceSourceId: row.resourceSourceId, cash: row.cash }] : []; }) : [];
    const financial = object(payload.financialPosition);
    const financialPosition = payload.financialPosition ? { status: String(financial.status), unresolvedCount: Array.isArray(financial.unclassifiedEntryIds) ? financial.unclassifiedEntryIds.length : 0, rows: Array.isArray(financial.rows) ? financial.rows.flatMap(value => { const row = object(value); return typeof row.budgetUnitId === "string" && typeof row.resourceSourceId === "string" && typeof row.financialAssets === "string" && typeof row.financialLiabilities === "string" && typeof row.deficitSurplus === "string" ? [{ budgetUnitId: row.budgetUnitId, resourceSourceId: row.resourceSourceId, financialAssets: row.financialAssets, financialLiabilities: row.financialLiabilities, deficitSurplus: row.deficitSurplus }] : []; }) : [] } : null;
    return { id: edition.id, year: years.find(year => year.id === edition.financialYearId)?.year ?? 0, stage: String(payload.stage), createdAt: edition.createdAt.toISOString(), provisional: payload.provisional === true, reason: String(payload.reason ?? ""), predecessorEditionId: typeof payload.predecessorEditionId === "string" ? payload.predecessorEditionId : null, cashBalances, financialPosition };
  })} /></>;
}
