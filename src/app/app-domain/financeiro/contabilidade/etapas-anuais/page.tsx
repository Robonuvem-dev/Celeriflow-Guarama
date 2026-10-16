import { Prisma } from "@prisma/client";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import AnnualStagesClient from "./AnnualStagesClient";
import AnnualEstimativeClient from "./AnnualEstimativeClient";
import ExtraNoteTransportClient from "./ExtraNoteTransportClient";
import PaymentProgramTransportClient from "./PaymentProgramTransportClient";

export const dynamic = "force-dynamic";
const object = (value: Prisma.JsonValue | undefined): Prisma.JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export default async function AnnualStagesPage() {
  const { prisma, user } = await getTenantContextForModule("FINANCEIRO");
  const units = await prisma.planningEntityUnit.findMany({ where: isSystemAdministrator(user) ? {} : { budgetUnitId: { in: user.allowedBudgetUnitIds } }, select: { governmentEntityId: true } });
  const entityIds = [...new Set(units.map(unit => unit.governmentEntityId))];
  const years = await prisma.financialYear.findMany({ where: { governmentEntityId: { in: entityIds } }, include: { governmentEntity: { select: { name: true } } }, orderBy: { year: "desc" } });
  const [accounts, editions, registrationStages, estimativeStages, extraStages, extraUndone, extraNotes, programStages, programUndone, programs] = await Promise.all([
    prisma.accountingPlan.findMany({ where: { type: "Passivo" }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.financialAuditLog.findMany({ where: { action: "ANNUAL_BALANCE_EDITION", entityType: "AnnualBalanceEdition", financialYearId: { in: years.map(year => year.id) } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.financialAuditLog.findMany({ where: { action: "ANNUAL_PAYABLE_STAGE_COMPLETE", entityType: "AnnualPayableRegistrationStage", financialYearId: { in: years.map(year => year.id) } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.financialAuditLog.findMany({ where: { action: "ANNUAL_ESTIMATIVE_COMPLETE", entityType: "AnnualEstimativeStage", financialYearId: { in: years.map(year => year.id) } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.financialAuditLog.findMany({ where: { action: "ANNUAL_EXTRA_TRANSPORT_COMPLETE", financialYearId: { in: years.map(year => year.id) } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.financialAuditLog.findMany({ where: { action: "ANNUAL_EXTRA_TRANSPORT_UNDONE", financialYearId: { in: years.map(year => year.id) } }, select: { entityId: true } }),
    prisma.financialAuditLog.findMany({ where: { action: "ANNUAL_EXTRA_NOTE_COPY", financialYearId: { in: years.map(year => year.id) } }, orderBy: { createdAt: "desc" } }),
    prisma.financialAuditLog.findMany({ where: { action: "ANNUAL_PAYMENT_PROGRAM_COMPLETE", financialYearId: { in: years.map(year => year.id) } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.financialAuditLog.findMany({ where: { action: "ANNUAL_PAYMENT_PROGRAM_UNDONE", financialYearId: { in: years.map(year => year.id) } }, select: { entityId: true } }),
    prisma.payment.findMany({ where: { commitment: { appropriation: { budgetUnit: { planningEntityUnit: { is: { governmentEntityId: { in: entityIds } } } } } } }, select: { id: true, orderNumber: true, status: true, bankStatus: true, valueDecimal: true, executionFinancialYearId: true, commitment: { select: { appropriation: { select: { financialYearId: true, budgetUnitId: true } } } } }, orderBy: { date: "desc" } }),
  ]);
  // Editions contain all units of an entity; restrict their memory to operators with full entity access.
  const allUnits = await prisma.planningEntityUnit.findMany({ where: { governmentEntityId: { in: entityIds } }, select: { governmentEntityId: true, budgetUnitId: true } });
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
