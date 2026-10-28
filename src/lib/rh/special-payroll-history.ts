import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { requirePayrollRunWithStatements } from "@/db/repositories/personnel/workforce";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";

const snapshotSchema = z.object({
  regime: z.object({ socialSecurityScheme: z.object({ code: z.string() }).nullable() }),
  bases: z.record(z.string(), z.string()),
  items: z.array(z.object({ code: z.string(), value: z.string() })),
  pensions: z.array(z.object({ amount: z.string(), deductFromIncomeTax: z.boolean() })).optional().default([]),
});
export type SpecialPayrollHistory = {
  runId: string; statementId: string; payrollId: string; competence: string; payrollType: string;
  gross: string; advance: string; incomeTax: string; socialContribution: string;
  bases: Record<string, string>; employer: string; schemeCode: string | null; pensionIncomeTaxDeduction: string;
};

export async function loadSpecialPayrollHistory(tx: DatabaseExecutor, input: { sourceRunId: string; payrollId: string; payrollType: string; competence: string; contractIds: string[]; ruleSetId: string; scope: string }) {
  const source = await requirePayrollRunWithStatements(tx, input.sourceRunId);
  if (source.payrollId === input.payrollId || source.mode !== "OFICIAL" || source.status !== "FECHADA" || source.scope !== input.scope || source.ruleSetId !== input.ruleSetId) throw new Error("Origem especial exige outra execução fechada do mesmo conjunto e escopo.");
  const expected = input.payrollType === "13º" ? "1ª parcela 13º" : input.payrollType === "Diferença 13º" ? "13º" : null;
  const original = payrollPeriod(source.payroll.competence).start, target = payrollPeriod(input.competence).start;
  if (!expected || source.payroll.type !== expected || original > target || original.getUTCFullYear() !== target.getUTCFullYear()) throw new Error("Tipo/ano/competência da origem incompatíveis com a parcela ou diferença.");
  if (source.statements.length !== input.contractIds.length || source.statements.some(statement => !input.contractIds.includes(statement.contractId))) throw new Error("Origem e destino devem ter exatamente os mesmos contratos para conciliar retenções por PF.");
  const result = new Map<string, SpecialPayrollHistory>();
  for (const statement of source.statements) {
    const snapshot = snapshotSchema.parse(statement.snapshot);
    const sum = (code: string) => snapshot.items.filter(item => item.code === code).reduce((value, item) => value.add(item.value), new Decimal(0)).toFixed(2);
    const schemeCode = snapshot.regime.socialSecurityScheme?.code ?? null;
    result.set(statement.contractId, { runId: source.id, statementId: statement.id, payrollId: source.payrollId, competence: source.payroll.competence, payrollType: source.payroll.type, gross: statement.gross.toFixed(2), advance: sum("POC_ADIANTAMENTO_13"), incomeTax: sum("IRRF"), socialContribution: schemeCode ? sum(`PREVIDENCIA_${schemeCode}`) : "0.00", bases: snapshot.bases, employer: statement.employer.sub(sum("FGTS")).toFixed(2), schemeCode, pensionIncomeTaxDeduction: snapshot.pensions.filter(pension => pension.deductFromIncomeTax).reduce((value, pension) => value.add(pension.amount), new Decimal(0)).toFixed(2) });
  }
  return result;
}
