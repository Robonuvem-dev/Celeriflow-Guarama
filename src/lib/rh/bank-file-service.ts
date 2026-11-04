import { createHash } from "node:crypto";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import type { AppContext } from "@/lib/platform/tenant-context";
import { hrIntegrationEvents, hrPayrollRuns, hrPayrollStatements, payrolls } from "@/db/schema/personnel-workforce";
import { enqueueHrIntegration, findHrIntegrationEvent, lockPersonnel, stablePersonnelJson } from "@/db/repositories/personnel/integration";
import { accessiblePayrollWhere, assertPayrollBudgetScope } from "./payroll-access";
import { bankFileInputSchema, renderBbEdo001, renderBbSalaryCnab240, type BankFileInput, type BankFileRecipient } from "./bank-file-layouts";
import { Decimal } from "@/db/decimal";

const snapshotSchema = z.object({ contract: z.object({ employeeId: z.string(), registration: z.string(), employee: z.object({ name: z.string(), person: z.object({ cpf: z.string().nullable() }).nullable().optional(), cpf: z.string().nullable().optional() }) }), items: z.array(z.object({ code: z.string(), name: z.string(), type: z.string(), value: z.string() })) });
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
function splitAccount(value: string, max: number, requireDv: boolean) {
  const match = new RegExp(`^(\\d{1,${max}})(?:-([0-9X]{1,2}))?$`, "i").exec(value.trim());
  if (!match || requireDv && !match[2]) throw new Error("Agência/conta deve usar número-DV, sem pontuação adicional; informe o dígito quando exigido pelo leiaute.");
  return { number: match[1], dv: match[2]?.[0]?.toUpperCase() ?? "", second: match[2]?.[1]?.toUpperCase() ?? "" };
}

export async function prepareBankFile(db: DatabaseExecutor, context: AppContext, raw: unknown) {
  const input = bankFileInputSchema.parse(raw), cnab = input.layout === "BB_CNAB240_2026_06";
  const [run] = await db.select({ run: hrPayrollRuns, payroll: payrolls }).from(hrPayrollRuns).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(eq(hrPayrollRuns.id, input.runId)).limit(1);
  if (!run || run.run.mode !== "OFICIAL" || run.run.status !== "FECHADA") throw new Error("Selecione execução oficial fechada.");
  await assertPayrollBudgetScope({ ...context, database: db }, run.payroll.id);
  const conventions = await db.execute<{ id: string; name: string; bank: string; details: Record<string, string> }>(sql`SELECT v.id,v.name,b.compe bank,v.details FROM "HrReferenceRecord" v JOIN "Bank" b ON b.id=v.details->>'bankId' WHERE v.id=${input.conventionId} AND v.kind='CONVENIO_BANCARIO' AND v.details->>'direction'='CREDITO' AND v.details->>'from'<=${input.paymentDate} AND v.details->>'until'>=${input.paymentDate}`);
  const convention = conventions.rows[0];
  if (!convention || convention.bank !== "001") throw new Error("Selecione convênio BB de crédito vigente na data programada.");
  const statements = await db.select().from(hrPayrollStatements).where(eq(hrPayrollStatements.runId, input.runId)).orderBy(asc(hrPayrollStatements.id));
  const holders = statements.map(source => snapshotSchema.parse(source.snapshot).contract.employeeId);
  const accounts = await db.execute<{ id: string; details: Record<string, string>; bank: string; convention: string }>(sql`
    SELECT a.id,a.details,b.compe bank,v.id convention FROM "HrReferenceRecord" a
    JOIN "HrReferenceRecord" v ON v.id=a.details->>'conventionId' AND v.kind='CONVENIO_BANCARIO' AND v.details->>'direction'='CREDITO'
    JOIN "Bank" b ON b.id=v.details->>'bankId'
    WHERE a.kind='CONTA_CONVENIO' AND a.details->>'employeeId'=ANY(${sql.param(holders)}::text[])
      AND a.details->>'accountType' IN ('CORRENTE','SALARIO') AND a.details->>'from'<=${input.paymentDate} AND a.details->>'until'>=${input.paymentDate}
      AND v.details->>'from'<=${input.paymentDate} AND v.details->>'until'>=${input.paymentDate}
      ${cnab ? sql`` : sql`AND v.id=${input.conventionId}`}`);
  const recipients: BankFileRecipient[] = [], excluded: string[] = [];
  for (const source of statements) {
    const state = snapshotSchema.parse(source.snapshot);
    if (cnab && new Decimal(source.net.toString()).isZero()) { excluded.push(source.id); continue; }
    const matches = accounts.rows.filter(account => account.details.employeeId === state.contract.employeeId);
    if (matches.length !== 1) throw new Error(`Matrícula ${state.contract.registration}: selecione uma única conta corrente/salário vigente em Convênios bancários; encontradas ${matches.length}.`);
    const account = matches[0], agency = splitAccount(account.details.agency, cnab ? 5 : 4, false), number = splitAccount(account.details.account, cnab ? 12 : 11, cnab);
    if (agency.second || account.bank === "001" && number.second) throw new Error("Dígitos bancários incompatíveis com agência/conta do BB.");
    recipients.push({ statementId: source.id, registration: state.contract.registration, name: state.contract.employee.name, cpf: state.contract.employee.person?.cpf ?? state.contract.employee.cpf ?? "", bank: account.bank, agency: agency.number, agencyDv: agency.dv, account: number.number, accountDv: number.dv, accountSecondDv: number.second, net: source.net.toFixed(2), gross: source.gross.toFixed(2), deductions: source.deductions.toFixed(2), items: state.items, accountSource: `${account.id}; convênio ${account.convention}; ${account.details.authorization}` });
  }
  const bytes = cnab ? renderBbSalaryCnab240(input, recipients) : renderBbEdo001(input, run.payroll.competence, recipients);
  return { input, bytes, fileSha256: hash(bytes), recipients, excluded, competence: run.payroll.competence, convention, payrollId: run.payroll.id, total: recipients.reduce((sum, row) => sum.plus(row.net), new Decimal(0)).toFixed(2) };
}

export async function generateBankFile(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  const input = bankFileInputSchema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await lockPersonnel(tx, `bank-file:${input.conventionId}:${input.layout}:${input.sequence}`);
    const sourceKey = `BANCO_ARQUIVO:${input.conventionId}:${input.layout}:${input.sequence}`;
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      const saved = previous.payload as { input?: BankFileInput; payrollId?: string; fileSha256?: string };
      if (stablePersonnelJson(saved.input) !== stablePersonnelJson(input)) throw new Error("Número de remessa já utilizado com outros parâmetros; use nova sequência.");
      if (!saved.payrollId) throw new Error("Origem do arquivo bancário inválida.");
      await assertPayrollBudgetScope({ ...context, database: tx }, saved.payrollId);
      return { id: previous.id, fileSha256: saved.fileSha256 };
    }
    const [run] = await tx.select().from(hrPayrollRuns).where(eq(hrPayrollRuns.id, input.runId));
    if (!run) throw new Error("Execução não encontrada.");
    // Lock before reading sources, shared with canonical reopening/cancellation.
    await lockPersonnel(tx, `payroll:${run.payrollId}`);
    const output = await prepareBankFile(tx, context, input);
    const event = await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: "INTERNO", eventType: "ARQUIVO_BANCARIO_RH_GERADO", payload: { input, payrollId: output.payrollId, competence: output.competence, convention: output.convention, statementIds: output.recipients.map(row => row.statementId), excludedZeroNet: output.excluded, recipients: output.recipients, total: output.total, fileSha256: output.fileSha256, fileBase64: output.bytes.toString("base64"), actorId: context.user.id, transmission: "NAO_TRANSMITIDO" } });
    return { id: event.id, fileSha256: output.fileSha256 };
  }, { timeoutMs: 60000 });
}

const savedSchema = z.object({ input: bankFileInputSchema, payrollId: z.string(), competence: z.string(), statementIds: z.array(z.string()), fileBase64: z.string(), fileSha256: z.string(), total: z.string(), recipients: z.array(z.object({ statementId: z.string(), registration: z.string(), name: z.string(), bank: z.string(), agency: z.string(), agencyDv: z.string(), account: z.string(), accountDv: z.string(), accountSecondDv: z.string().optional(), net: z.string(), accountSource: z.string() })) });
export async function readBankFile(db: DatabaseExecutor, context: AppContext, eventId: string) {
  const [event] = await db.select().from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.id, eventId), eq(hrIntegrationEvents.eventType, "ARQUIVO_BANCARIO_RH_GERADO"))).limit(1);
  if (!event || hash(stablePersonnelJson(event.payload)) !== event.payloadHash) throw new Error("Arquivo bancário indisponível ou evidência inconsistente.");
  const memory = savedSchema.parse(event.payload);
  await assertPayrollBudgetScope({ ...context, database: db }, memory.payrollId);
  const ids = [...new Set(memory.statementIds)];
  const [{ accessible }] = await db.select({ accessible: count() }).from(hrPayrollStatements).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(and(inArray(hrPayrollStatements.id, ids), accessiblePayrollWhere(context.user)));
  if (accessible !== ids.length) throw new Error("Arquivo contém origem fora do seu acesso.");
  const bytes = Buffer.from(memory.fileBase64, "base64");
  if (hash(bytes) !== memory.fileSha256) throw new Error("Conteúdo do arquivo diverge do hash preservado.");
  return { ...memory, bytes };
}
