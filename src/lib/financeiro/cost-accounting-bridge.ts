import { Decimal } from "@/db/decimal";
import type { DatabaseTransaction } from "@/db/transaction";
import type { AccountingTransactionRecord } from "@/lib/contracts/finance-accounting";
import { findCostPolicy, findCostSourceByOrigin } from "@/db/repositories/finance/cost-ledger";
import { hasCostCenterScope, listCostSourcesByEvidence, readCostPayrollRun, readCostPayrollStatement, readCostRightEntry, readCostUnitSecretariat } from "@/db/repositories/finance/cost-origins";
import { recordMunicipalCostSource, cancelMunicipalCostSource } from "./cost-ledger";
import type { CostActor } from "./cost-types";
import { z } from "zod";
import { splitPayrollProvisionCosts } from "./cost-payroll-slices";

export async function recordAccountingMunicipalCosts(tx: DatabaseTransaction, actor: CostActor, transaction: AccountingTransactionRecord, lines: Array<{ accountId: string; type: string; value: Decimal | string | number }>, accounts: Array<{ id: string; code: string }>) {
  if (transaction.reversalOfId) {
    for (const type of ["MANUAL_VPD", "ADVANCE_ACCOUNTABILITY", "PAYROLL"] as const) await cancelMunicipalCostSource(tx, actor, type, transaction.reversalOfId);
    const slices = await listCostSourcesByEvidence(tx, ["PAYROLL"], "transactionId", transaction.reversalOfId);
    for (const slice of slices) await cancelMunicipalCostSource(tx, actor, "PAYROLL", slice.sourceId);
    return;
  }
  const sourceType = transaction.sourceModule === "MANUAL" ? "MANUAL_VPD" : transaction.sourceModule === "RH" && transaction.sourceType === "ADVANCE_CONTROL" && transaction.eventType === "ADVANCE_APPROVED" ? "ADVANCE_ACCOUNTABILITY" : transaction.sourceModule === "RH" && transaction.sourceType === "HR_PROVISION" ? "PAYROLL" : null;
  if (!sourceType || !transaction.budgetUnitId || !transaction.governmentEntityId) return;
  const vpd = lines.filter(line => accounts.some(account => account.id === line.accountId && /^3(?:\.|\d)/.test(account.code)));
  const amount = vpd.reduce((sum, line) => sum.plus(new Decimal(line.value).mul(line.type === "Débito" ? 1 : -1)), new Decimal(0)).toDecimalPlaces(2);
  if (amount.lte(0)) return;
  const provision = sourceType === "PAYROLL" && transaction.sourceId ? await readCostRightEntry(tx, transaction.sourceId) : null;
  if (provision) {
    const policy = await findCostPolicy(tx, transaction.governmentEntityId, transaction.date);
    if (!policy?.enabled || !Array.isArray(policy.sourceTypes) || !policy.sourceTypes.includes("PAYROLL")) return;
    const reference = z.object({ statementId: z.string(), runId: z.string() }).parse(provision.details);
    const statement = await readCostPayrollStatement(tx, reference.statementId);
    const run = await readCostPayrollRun(tx, reference.runId);
    if (statement.contractId !== provision.contractId || statement.runId !== reference.runId || run.mode !== "OFICIAL" || run.scope !== "PRODUCAO" || run.status !== "FECHADA") throw new Error("Provisão sem identidade conciliada à memória oficial fechada da folha.");
    const slices = splitPayrollProvisionCosts(statement, provision.details, provision.kind);
    if (!provision.amount.equals(amount) || !slices.reduce((sum, slice) => sum.plus(slice.amount), new Decimal(0)).equals(amount)) throw new Error("Custo provisionado não reconcilia com a VPD contábil reconhecida.");
    const legacy = await findCostSourceByOrigin(tx, "PAYROLL", transaction.id);
    if (legacy) throw new Error("Reconhecimento já possui custo agregado; concilie a origem preservada antes de detalhar.");
    const secretariatId = await readCostUnitSecretariat(tx, transaction.budgetUnitId);
    for (const centerId of new Set(slices.map(slice => slice.dimensions.costCenterId).filter(Boolean))) {
      if (!await hasCostCenterScope(tx, centerId, transaction.governmentEntityId, secretariatId)) throw new Error("Centro histórico da provisão não está conciliado ao ente/secretaria da UG.");
    }
    for (const slice of slices) await recordMunicipalCostSource(tx, actor, { financialYearId: transaction.financialYearId, budgetUnitId: transaction.budgetUnitId, sourceType: "PAYROLL", sourceId: `PAYROLL_PROVISION:${transaction.id}:${slice.key}`, expenseDate: transaction.date, amount: slice.amount, dimensions: slice.dimensions, evidence: { ...slice.evidence, transactionId: transaction.id, originType: transaction.sourceType, originId: transaction.sourceId, frozenStatement: reference } });
    return;
  }
  await recordMunicipalCostSource(tx, actor, { financialYearId: transaction.financialYearId, budgetUnitId: transaction.budgetUnitId, sourceType, sourceId: transaction.id, expenseDate: transaction.date, amount, dimensions: {}, evidence: { transactionId: transaction.id, originType: transaction.sourceType, originId: transaction.sourceId, vpdLines: vpd.map(line => ({ accountId: line.accountId, type: line.type, value: new Decimal(line.value).toFixed(2) })) } });
}
