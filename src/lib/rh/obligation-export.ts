import { createHash } from "node:crypto";
import { and, count, eq, inArray, type SQL } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { hrIntegrationEvents, hrPayrollRuns, hrPayrollStatements, payrolls } from "@/db/schema/personnel-workforce";
import { findHrIntegrationEvent, lockPersonnel } from "@/db/repositories/personnel/integration";
import { requirePayrollRule } from "@/db/repositories/personnel/workforce";
import { z } from "zod";
import { buildObligationHistory, obligationHistoryInputSchema } from "./obligation-history";
import { enqueueHrIntegration } from "./workforce-service";

const fieldPaths = ["competence", "payrollType", "identity.registration", "identity.name", "identity.personId", "identity.cpf", "workLocation", "costCenterId", "regime.code", "totals.gross", "totals.deductions", "totals.net", "totals.employer", "statementId"] as const;
const sourceSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("FIELD"), path: z.enum(fieldPaths) }).strict(), z.object({ type: z.literal("LITERAL"), value: z.string().max(500) }).strict(), z.object({ type: z.literal("RUBRIC"), code: z.string().min(1) }).strict()]);
export const obligationExportPolicySchema = z.object({ origin: z.literal("OBRIGACAO_LAYOUT"), obligation: z.enum(["DIRF", "SEFIP_GFIP", "MANAD", "SIOPE", "TCE", "CADPREV", "CONFERENCIA"]), version: z.string().trim().min(1).max(80), format: z.enum(["CSV", "FIXED_WIDTH"]), legalReference: z.string().trim().min(3), fields: z.array(z.object({ name: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/), source: sourceSchema, required: z.boolean(), width: z.number().int().min(1).max(2000), align: z.enum(["LEFT", "RIGHT"]), pad: z.enum(["SPACE", "ZERO"]), transform: z.enum(["NONE", "COMPETENCIA_AAAAMM", "DIGITOS", "SEM_ACENTOS_MAIUSCULO", "CENTAVOS"]) }).strict()).min(1).max(100) }).strict().superRefine((policy, ctx) => {
  if (new Set(policy.fields.map(row => row.name)).size !== policy.fields.length) ctx.addIssue({ code: "custom", message: "Coluna duplicada no layout." });
});

export function renderObligationExport(history: Awaited<ReturnType<typeof buildObligationHistory>>, raw: unknown) {
  const policy = obligationExportPolicySchema.parse(raw);
  const rows = history.records.map(record => policy.fields.map(field => {
    let value: string;
    if (field.source.type === "LITERAL") value = field.source.value;
    else if (field.source.type === "RUBRIC") {
      const code = field.source.code;
      const matches = record.items.filter(row => row.code === code);
      if (matches.length !== 1) throw new Error(`Rubrica ${code} ausente/duplicada no demonstrativo ${record.statementId}.`);
      value = matches[0].value;
    } else {
      let selected: unknown = record;
      for (const key of field.source.path.split(".")) selected = selected && typeof selected === "object" ? (selected as Record<string, unknown>)[key] : null;
      value = selected === null || selected === undefined ? "" : String(selected);
    }
    if (field.required && !value.trim()) throw new Error(`Campo obrigatório ${field.name} ausente no demonstrativo ${record.statementId}.`);
    if (field.transform === "COMPETENCIA_AAAAMM" && value) {
      if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(value)) throw new Error(`Competência inválida em ${field.name}.`);
      value = value.slice(3) + value.slice(0, 2);
    }
    if (field.transform === "DIGITOS") value = value.replace(/\D/g, "");
    if (field.transform === "SEM_ACENTOS_MAIUSCULO") value = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    if (field.transform === "CENTAVOS" && value) {
      if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) throw new Error(`Valor monetário inválido em ${field.name}.`);
      value = new Decimal(value).mul(100).toFixed(0);
    }
    if (field.required && !value.trim()) throw new Error(`Transformação esvaziou campo obrigatório ${field.name}.`);
    if (/[\r\n\x00]/.test(value)) throw new Error(`Quebra de linha ou NUL em ${field.name}.`);
    if (policy.format === "FIXED_WIDTH") {
      if (/[^\x20-\x7e]/.test(value)) throw new Error(`Layout fixo ASCII exige normalização explícita em ${field.name}.`);
      if (value.length > field.width) throw new Error(`Campo ${field.name} excede largura ${field.width}; truncamento não permitido.`);
      const pad = field.pad === "ZERO" ? "0" : " ";
      value = field.align === "RIGHT" ? value.padStart(field.width, pad) : value.padEnd(field.width, pad);
    }
    return value;
  }));
  const quote = (value: string) => `"${(/^[=+@]/.test(value) || /^-\D/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
  const text = policy.format === "CSV" ? "\uFEFF" + [policy.fields.map(row => row.name), ...rows].map(row => row.map(quote).join(";")).join("\r\n") + "\r\n" : rows.map(row => row.join("")).join("\r\n") + (rows.length ? "\r\n" : "");
  const bytes = Buffer.from(text, "utf8");
  return { bytes, fileSha256: createHash("sha256").update(bytes).digest("hex"), count: rows.length, extension: policy.format === "CSV" ? "csv" : "txt", policy };
}

export async function generateObligationExport(db: DatabaseConnection, actorId: string, raw: unknown, payrollScope?: SQL) {
  const input = obligationHistoryInputSchema.extend({ ruleId: z.string().min(1) }).strict().parse(raw);
  const rule = await requirePayrollRule(db.db, input.ruleId);
  const set = rule.ruleSet;
  if (!rule.isActive || set.status !== "ATIVA" || set.scope !== input.scope || set.effectiveFrom > new Date(Date.UTC(input.year, 0, 1)) || (set.effectiveUntil && set.effectiveUntil < new Date(Date.UTC(input.year, 11, 31)))) throw new Error("Layout ativo deve cobrir o ano/escopo solicitado.");
  if (set.scope === "PRODUCAO" && (set.isDemo || !set.approvedAt || set.approvedAt > new Date() || !set.legalReference)) throw new Error("Exportação de produção exige parâmetros oficiais aprovados.");
  const history = await buildObligationHistory(db, { year: input.year, scope: input.scope }, payrollScope);
  const output = renderObligationExport(history, rule.value);
  const policyHash = createHash("sha256").update(JSON.stringify(output.policy)).digest("hex");
  const sourceKey = `OBRIGACAO:EXPORT:${rule.id}:${history.contentSha256}:${policyHash}`;
  const event = await withDatabaseTransaction(db, async tx => {
    await lockPersonnel(tx, sourceKey);
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) return previous;
    return enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: input.scope, eventType: "OBRIGACAO_ARQUIVO_GERADO", payload: { ruleId: rule.id, policy: output.policy, input, historySha256: history.contentSha256, fileSha256: output.fileSha256, count: output.count, fileBase64: output.bytes.toString("base64"), statementIds: history.records.map(row => row.statementId), officialLayout: false, actorId } });
  }, { timeoutMs: 60000 });
  return { ...output, eventId: event.id, officialLayout: false };
}

export async function readObligationExport(db: DatabaseExecutor, eventId: string, payrollScope?: SQL) {
  const [event] = await db.select().from(hrIntegrationEvents).where(eq(hrIntegrationEvents.id, eventId)).limit(1);
  if (!event) throw new Error("Arquivo de obrigação indisponível.");
  if (event.eventType !== "OBRIGACAO_ARQUIVO_GERADO") throw new Error("Arquivo de obrigação indisponível.");
  const memory = z.object({ policy: obligationExportPolicySchema, input: obligationHistoryInputSchema.extend({ ruleId: z.string() }), fileBase64: z.string(), fileSha256: z.string().regex(/^[a-f0-9]{64}$/), statementIds: z.array(z.string()) }).parse(event.payload);
  const ids = [...new Set(memory.statementIds)];
  const [{ accessible }] = await db.select({ accessible: count() }).from(hrPayrollStatements).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(and(inArray(hrPayrollStatements.id, ids), payrollScope));
  if (accessible !== ids.length) throw new Error("Arquivo contém folha fora do acesso orçamentário.");
  const bytes = Buffer.from(memory.fileBase64, "base64");
  if (createHash("sha256").update(bytes).digest("hex") !== memory.fileSha256) throw new Error("Hash do arquivo preservado diverge da evidência.");
  return { bytes, policy: memory.policy, year: memory.input.year, fileSha256: memory.fileSha256, extension: memory.policy.format === "CSV" ? "csv" : "txt" };
}
