import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { hrEmploymentContracts, hrPayrollRuns, hrPayrollStatements, payrolls } from "@/db/schema/personnel-workforce";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { consignmentMarginSchema } from "./consignment-margin";
import { dependentAssessmentSchema, familyWageSnapshotSchema } from "./dependent-eligibility";
import { receiptMessagesSnapshotSchema } from "./receipt-messages";
import { personalStatementPublicationAllowed } from "@/lib/portal-servidor/payroll-publication";

const snapshotSchema = z.object({
  contract: z.object({ registration: z.string(), workLocation: z.string(), salary: z.string(), employee: z.object({ name: z.string() }) }),
  days: z.number(),
  items: z.array(z.object({ code: z.string(), name: z.string(), type: z.string(), value: z.string(), method: z.string(), formula: z.string().nullable(), base: z.string().nullable(), rate: z.string().nullable(), movement: z.string() })),
  bases: z.record(z.string(), z.string()),
  consignmentMargin: consignmentMarginSchema.nullable().optional().default(null),
  familyWage: familyWageSnapshotSchema.nullable().optional().default(null),
  irrfDependents: dependentAssessmentSchema.nullable().optional().default(null),
  messages: receiptMessagesSnapshotSchema.optional().default([]),
  incomeTax: z.object({ income: z.string(), legalDeductions: z.string(), simplifiedDeduction: z.string(), deduction: z.string(), deductionMethod: z.string(), base: z.string(), preliminary: z.string(), reduction: z.string(), tax: z.string(), rraMonths: z.number().nullable(), referenceDate: z.string() }).nullable().optional().default(null),
  specialPayroll: z.record(z.string(), z.unknown()).nullable().optional().default(null),
  proration: z.record(z.string(), z.unknown()).nullable().optional().default(null),
  pensions: z.array(z.object({ id: z.string(), courtReference: z.string(), basis: z.string(), base: z.string(), amount: z.string(), deductFromIncomeTax: z.boolean(), beneficiary: z.object({ id: z.string(), fullName: z.string() }) })).optional().default([]),
});

export async function getPayrollStatement(db: DatabaseExecutor, id: string, employeeId?: string) {
  const [row] = await db.select({ statement: hrPayrollStatements, run: hrPayrollRuns, payroll: payrolls }).from(hrPayrollStatements)
    .innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId))
    .where(and(eq(hrPayrollStatements.id, id), employeeId ? and(sql`EXISTS (SELECT 1 FROM ${hrEmploymentContracts} WHERE ${hrEmploymentContracts.id}=${hrPayrollStatements.contractId} AND ${hrEmploymentContracts.employeeId}=${employeeId})`, lte(hrPayrollStatements.releaseAt, new Date()), isNull(hrPayrollStatements.revokedAt), eq(hrPayrollRuns.mode, "OFICIAL"), inArray(hrPayrollRuns.status, ["FECHADA", "CALCULADA"])) : undefined)).limit(1);
  if (!row) throw new Error("Demonstrativo indisponível.");
  const statement = { ...row.statement, run: { ...row.run, payroll: row.payroll } };
  if (employeeId && !await personalStatementPublicationAllowed(db, statement, employeeId)) throw new Error("Demonstrativo indisponível.");
  return { id: statement.id, ...snapshotSchema.parse(statement.snapshot), competence: statement.run.payroll.competence, payrollType: statement.run.payroll.type, scope: statement.run.scope, mode: statement.run.mode, createdAt: statement.run.createdAt, gross: statement.gross.toFixed(2), deductions: statement.deductions.toFixed(2), net: statement.net.toFixed(2), employer: statement.employer.toFixed(2) };
}

export async function renderPayrollStatementPdf(statement: Awaited<ReturnType<typeof getPayrollStatement>>, validationCode?: string) {
  const pdf = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => { pdf.on("data", chunk => chunks.push(Buffer.from(chunk))); pdf.on("end", () => resolve(Buffer.concat(chunks))); pdf.on("error", reject); });
  pdf.fontSize(16).text("Demonstrativo de pagamento");
  pdf.fontSize(10).text(`${statement.competence} · ${statement.payrollType} · ${statement.scope} · ${statement.mode}`);
  pdf.text(`${statement.contract.employee.name} · matrícula ${statement.contract.registration}`);
  pdf.text(`Local: ${statement.contract.workLocation} · referência: ${statement.days} dias`);
  pdf.moveDown();
  for (const item of statement.items) {
    pdf.fontSize(10).text(`${item.code} · ${item.name} · ${item.type} · R$ ${item.value}`);
    pdf.fontSize(8).fillColor("#555555").text(`Método: ${item.method} · fórmula: ${item.formula || "—"} · base: ${item.base || "—"} · movimento: ${item.movement}`).fillColor("#000000");
    pdf.moveDown(0.4);
  }
  pdf.moveDown().fontSize(11).text(`Bruto: R$ ${statement.gross} · descontos: R$ ${statement.deductions} · líquido: R$ ${statement.net}`);
  pdf.fontSize(9).text(`Bases: ${Object.entries(statement.bases).map(([key, value]) => `${key}: ${value}`).join(" · ")}`);
  pdf.text(`Versão do demonstrativo: ${statement.id}`);
  if (validationCode) pdf.text(`Autenticidade: /validar-recibo/${validationCode}`);
  pdf.text("O demonstrativo não comprova quitação bancária.");
  for (const message of statement.messages) pdf.moveDown().fontSize(9).text(message.text);
  if (statement.familyWage) {
    const family = statement.familyWage;
    pdf.moveDown().text(`Salário-família por PF: ${family.eligibleCount} dependentes elegíveis · renda apurada R$ ${family.income} · limite R$ ${family.policy.incomeLimit} · total agregado R$ ${family.amount}`);
    pdf.text(`Fundamento: ${family.policy.eligibility.legalReference}`);
  }
  if (statement.irrfDependents) pdf.text(`Dependentes elegíveis de IRRF na versão: ${statement.irrfDependents.eligibleCount} · ${statement.irrfDependents.policy.legalReference}`);
  if (statement.incomeTax) {
    const tax = statement.incomeTax;
    pdf.moveDown().text(`IRRF agregado por PF: renda R$ ${tax.income} · dedução ${tax.deductionMethod} R$ ${tax.deduction} · base R$ ${tax.base}`);
    pdf.text(`Imposto preliminar R$ ${tax.preliminary} · redução R$ ${tax.reduction} · imposto R$ ${tax.tax}${tax.rraMonths ? ` · RRA ${tax.rraMonths} meses` : ""}`);
  }
  if (statement.specialPayroll) pdf.moveDown().text(`Folha especial POC — premissas e fórmulas: ${JSON.stringify(statement.specialPayroll)}`);
  if (statement.proration) pdf.moveDown().text(`Rateio mensal por vigências: ${JSON.stringify(statement.proration)}`);
  for (const pension of statement.pensions) pdf.moveDown().text(`Pensão ${pension.id} · beneficiário ${pension.beneficiary.fullName} · processo ${pension.courtReference} · base ${pension.basis} R$ ${pension.base} · desconto R$ ${pension.amount} · dedutível IRRF ${pension.deductFromIncomeTax ? "sim" : "não"}`);
  if (statement.consignmentMargin) {
    const margin = statement.consignmentMargin;
    pdf.moveDown().text(`Margem consignável agregada: base R$ ${margin.base} · limite ${margin.rate}% = R$ ${margin.limit} · utilizado R$ ${margin.used} · disponível R$ ${margin.available}`);
    pdf.text(`Fundamento: ${margin.policy.legalReference}`);
    pdf.text("Margem da versão calculada, compartilhada entre os vínculos. Não constitui reserva ou autorização de novo crédito.");
  }
  const pages = pdf.bufferedPageRange();
  for (let page = 0; page < pages.count; page++) {
    pdf.switchToPage(page);
    pdf.text(`${page + 1}/${pages.count}`, 42, pdf.page.height - 35, { lineBreak: false });
  }
  pdf.end();
  return result;
}
