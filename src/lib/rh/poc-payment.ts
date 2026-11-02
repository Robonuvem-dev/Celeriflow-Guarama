import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { hrPayrollRuleSets } from "@/db/schema/personnel-configuration";
import { hrEmploymentContracts, hrIntegrationEvents, hrPayrollRuns, hrPayrollStatements, payrolls } from "@/db/schema/personnel-workforce";
import { findHrIntegrationEvent, lockPersonnel } from "@/db/repositories/personnel/integration";
import { requirePayrollRunWithStatements } from "@/db/repositories/personnel/workforce";
import { z } from "zod";
import { enqueueHrIntegration } from "./workforce-service";
import { incomeHistorySchema } from "./income-history";

/** Local settlement model for the POC. The evidence is explicitly segregated
 * from the native Financeiro/bank confirmation and preserves the paid date. */
export async function registerPocPayment(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ runId: z.string().min(1), paymentDate: z.iso.date(), reference: z.string().trim().min(5).max(300) }).strict().parse(raw);
  return withDatabaseTransaction(db, async tx => {
    const run = await requirePayrollRunWithStatements(tx, input.runId);
    const [ruleSet] = await tx.select().from(hrPayrollRuleSets).where(eq(hrPayrollRuleSets.id, run.ruleSetId)).limit(1);
    if (!ruleSet) throw new Error("Conjunto de regras não encontrado.");
    await lockPersonnel(tx, `POC:PAYMENT:${run.id}`);
    if (run.scope !== "DEMONSTRACAO" || !ruleSet.isDemo || run.mode !== "OFICIAL" || run.status !== "FECHADA") throw new Error("Liquidação POC exige cálculo demonstrativo fechado.");
    const sourceKey = `PAGAMENTO_POC:${run.id}`;
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      const stored = (previous.payload as { input: typeof input }).input;
      if (Object.entries(input).some(([key, value]) => stored[key as keyof typeof input] !== value)) throw new Error("Pagamento demonstrativo já registrado com outra data/referência.");
      return previous;
    }
    const rows = run.statements.map(statement => {
      const snapshot = z.object({ contract: z.object({ registration: z.string(), employee: z.object({ person: z.object({ id: z.string(), cpf: z.string(), fullName: z.string() }) }) }), bases: z.record(z.string(), z.string()), items: z.array(z.object({ code: z.string(), type: z.string(), value: z.string() })) }).parse(statement.snapshot);
      const sum = (test: (code: string) => boolean) => snapshot.items.filter(item => test(item.code)).reduce((amount, item) => amount.add(item.value), new Decimal(0)).toFixed(2);
      return { statementId: statement.id, personId: snapshot.contract.employee.person.id, cpf: snapshot.contract.employee.person.cpf, name: snapshot.contract.employee.person.fullName, registration: snapshot.contract.registration, payrollType: run.payroll.type, competence: run.payroll.competence, gross: statement.gross.toFixed(2), net: statement.net.toFixed(2), taxableIncome: snapshot.bases.IRRF || "0.00", socialContribution: sum(code => code.startsWith("PREVIDENCIA_")), incomeTax: sum(code => code === "IRRF"), estimated: true };
    });
    return enqueueHrIntegration(tx, { sourceKey, domain: "POC_FINANCEIRO", environment: "DEMONSTRACAO", eventType: "PAGAMENTO_DEMONSTRATIVO_REGISTRADO", payload: { input, actorId, rows, gross: run.gross.toFixed(2), net: run.net.toFixed(2), actualBankSettlement: false, nativeFinancialPayment: false } });
  });
}

export async function buildPocAnnualIncomeReport(db: DatabaseExecutor, year: number, payrollScope?: SQL, employeeId?: string) {
  const events = await db.select().from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.domain, "POC_FINANCEIRO"), eq(hrIntegrationEvents.eventType, "PAGAMENTO_DEMONSTRATIVO_REGISTRADO"), eq(hrIntegrationEvents.environment, "DEMONSTRACAO"))).orderBy(asc(hrIntegrationEvents.sourceKey));
  const payloadSchema = z.object({ input: z.object({ runId: z.string(), paymentDate: z.iso.date() }), rows: z.array(z.object({ statementId: z.string(), competence: z.string(), personId: z.string(), cpf: z.string(), name: z.string(), payrollType: z.string(), gross: z.string(), net: z.string(), taxableIncome: z.string(), socialContribution: z.string(), incomeTax: z.string() })) });
  const parsed = events.filter(event => event.status !== "REVOGADO").map(event => payloadSchema.parse(event.payload)).filter(payload => Number(payload.input.paymentDate.slice(0, 4)) === year);
  const historyEvents = await db.select().from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.domain, "POC_FINANCEIRO"), eq(hrIntegrationEvents.eventType, "RENDIMENTOS_HISTORICOS_IMPORTADOS"), eq(hrIntegrationEvents.environment, "DEMONSTRACAO"))).orderBy(asc(hrIntegrationEvents.sourceKey));
  const histories = historyEvents.filter(event => event.status !== "REVOGADO").map(event => incomeHistorySchema.parse(event.payload)).filter(record => record.year === year && (!employeeId || record.employeeId === employeeId));
  const runIds = [...new Set([...parsed.map(payload => payload.input.runId), ...histories.map(record => record.anchorRunId)])];
  const allowed = await db.select({ runId: hrPayrollRuns.id, statementId: hrPayrollStatements.id, employeeId: hrEmploymentContracts.employeeId, contractId: hrEmploymentContracts.id }).from(hrPayrollRuns)
    .innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).innerJoin(hrPayrollStatements, eq(hrPayrollStatements.runId, hrPayrollRuns.id)).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrPayrollStatements.contractId))
    .where(and(inArray(hrPayrollRuns.id, runIds), eq(hrPayrollRuns.scope, "DEMONSTRACAO"), eq(hrPayrollRuns.mode, "OFICIAL"), eq(hrPayrollRuns.status, "FECHADA"), employeeId ? eq(hrEmploymentContracts.employeeId, employeeId) : undefined, payrollScope));
  const allowedStatements = new Set(allowed.map(row => row.statementId));
  const statementContracts = new Map(allowed.map(row => [row.statementId, row.contractId]));
  const paidMonthly = new Set<string>();
  const grouped = new Map<string, { cpf: string; name: string; regular: Decimal; thirteenth: Decimal; rra: Decimal; social: Decimal; tax: Decimal; advance: Decimal; net: Decimal; social13: Decimal; tax13: Decimal; months: Set<string> }>();
  const groupFor = (row: { personId: string; cpf: string; name: string }) => grouped.get(row.personId) ?? { cpf: row.cpf, name: row.name, regular: new Decimal(0), thirteenth: new Decimal(0), rra: new Decimal(0), social: new Decimal(0), tax: new Decimal(0), advance: new Decimal(0), net: new Decimal(0), social13: new Decimal(0), tax13: new Decimal(0), months: new Set<string>() };
  for (const payload of parsed) for (const row of payload.rows.filter(row => allowedStatements.has(row.statementId))) {
    const group = groupFor(row);
    if (row.payrollType === "RRA") group.rra = group.rra.add(row.taxableIncome);
    else if (["13º", "Diferença 13º"].includes(row.payrollType)) { group.thirteenth = group.thirteenth.add(row.taxableIncome); group.social13 = group.social13.add(row.socialContribution); group.tax13 = group.tax13.add(row.incomeTax); }
    else if (["Adiantamento salarial", "1ª parcela 13º"].includes(row.payrollType)) group.advance = group.advance.add(row.gross);
    else group.regular = group.regular.add(row.taxableIncome);
    group.social = group.social.add(row.socialContribution); group.tax = group.tax.add(row.incomeTax); group.net = group.net.add(row.net);
    if (row.payrollType === "Mensal") { group.months.add(row.competence); paidMonthly.add(`${statementContracts.get(row.statementId)}:${row.competence}`); }
    grouped.set(row.personId, group);
  }
  const imported = new Set<string>();
  for (const history of histories) {
    if (!allowed.some(row => row.runId === history.anchorRunId && row.employeeId === history.employeeId && row.contractId === history.contractId)) continue;
    const group = groupFor(history);
    for (const month of history.months) {
      const key = `${history.contractId}:${month.competence}`;
      if (imported.has(key) || paidMonthly.has(key)) throw new Error("Competência repetida entre o histórico anual e a folha mensal. Concilie as origens antes da emissão.");
      imported.add(key); group.months.add(month.competence);
      group.regular = group.regular.add(month.gross); group.social = group.social.add(month.socialContribution); group.tax = group.tax.add(month.incomeTax); group.net = group.net.add(month.net);
    }
    grouped.set(history.personId, group);
  }
  return { title: `Comprovante de rendimentos — ano-calendário ${year} · exercício ${year + 1}`, headers: ["Ano pagamento", "CPF", "Beneficiário", "Rendimentos tributáveis BRL", "13º bruto BRL", "RRA BRL", "Previdência total BRL", "IRRF total BRL", "Adiantamentos BRL", "Líquido BRL", "Modelo", "Previdência sobre 13º BRL", "IRRF exclusivo sobre 13º BRL", "13º líquido BRL", "Previdência rendimentos regulares BRL", "IRRF rendimentos regulares BRL", "Meses abrangidos"], rows: [...grouped.values()].sort((a, b) => a.cpf.localeCompare(b.cpf)).map(row => [String(year), row.cpf, row.name, row.regular.toFixed(2), row.thirteenth.toFixed(2), row.rra.toFixed(2), row.social.toFixed(2), row.tax.toFixed(2), row.advance.toFixed(2), row.net.toFixed(2), "INFORME_RENDIMENTOS_ANUAL", row.social13.toFixed(2), row.tax13.toFixed(2), row.thirteenth.sub(row.social13).sub(row.tax13).toFixed(2), row.social.sub(row.social13).toFixed(2), row.tax.sub(row.tax13).toFixed(2), String(row.months.size)]) };
}
