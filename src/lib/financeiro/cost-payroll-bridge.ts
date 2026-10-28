import { Decimal } from "@/db/decimal";
import type { DatabaseTransaction } from "@/db/transaction";
import { findCostPolicy, findCostSourceByOrigin } from "@/db/repositories/finance/cost-ledger";
import { findCostPayrollIntegration, hasCostCenterScope, listCostPayrollStatements, readCostPayrollRun, readCostRightEntry, readCostSettlement, readCostUnitSecretariat } from "@/db/repositories/finance/cost-origins";
import { z } from "zod";
import { MunicipalCostError, recordMunicipalCostSource } from "./cost-ledger";
import { splitPayrollCostStatements, deductPayrollCostReleases } from "./cost-payroll-slices";
import type { CostActor } from "./cost-types";

const planSchema = z.object({ runId: z.string(), lines: z.array(z.object({ key: z.string(), costCenterId: z.string().nullable(), component: z.enum(["GROSS", "EMPLOYER"]), appropriationId: z.string(), supplierId: z.string(), secretariatId: z.string(), value: z.string() })) });
const resultSchema = z.object({ expenseIds: z.array(z.string()) });
const releasesSchema = z.array(z.object({ consumptionEntryId: z.string(), provisionEntryId: z.string(), amount: z.string(), transactionId: z.string() }));

export async function recordPayrollSettlementCosts(tx: DatabaseTransaction, actor: CostActor, input: { settlementId: string; netAmount: Decimal; releaseMemory: unknown; releaseEventId: string | null }) {
  const settlement = await readCostSettlement(tx, input.settlementId);
  const expense = settlement.commitment.reservation?.expense;
  const appropriation = settlement.commitment.appropriation;
  if (!appropriation.financialYear.governmentEntityId) return;
  const policy = await findCostPolicy(tx, appropriation.financialYear.governmentEntityId, settlement.date);
  if (!policy?.enabled || !Array.isArray(policy.sourceTypes) || !policy.sourceTypes.includes("PAYROLL")) return;
  if (!expense?.sourceId || expense.sourceModule !== "RH" || expense.sourceType !== "PAYROLL_RUN" || !settlement.valueDecimal) throw new MunicipalCostError("Custo individual exige origem nativa e valor Decimal da folha.");
  const run = await readCostPayrollRun(tx, expense.sourceId);
  if (run.mode !== "OFICIAL" || run.scope !== "PRODUCAO" || run.status !== "FECHADA") throw new MunicipalCostError("Custos exige memória fechada de folha oficial de produção.");
  const event = await findCostPayrollIntegration(tx, `FINANCEIRO:DESPESAS:${run.id}`);
  if (!event) throw new MunicipalCostError("Plano financeiro congelado da folha não encontrado.");
  const plan = planSchema.parse(event.payload), result = resultSchema.parse(event.result);
  const at = result.expenseIds.indexOf(expense.id), line = plan.lines[at];
  if (event.status !== "CONCLUIDA" || event.eventType !== "SOLICITACOES_DESPESA_FOLHA" || plan.runId !== run.id || result.expenseIds.length !== plan.lines.length || new Set(result.expenseIds).size !== result.expenseIds.length || new Set(plan.lines.map(row => row.key)).size !== plan.lines.length || new Set(plan.lines.map(row => JSON.stringify([row.costCenterId, row.component]))).size !== plan.lines.length || !line || line.appropriationId !== appropriation.id || line.supplierId !== expense.supplierId || line.secretariatId !== expense.secretariatId || !expense.valueDecimal?.equals(line.value)) throw new MunicipalCostError("Despesa da folha não corresponde ao plano financeiro congelado.");
  const secretariatId = await readCostUnitSecretariat(tx, appropriation.budgetUnitId);
  if (line.costCenterId && !await hasCostCenterScope(tx, line.costCenterId, appropriation.financialYear.governmentEntityId, secretariatId)) throw new MunicipalCostError("Centro congelado da folha não pertence ao ente/secretaria da UG financeira.");
  let slices = splitPayrollCostStatements(await listCostPayrollStatements(tx, run.id), line);
  const total = slices.reduce((sum, slice) => sum.plus(slice.amount), new Decimal(0));
  if (!total.equals(line.value) || !settlement.valueDecimal.equals(total)) throw new MunicipalCostError("Liquidação individual deve reconciliar integralmente a linha do plano financeiro da folha.");
  const releases = [];
  for (const row of releasesSchema.parse(input.releaseMemory ?? [])) {
    const consumed = await readCostRightEntry(tx, row.consumptionEntryId);
    const details = z.object({ appropriationEntryId: z.string(), component: z.enum(["GROSS", "EMPLOYER"]) }).parse(consumed.details);
    if (details.appropriationEntryId !== row.provisionEntryId || details.component !== line.component) throw new MunicipalCostError("Baixa da provisão diverge do componente contratado da folha.");
    const original = await readCostRightEntry(tx, row.provisionEntryId);
    if (original.contractId !== consumed.contractId) throw new MunicipalCostError("Baixa e provisão pertencem a vínculos diferentes.");
    const base = details.component === "GROSS" ? z.object({ memory: z.object({ items: z.array(z.object({ code: z.string().min(1), type: z.literal("PROVENTO") })).min(1) }) }).parse(original.details).memory.items.map(item => item.code) : undefined;
    releases.push({ contractId: consumed.contractId, component: details.component, amount: new Decimal(row.amount), payrollCodes: base });
  }
  slices = deductPayrollCostReleases(slices, releases);
  if (!slices.reduce((sum, slice) => sum.plus(slice.amount), new Decimal(0)).equals(input.netAmount)) throw new MunicipalCostError("Detalhamento individual não reconcilia o custo líquido da liquidação.");
  const legacy = await findCostSourceByOrigin(tx, "PAYROLL", settlement.id);
  if (legacy) throw new MunicipalCostError("Liquidação já possui origem agregada de folha; preserve-a e reconcilie antes de produzir origens individuais.");
  for (const slice of slices) await recordMunicipalCostSource(tx, actor, { financialYearId: settlement.executionFinancialYearId ?? appropriation.financialYearId, budgetUnitId: appropriation.budgetUnitId, sourceType: "PAYROLL", sourceId: `PAYROLL_SETTLEMENT:${settlement.id}:${slice.key}`, expenseDate: settlement.date, amount: slice.amount, dimensions: { ...slice.dimensions, appropriationId: appropriation.id }, evidence: { ...slice.evidence, settlementId: settlement.id, expenseId: expense.id, commitmentId: settlement.commitmentId, payrollRunId: run.id, payrollPlanEventId: event.id, component: line.component, releaseEventId: input.releaseEventId } });
}
