import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { enqueueHrIntegration } from "./workforce-service";

/** Local settlement model for the POC. The evidence is explicitly segregated
 * from the native Financeiro/bank confirmation and preserves the paid date. */
export async function registerPocPayment(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ runId: z.string().min(1), paymentDate: z.iso.date(), reference: z.string().trim().min(5).max(300) }).strict().parse(raw);
  return db.$transaction(async tx => {
    const run = await tx.hrPayrollRun.findUniqueOrThrow({ where: { id: input.runId }, include: { payroll: true, statements: true } });
    const ruleSet = await tx.hrPayrollRuleSet.findUniqueOrThrow({ where: { id: run.ruleSetId } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:POC:PAYMENT:${run.id}`}))`;
    if (run.scope !== "DEMONSTRACAO" || !ruleSet.isDemo || run.mode !== "OFICIAL" || run.status !== "FECHADA") throw new Error("Liquidação POC exige cálculo demonstrativo fechado.");
    const sourceKey = `PAGAMENTO_POC:${run.id}`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      const stored = (previous.payload as { input: typeof input }).input;
      if (Object.entries(input).some(([key, value]) => stored[key as keyof typeof input] !== value)) throw new Error("Pagamento demonstrativo já registrado com outra data/referência.");
      return previous;
    }
    const rows = run.statements.map(statement => {
      const snapshot = z.object({ contract: z.object({ registration: z.string(), employee: z.object({ person: z.object({ id: z.string(), cpf: z.string(), fullName: z.string() }) }) }), bases: z.record(z.string(), z.string()), items: z.array(z.object({ code: z.string(), type: z.string(), value: z.string() })) }).parse(statement.snapshot);
      const sum = (test: (code: string) => boolean) => snapshot.items.filter(item => test(item.code)).reduce((amount, item) => amount.add(item.value), new Prisma.Decimal(0)).toFixed(2);
      return { statementId: statement.id, personId: snapshot.contract.employee.person.id, cpf: snapshot.contract.employee.person.cpf, name: snapshot.contract.employee.person.fullName, registration: snapshot.contract.registration, payrollType: run.payroll.type, competence: run.payroll.competence, gross: statement.gross.toFixed(2), net: statement.net.toFixed(2), taxableIncome: snapshot.bases.IRRF || "0.00", socialContribution: sum(code => code.startsWith("PREVIDENCIA_")), incomeTax: sum(code => code === "IRRF"), estimated: true };
    });
    return enqueueHrIntegration(tx, { sourceKey, domain: "POC_FINANCEIRO", environment: "DEMONSTRACAO", eventType: "PAGAMENTO_DEMONSTRATIVO_REGISTRADO", payload: { input, actorId, rows, gross: run.gross.toFixed(2), net: run.net.toFixed(2), actualBankSettlement: false, nativeFinancialPayment: false } });
  });
}

export async function buildPocAnnualIncomeReport(db: PrismaClient, year: number, payrollScope: Prisma.PayrollWhereInput) {
  const events = await db.hrIntegrationEvent.findMany({ where: { domain: "POC_FINANCEIRO", eventType: "PAGAMENTO_DEMONSTRATIVO_REGISTRADO", environment: "DEMONSTRACAO" }, orderBy: { sourceKey: "asc" } });
  const payloadSchema = z.object({ input: z.object({ runId: z.string(), paymentDate: z.iso.date() }), rows: z.array(z.object({ personId: z.string(), cpf: z.string(), name: z.string(), payrollType: z.string(), gross: z.string(), net: z.string(), taxableIncome: z.string(), socialContribution: z.string(), incomeTax: z.string() })) });
  const parsed = events.map(event => payloadSchema.parse(event.payload)).filter(payload => Number(payload.input.paymentDate.slice(0, 4)) === year);
  const allowed = new Set((await db.hrPayrollRun.findMany({ where: { id: { in: parsed.map(payload => payload.input.runId) }, scope: "DEMONSTRACAO", payroll: payrollScope }, select: { id: true } })).map(run => run.id));
  const grouped = new Map<string, { cpf: string; name: string; regular: Prisma.Decimal; thirteenth: Prisma.Decimal; rra: Prisma.Decimal; social: Prisma.Decimal; tax: Prisma.Decimal; advance: Prisma.Decimal; net: Prisma.Decimal }>();
  for (const payload of parsed.filter(payload => allowed.has(payload.input.runId))) for (const row of payload.rows) {
    const group = grouped.get(row.personId) ?? { cpf: row.cpf, name: row.name, regular: new Prisma.Decimal(0), thirteenth: new Prisma.Decimal(0), rra: new Prisma.Decimal(0), social: new Prisma.Decimal(0), tax: new Prisma.Decimal(0), advance: new Prisma.Decimal(0), net: new Prisma.Decimal(0) };
    if (row.payrollType === "RRA") group.rra = group.rra.add(row.taxableIncome);
    else if (["13º", "Diferença 13º"].includes(row.payrollType)) group.thirteenth = group.thirteenth.add(row.taxableIncome);
    else if (["Adiantamento salarial", "1ª parcela 13º"].includes(row.payrollType)) group.advance = group.advance.add(row.gross);
    else group.regular = group.regular.add(row.taxableIncome);
    group.social = group.social.add(row.socialContribution); group.tax = group.tax.add(row.incomeTax); group.net = group.net.add(row.net);
    grouped.set(row.personId, group);
  }
  return { title: `Informe anual MODELO POC ${year} — pagamentos demonstrativos; classificação estimada, não documento fiscal homologado`, headers: ["Ano pagamento", "CPF", "Beneficiário", "Rendimentos regulares BRL", "13º BRL", "RRA BRL", "Previdência BRL", "IRRF BRL", "Adiantamentos BRL", "Líquido demonstrativo BRL", "Modelo"], rows: [...grouped.values()].sort((a, b) => a.cpf.localeCompare(b.cpf)).map(row => [String(year), row.cpf, row.name, row.regular.toFixed(2), row.thirteenth.toFixed(2), row.rra.toFixed(2), row.social.toFixed(2), row.tax.toFixed(2), row.advance.toFixed(2), row.net.toFixed(2), "INFORME_ANUAL_POC_V1"]) };
}
