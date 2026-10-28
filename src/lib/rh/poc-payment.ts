import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { hrPayrollRuleSets } from "@/db/schema/personnel-configuration";
import { hrIntegrationEvents, hrPayrollRuns, payrolls } from "@/db/schema/personnel-workforce";
import { findHrIntegrationEvent, lockPersonnel } from "@/db/repositories/personnel/integration";
import { requirePayrollRunWithStatements } from "@/db/repositories/personnel/workforce";
import { z } from "zod";
import { enqueueHrIntegration } from "./workforce-service";

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

export async function buildPocAnnualIncomeReport(db: DatabaseExecutor, year: number, payrollScope?: SQL) {
  const events = await db.select().from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.domain, "POC_FINANCEIRO"), eq(hrIntegrationEvents.eventType, "PAGAMENTO_DEMONSTRATIVO_REGISTRADO"), eq(hrIntegrationEvents.environment, "DEMONSTRACAO"))).orderBy(asc(hrIntegrationEvents.sourceKey));
  const payloadSchema = z.object({ input: z.object({ runId: z.string(), paymentDate: z.iso.date() }), rows: z.array(z.object({ personId: z.string(), cpf: z.string(), name: z.string(), payrollType: z.string(), gross: z.string(), net: z.string(), taxableIncome: z.string(), socialContribution: z.string(), incomeTax: z.string() })) });
  const parsed = events.map(event => payloadSchema.parse(event.payload)).filter(payload => Number(payload.input.paymentDate.slice(0, 4)) === year);
  const allowed = new Set((await db.select({ id: hrPayrollRuns.id }).from(hrPayrollRuns).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(and(inArray(hrPayrollRuns.id, parsed.map(payload => payload.input.runId)), eq(hrPayrollRuns.scope, "DEMONSTRACAO"), payrollScope))).map(run => run.id));
  const grouped = new Map<string, { cpf: string; name: string; regular: Decimal; thirteenth: Decimal; rra: Decimal; social: Decimal; tax: Decimal; advance: Decimal; net: Decimal }>();
  for (const payload of parsed.filter(payload => allowed.has(payload.input.runId))) for (const row of payload.rows) {
    const group = grouped.get(row.personId) ?? { cpf: row.cpf, name: row.name, regular: new Decimal(0), thirteenth: new Decimal(0), rra: new Decimal(0), social: new Decimal(0), tax: new Decimal(0), advance: new Decimal(0), net: new Decimal(0) };
    if (row.payrollType === "RRA") group.rra = group.rra.add(row.taxableIncome);
    else if (["13º", "Diferença 13º"].includes(row.payrollType)) group.thirteenth = group.thirteenth.add(row.taxableIncome);
    else if (["Adiantamento salarial", "1ª parcela 13º"].includes(row.payrollType)) group.advance = group.advance.add(row.gross);
    else group.regular = group.regular.add(row.taxableIncome);
    group.social = group.social.add(row.socialContribution); group.tax = group.tax.add(row.incomeTax); group.net = group.net.add(row.net);
    grouped.set(row.personId, group);
  }
  return { title: `Informe anual MODELO POC ${year} — pagamentos demonstrativos; classificação estimada, não documento fiscal homologado`, headers: ["Ano pagamento", "CPF", "Beneficiário", "Rendimentos regulares BRL", "13º BRL", "RRA BRL", "Previdência BRL", "IRRF BRL", "Adiantamentos BRL", "Líquido demonstrativo BRL", "Modelo"], rows: [...grouped.values()].sort((a, b) => a.cpf.localeCompare(b.cpf)).map(row => [String(year), row.cpf, row.name, row.regular.toFixed(2), row.thirteenth.toFixed(2), row.rra.toFixed(2), row.social.toFixed(2), row.tax.toFixed(2), row.advance.toFixed(2), row.net.toFixed(2), "INFORME_ANUAL_POC_V1"]) };
}
