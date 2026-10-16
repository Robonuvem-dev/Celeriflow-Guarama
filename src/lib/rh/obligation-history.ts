import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

export const obligationHistoryInputSchema = z.object({
  year: z.coerce.number().int().min(1900).max(9999),
  scope: z.enum(["DEMONSTRACAO", "HOMOLOGACAO", "PRODUCAO"]),
}).strict();

const snapshotSchema = z.object({
  contract: z.object({ registration: z.string(), workLocation: z.string(), costCenterId: z.string().nullable(), employee: z.object({ name: z.string(), personId: z.string().nullable(), person: z.object({ cpf: z.string() }).nullable().optional() }) }),
  regime: z.object({ code: z.string(), socialSecurityScheme: z.object({ code: z.string(), regime: z.string() }).nullable() }),
  items: z.array(z.object({ code: z.string(), name: z.string(), type: z.string(), value: z.string() })),
  bases: z.record(z.string(), z.string()),
});

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

/** Internal historical evidence for obligation preparation, without inferring
 * fiscal classifications, payment dates or an official external layout. */
export async function buildObligationHistory(db: PrismaClient, raw: unknown, payrollScope: Prisma.PayrollWhereInput = {}) {
  const input = obligationHistoryInputSchema.parse(raw);
  const competences = Array.from({ length: 12 }, (_, month) => `${String(month + 1).padStart(2, "0")}/${String(input.year).padStart(4, "0")}`);
  return db.$transaction(async tx => {
    const where: Prisma.HrPayrollStatementWhereInput = { run: { mode: "OFICIAL", status: "FECHADA", scope: input.scope, payroll: { AND: [payrollScope, { competence: { in: competences } }] } } };
    const total = await tx.hrPayrollStatement.count({ where });
    const records = [];
    let cursor: string | undefined;
    let gross = new Prisma.Decimal(0); let deductions = new Prisma.Decimal(0); let net = new Prisma.Decimal(0); let employer = new Prisma.Decimal(0);
    for (;;) {
      const batch = await tx.hrPayrollStatement.findMany({ where, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 200, orderBy: { id: "asc" }, include: { run: { select: { id: true, ruleSetId: true, approvedAt: true, payroll: { select: { id: true, competence: true, type: true } } } } } });
      if (!batch.length) break;
      for (const statement of batch) {
        const snapshot = snapshotSchema.parse(statement.snapshot);
        const record = { statementId: statement.id, runId: statement.run.id, ruleSetId: statement.run.ruleSetId, payrollId: statement.run.payroll.id, competence: statement.run.payroll.competence, payrollType: statement.run.payroll.type, closedAt: statement.run.approvedAt?.toISOString() ?? null, contractId: statement.contractId, identity: { registration: snapshot.contract.registration, name: snapshot.contract.employee.name, personId: snapshot.contract.employee.personId, cpf: snapshot.contract.employee.person?.cpf ?? null }, workLocation: snapshot.contract.workLocation, costCenterId: snapshot.contract.costCenterId, regime: snapshot.regime, items: snapshot.items, bases: snapshot.bases, totals: { gross: statement.gross.toFixed(2), deductions: statement.deductions.toFixed(2), net: statement.net.toFixed(2), employer: statement.employer.toFixed(2) }, snapshotSha256: digest(statement.snapshot) };
        records.push({ ...record, recordSha256: digest(record) });
        gross = gross.add(statement.gross); deductions = deductions.add(statement.deductions); net = net.add(statement.net); employer = employer.add(statement.employer);
      }
      cursor = batch.at(-1)!.id;
    }
    if (records.length !== total) throw new Error("Exportação histórica incompleta.");
    const content = { format: "RH_OBRIGACOES_HISTORICO_V1", officialLayout: false, basis: "COMPETENCIA_CALCULADA_NAO_DATA_DE_PAGAMENTO", filters: input, count: records.length, totals: { gross: gross.toFixed(2), deductions: deductions.toFixed(2), net: net.toFixed(2), employer: employer.toFixed(2) }, records };
    return { ...content, contentSha256: digest(content) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 });
}
