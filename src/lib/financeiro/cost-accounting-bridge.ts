import { Prisma, type AccountingTransaction } from "@prisma/client";
import { recordMunicipalCostSource, cancelMunicipalCostSource } from "./cost-ledger";
import type { CostActor } from "./cost-types";
import { z } from "zod";
import { splitPayrollProvisionCosts } from "./cost-payroll-slices";

export async function recordAccountingMunicipalCosts(tx: Prisma.TransactionClient, actor: CostActor, transaction: AccountingTransaction, lines: Array<{ accountId: string; type: string; value: Prisma.Decimal | string | number }>, accounts: Array<{ id: string; code: string }>) {
  if (transaction.reversalOfId) {
    for (const type of ["MANUAL_VPD", "ADVANCE_ACCOUNTABILITY", "PAYROLL"] as const) await cancelMunicipalCostSource(tx, actor, type, transaction.reversalOfId);
    const slices = await tx.municipalCostSource.findMany({ where: { sourceType: "PAYROLL", snapshot: { path: ["evidence", "transactionId"], equals: transaction.reversalOfId } }, orderBy: { id: "asc" } });
    for (const slice of slices) await cancelMunicipalCostSource(tx, actor, "PAYROLL", slice.sourceId);
    return;
  }
  const sourceType = transaction.sourceModule === "MANUAL" ? "MANUAL_VPD" : transaction.sourceModule === "RH" && transaction.sourceType === "ADVANCE_CONTROL" && transaction.eventType === "ADVANCE_APPROVED" ? "ADVANCE_ACCOUNTABILITY" : transaction.sourceModule === "RH" && transaction.sourceType === "HR_PROVISION" ? "PAYROLL" : null;
  if (!sourceType || !transaction.budgetUnitId || !transaction.governmentEntityId) return;
  const vpd = lines.filter(line => accounts.some(account => account.id === line.accountId && /^3(?:\.|\d)/.test(account.code)));
  const amount = vpd.reduce((sum, line) => sum.plus(new Prisma.Decimal(line.value).mul(line.type === "Débito" ? 1 : -1)), new Prisma.Decimal(0)).toDecimalPlaces(2);
  if (amount.lte(0)) return;
  const provision = sourceType === "PAYROLL" && transaction.sourceId ? await tx.hrRightEntry.findUniqueOrThrow({ where: { id: transaction.sourceId } }) : null;
  if (provision) {
    const policy = await tx.municipalCostPolicy.findFirst({ where: { governmentEntityId: transaction.governmentEntityId, effectiveFrom: { lte: transaction.date } }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }] });
    if (!policy?.enabled || !Array.isArray(policy.sourceTypes) || !policy.sourceTypes.includes("PAYROLL")) return;
    const reference = z.object({ statementId: z.string(), runId: z.string() }).parse(provision.details);
    const statement = await tx.hrPayrollStatement.findUniqueOrThrow({ where: { id: reference.statementId } });
    const run = await tx.hrPayrollRun.findUniqueOrThrow({ where: { id: reference.runId } });
    if (statement.contractId !== provision.contractId || statement.runId !== reference.runId || run.mode !== "OFICIAL" || run.scope !== "PRODUCAO" || run.status !== "FECHADA") throw new Error("Provisão sem identidade conciliada à memória oficial fechada da folha.");
    const slices = splitPayrollProvisionCosts(statement, provision.details, provision.kind);
    if (!provision.amount.equals(amount) || !slices.reduce((sum, slice) => sum.plus(slice.amount), new Prisma.Decimal(0)).equals(amount)) throw new Error("Custo provisionado não reconcilia com a VPD contábil reconhecida.");
    const legacy = await tx.municipalCostSource.findUnique({ where: { sourceType_sourceId: { sourceType: "PAYROLL", sourceId: transaction.id } } });
    if (legacy) throw new Error("Reconhecimento já possui custo agregado; concilie a origem preservada antes de detalhar.");
    const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: transaction.budgetUnitId }, select: { secretariatId: true } });
    for (const centerId of new Set(slices.map(slice => slice.dimensions.costCenterId).filter(Boolean))) {
      if (!await tx.costCenter.count({ where: { id: centerId, governmentEntityId: transaction.governmentEntityId, secretariatId: unit.secretariatId } })) throw new Error("Centro histórico da provisão não está conciliado ao ente/secretaria da UG.");
    }
    for (const slice of slices) await recordMunicipalCostSource(tx, actor, { financialYearId: transaction.financialYearId, budgetUnitId: transaction.budgetUnitId, sourceType: "PAYROLL", sourceId: `PAYROLL_PROVISION:${transaction.id}:${slice.key}`, expenseDate: transaction.date, amount: slice.amount, dimensions: slice.dimensions, evidence: { ...slice.evidence, transactionId: transaction.id, originType: transaction.sourceType, originId: transaction.sourceId, frozenStatement: reference } });
    return;
  }
  await recordMunicipalCostSource(tx, actor, { financialYearId: transaction.financialYearId, budgetUnitId: transaction.budgetUnitId, sourceType, sourceId: transaction.id, expenseDate: transaction.date, amount, dimensions: {}, evidence: { transactionId: transaction.id, originType: transaction.sourceType, originId: transaction.sourceId, vpdLines: vpd.map(line => ({ accountId: line.accountId, type: line.type, value: new Prisma.Decimal(line.value).toFixed(2) })) } });
}
