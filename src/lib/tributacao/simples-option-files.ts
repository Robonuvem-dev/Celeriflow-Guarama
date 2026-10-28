import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { companies, taxpayers as taxpayerTable } from "@/db/schema/registry";
import { economicRegistrations, taxAssessments } from "@/db/schema/taxation-core";
import { taxActiveDebts } from "@/db/schema/tax-accounting";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { auditTaxFinal, firstTaxFinalRegistryEntry, insertTaxFinalRegistryEntry, latestTaxFinalRegistryEntry, lockTaxFinalKey, readTaxFinalConfirmedPayments, readTaxFinalEntityUnit, requireTaxFinalRecord, taxFinalRegistryPosition } from "@/db/repositories/tax-final-helpers/records";
import { z } from "zod";
import type { TaxFinalHelpersActor as TaxActor } from "@/lib/contracts/tax-final-helpers";
import { taxScopeSnapshot, taxAssessmentCompensatedValue } from "./scope";

type Db = DatabaseExecutor;
export const simplesOptionLayoutSchema = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), expectedVersion: z.number().int().nonnegative(), name: z.string().trim().min(1).max(160), active: z.boolean(), format: z.enum(["DELIMITED", "FIXED"]), delimiter: z.enum([";", "|", ",", "\t"]), cnpjColumn: z.number().int().min(1).max(100), cnpjStart: z.number().int().min(1).max(10000), cnpjLength: z.number().int().min(14).max(20), headerRows: z.number().int().min(0).max(100), footerRows: z.number().int().min(0).max(100), outputDelimiter: z.enum([";", "|", ",", "\t"]), outputHeader: z.string().max(500), approvalTitle: z.string().trim().min(1).max(240), refusalTitle: z.string().trim().min(1).max(240), termText: z.string().trim().min(1).max(12000), legalBasis: z.string().trim().min(1).max(4000) });
async function authorize(db: Db, actor: TaxActor, governmentEntityId: string, budgetUnitId: string) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await readTaxFinalEntityUnit(db, governmentEntityId, budgetUnitId)) throw new Error("Origem não conciliada.");
}
function splitLine(line: string, separator: string) {
  const fields: string[] = []; let value = "", quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') { if (quoted && line[index + 1] === '"') { value += '"'; index++; } else quoted = !quoted; }
    else if (char === separator && !quoted) { fields.push(value); value = ""; }
    else value += char;
  }
  if (quoted) throw new Error("Aspas não encerradas no arquivo."); fields.push(value); return fields;
}
export async function publishSimplesOptionLayout(connection: DatabaseConnection, actor: TaxActor, raw: z.input<typeof simplesOptionLayoutSchema>) {
  const input = simplesOptionLayoutSchema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await authorize(tx, actor, input.governmentEntityId, input.budgetUnitId);
    await lockTaxFinalKey(tx, `SIMPLES_OPTION_LAYOUT:${input.budgetUnitId}`);
    const previous = await latestTaxFinalRegistryEntry(tx, "BUDGET_UNIT", input.budgetUnitId, "SIMPLES_OPTION_LAYOUT");
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("Layout alterado. Recarregue.");
    const row = await insertTaxFinalRegistryEntry(tx, { entityType: "BUDGET_UNIT", entityId: input.budgetUnitId, category: "SIMPLES_OPTION_LAYOUT", title: input.name, version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: { ...input, previousId: previous?.id ?? null } });
    await auditTaxFinal(tx, { action: "PUBLISH_SIMPLES_OPTION_LAYOUT", entityType: "TaxRegistryEntry", entityId: row.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous?.data ?? null, after: row.data } }); return row;
  }, { isolationLevel: "serializable" });
}

export async function importSimplesOptionFile(connection: DatabaseConnection, actor: TaxActor, raw: { governmentEntityId: string; budgetUnitId: string; expectedLayoutVersion: number; filename: string; originalBase64: string; encoding: "utf-8" | "windows-1252" }) {
  const input = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), expectedLayoutVersion: z.number().int().positive(), filename: z.string().trim().min(1).max(240), originalBase64: z.string().min(1).max(3 * 1024 * 1024), encoding: z.enum(["utf-8", "windows-1252"]) }).parse(raw);
  const original = Buffer.from(input.originalBase64, "base64"); if (!original.length || original.length > 2 * 1024 * 1024 || original.toString("base64") !== input.originalBase64) throw new Error("Arquivo inválido ou maior que 2 MB.");
  const content = new TextDecoder(input.encoding, { fatal: true }).decode(original);
  return withDatabaseTransaction(connection, async tx => {
    await authorize(tx, actor, input.governmentEntityId, input.budgetUnitId);
    const layoutEntry = requireTaxFinalRecord(await latestTaxFinalRegistryEntry(tx, "BUDGET_UNIT", input.budgetUnitId, "SIMPLES_OPTION_LAYOUT"), "Layout");
    const layout = simplesOptionLayoutSchema.parse(layoutEntry.data);
    if (!layout.active || layoutEntry.version !== input.expectedLayoutVersion || layout.governmentEntityId !== input.governmentEntityId) throw new Error("Layout inativo, alterado ou de outra origem.");
    const checksum = createHash("sha256").update(original).digest("hex"); const key = `${input.budgetUnitId}:${checksum}:${layoutEntry.id}`;
    await lockTaxFinalKey(tx, `SIMPLES_OPTION_FILE:${key}`);
    const previous = await firstTaxFinalRegistryEntry(tx, and(eq(taxRegistryEntries.entityType, "SIMPLES_OPTION_FILE"), eq(taxRegistryEntries.category, "SIMPLES_OPTION_FILE"), eq(taxRegistryEntries.title, key))!); if (previous) return previous;
    const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/); while (lines.at(-1) === "") lines.pop();
    const dataLines = lines.slice(layout.headerRows, lines.length - layout.footerRows);
    if (!dataLines.length || dataLines.length > 10000) throw new Error("O arquivo deve conter entre 1 e 10.000 empresas.");
    const rows = dataLines.map((line, index) => {
      const value = layout.format === "DELIMITED" ? splitLine(line, layout.delimiter)[layout.cnpjColumn - 1] ?? "" : line.slice(layout.cnpjStart - 1, layout.cnpjStart - 1 + layout.cnpjLength);
      const cnpj = value.replace(/\D/g, ""); if (!/^\d{14}$/.test(cnpj)) throw new Error(`CNPJ inválido na linha ${index + layout.headerRows + 1}.`);
      return { line: index + layout.headerRows + 1, cnpj };
    });
    if (new Set(rows.map(row => row.cnpj)).size !== rows.length) throw new Error("CNPJ repetido no arquivo; confira o layout selecionado.");
    const taxpayers = await tx.select({ id: taxpayerTable.id, status: taxpayerTable.status, company: { cnpj: companies.cnpj, corporateName: companies.corporateName } }).from(taxpayerTable).innerJoin(companies, eq(companies.id, taxpayerTable.companyId)).where(inArray(companies.cnpj, rows.map(row => row.cnpj)));
    const profiles = await tx.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "ECONOMIC_REGISTRATION"), eq(taxRegistryEntries.category, "ECONOMIC_PROFILE"), sql`${taxRegistryEntries.data}->'budgetUnitId' = ${JSON.stringify(input.budgetUnitId)}::jsonb`)).orderBy(desc(taxRegistryEntries.version));
    const latest = new Map<string, typeof profiles[number]>(); for (const row of profiles) if (!latest.has(row.entityId)) latest.set(row.entityId, row);
    const registrationIds = [...latest.values()].filter(row => taxScopeSnapshot(row.data).governmentEntityId === input.governmentEntityId).map(row => row.entityId);
    const registrations = await tx.select({ taxpayerId: economicRegistrations.taxpayerId, status: economicRegistrations.status, municipalInsc: economicRegistrations.municipalInsc }).from(economicRegistrations).where(inArray(economicRegistrations.id, registrationIds));
    const snapshots = [];
    for (const row of rows) {
      const taxpayer = taxpayers.find(item => item.company?.cnpj === row.cnpj);
      const own = taxpayer ? registrations.filter(item => item.taxpayerId === taxpayer.id) : [];
      const pending: string[] = []; let balance = new Decimal(0);
      if (!taxpayer || !own.length) pending.push("CADASTRO_NAO_CONCILIADO");
      else {
        if (taxpayer.status !== "Ativo" || own.every(item => item.status !== "Ativo")) pending.push("SITUACAO_CADASTRAL");
        const assessments = await tx.select().from(taxAssessments).where(and(eq(taxAssessments.taxpayerId, taxpayer.id), notInArray(taxAssessments.status, ["Cancelado", "Extinto"])));
        const reconciledAssessmentIds = new Set<string>();
        for (const assessment of assessments) {
          const origin = taxScopeSnapshot(assessment.calculationSnapshot);
          if (typeof origin.governmentEntityId !== "string" || typeof origin.budgetUnitId !== "string") { pending.push("ORIGEM_DEBITO_NAO_CONCILIADA"); continue; }
          if (origin.governmentEntityId !== input.governmentEntityId) continue;
          if (!await readTaxFinalEntityUnit(tx, origin.governmentEntityId, origin.budgetUnitId)) { pending.push("ORIGEM_DEBITO_NAO_CONCILIADA"); continue; }
          reconciledAssessmentIds.add(assessment.id);
          const total = assessment.finalValueDecimal ?? assessment.originalValueDecimal; if (!total) throw new Error("Crédito sem Decimal conciliado na análise do Simples.");
          const payments = await readTaxFinalConfirmedPayments(tx, assessment.id);
          if (payments.some(payment => !payment.amountPaidDecimal)) throw new Error("Recebimento sem Decimal conciliado na análise do Simples.");
          const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), await taxAssessmentCompensatedValue(tx, assessment.id));
          const remaining = Decimal.max(0, total.minus(paid)); if (remaining.gt(0) && assessment.status !== "Suspenso") balance = balance.plus(remaining);
          if (remaining.gt(0) && assessment.status === "Suspenso") pending.push("CREDITO_SUSPENSO_PARA_ANALISE");
        }
        const debtRows = await tx.select({ debt: taxActiveDebts, assessment: { calculationSnapshot: taxAssessments.calculationSnapshot } }).from(taxActiveDebts).leftJoin(taxAssessments, eq(taxAssessments.id, taxActiveDebts.assessmentId)).where(and(eq(taxActiveDebts.taxpayerId, taxpayer.id), notInArray(taxActiveDebts.status, ["Paga", "PAGA", "Cancelada", "CANCELADA", "BAIXADA", "BAIXADA_PRESCRICAO", "DEVOLVIDA"])));
        const activeDebts = debtRows.map(row => ({ ...row.debt, assessment: row.assessment }));
        for (const debt of activeDebts) {
          const origin = taxScopeSnapshot(debt.assessment?.calculationSnapshot); const entityId = debt.governmentEntityId ?? origin.governmentEntityId; const unitId = debt.budgetUnitId ?? origin.budgetUnitId;
          if (typeof entityId !== "string" || typeof unitId !== "string") { pending.push("ORIGEM_DIVIDA_ATIVA_NAO_CONCILIADA"); continue; }
          if (entityId !== input.governmentEntityId) continue;
          if ((origin.governmentEntityId && origin.governmentEntityId !== entityId) || (origin.budgetUnitId && origin.budgetUnitId !== unitId) || !await readTaxFinalEntityUnit(tx, entityId, unitId)) { pending.push("ORIGEM_DIVIDA_ATIVA_NAO_CONCILIADA"); continue; }
          pending.push("DIVIDA_ATIVA_PARA_ANALISE");
          if (debt.assessmentId && reconciledAssessmentIds.has(debt.assessmentId)) continue;
          if (debt.updatedValueDecimal === null) { pending.push("VALOR_DIVIDA_ATIVA_NAO_CONCILIADO"); continue; }
          balance = balance.plus(Decimal.max(0, debt.updatedValueDecimal));
        }
        if (balance.gt(0)) pending.push("DEBITO_MUNICIPAL");
      }
      snapshots.push({ ...row, taxpayerId: own.length ? taxpayer?.id ?? null : null, name: own.length ? taxpayer?.company?.corporateName ?? row.cnpj : row.cnpj, registrations: own.map(item => item.municipalInsc), balance: balance.toFixed(2), pending: [...new Set(pending)], suggestedDecision: pending.length ? "REFUSED" : "APPROVED" });
    }
    const id = randomUUID();
    const entry = await insertTaxFinalRegistryEntry(tx, { entityType: "SIMPLES_OPTION_FILE", entityId: id, category: "SIMPLES_OPTION_FILE", title: key, actorUsuarioId: actor.usuarioId, data: { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId, filename: input.filename, originalBase64: input.originalBase64, encoding: input.encoding, checksum, layoutId: layoutEntry.id, layout: layoutEntry.data, rows: snapshots, analyzedAt: new Date().toISOString() } });
    const exportRows = snapshots.filter(row => row.pending.length).map(row => [row.cnpj, row.pending.join(","), row.balance].join(layout.outputDelimiter));
    const output = [layout.outputHeader, ...exportRows].filter(Boolean).join("\r\n");
    await insertTaxFinalRegistryEntry(tx, { entityType: "SIMPLES_OPTION_FILE", entityId: id, category: "SIMPLES_OPTION_EXPORT", title: `pendencias-${input.filename}`, actorUsuarioId: actor.usuarioId, data: { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId, sourceId: entry.id, filename: `pendencias-${input.filename}`, content: output, checksum: createHash("sha256").update(output).digest("hex"), layoutId: layoutEntry.id } });
    await auditTaxFinal(tx, { action: "IMPORT_SIMPLES_OPTION_FILE", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { checksum, rows: rows.length, pending: exportRows.length, layoutId: layoutEntry.id } }); return entry;
  }, { isolationLevel: "serializable", timeoutMs: 120000 });
}

export async function decideSimplesOptionCompany(connection: DatabaseConnection, actor: TaxActor, raw: { fileId: string; cnpj: string; expectedVersion: number; approved: boolean; reason: string }) {
  const input = z.object({ fileId: z.string().min(1), cnpj: z.string().regex(/^\d{14}$/), expectedVersion: z.number().int().nonnegative(), approved: z.boolean(), reason: z.string().trim().min(1).max(8000) }).parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const file = requireTaxFinalRecord(await firstTaxFinalRegistryEntry(tx, taxFinalRegistryPosition("SIMPLES_OPTION_FILE", input.fileId, "SIMPLES_OPTION_FILE")), "Arquivo"); const data = taxScopeSnapshot(file.data);
    await authorize(tx, actor, String(data.governmentEntityId), String(data.budgetUnitId));
    if (!Array.isArray(data.rows) || !data.rows.some(row => taxScopeSnapshot(row).cnpj === input.cnpj)) throw new Error("Empresa não consta no arquivo.");
    const key = `${input.fileId}:${input.cnpj}`;
    await lockTaxFinalKey(tx, `SIMPLES_OPTION_DECISION:${key}`);
    const previous = await latestTaxFinalRegistryEntry(tx, "SIMPLES_OPTION_COMPANY", key, "SIMPLES_OPTION_DECISION");
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("Decisão alterada. Recarregue.");
    const entry = await insertTaxFinalRegistryEntry(tx, { entityType: "SIMPLES_OPTION_COMPANY", entityId: key, category: "SIMPLES_OPTION_DECISION", title: input.approved ? "Deferido" : "Indeferido", version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: { governmentEntityId: data.governmentEntityId, budgetUnitId: data.budgetUnitId, fileId: input.fileId, cnpj: input.cnpj, approved: input.approved, reason: input.reason, layout: data.layout, previousId: previous?.id ?? null } });
    await auditTaxFinal(tx, { action: "DECIDE_SIMPLES_OPTION", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous?.data ?? null, after: entry.data } }); return entry;
  }, { isolationLevel: "serializable" });
}
