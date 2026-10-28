import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { JsonObject } from "@/db/json";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { planningBudgetUnits, planningInstruments, planningLines } from "@/db/schema/planning-budget";
import { planningActions, planningCatalogEntries, planningCatalogVersions, planningExpenseNatures, planningInstrumentSources, planningPrograms, planningResourceSources, planningRevenueNatures } from "@/db/schema/planning-legal";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { planningConnection } from "./database";
import { z } from "zod";
import { assertPlanningLegalAuthority, assertPlanningOperation, type PlanningContext } from "./access";
import { contentHash, jsonValue } from "./operations-core";

export function parsePlanningCatalogCsv(text: string) {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') { if (quoted && text[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted; }
    else if (!quoted && char === ";") { row.push(cell.trim()); cell = ""; }
    else if (!quoted && char === "\n") { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else if (char !== "\r" || quoted) cell += char;
  }
  if (quoted) throw new Error("Aspas não encerradas no CSV.");
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, ""));
  if (!headers || ["kind", "code", "name", "degree"].some((header) => !headers.includes(header)) || new Set(headers).size !== headers.length) throw new Error("CSV exige cabeçalhos kind;code;name;degree;parentCode;tceCode;stnGroup;stnSpecification;stnDetail.");
  const schema = z.object({ kind: z.enum(["SOURCE", "REVENUE", "EXPENSE"]), code: z.string().min(1).max(60), name: z.string().min(1).max(200), degree: z.coerce.number().int().min(1).max(10), parentCode: z.string().default(""), tceCode: z.string().default(""), stnGroup: z.string().default(""), stnSpecification: z.string().default(""), stnDetail: z.string().default(""), shortCode: z.string().default("") });
  const parsed = rows.map((values, index) => { if (values.length !== headers.length) throw new Error(`Quantidade de colunas divergente na linha ${index + 2}.`); return schema.parse(Object.fromEntries(headers.map((header, position) => [header, values[position]]))); });
  if (!parsed.length || parsed.length > 20000) throw new Error("Informe de uma a vinte mil classificações por versão.");
  const keys = new Set<string>();
  const parents = new Map(parsed.map((item) => [`${item.kind}:${item.code}`, item]));
  for (const item of parsed) {
    const key = `${item.kind}:${item.code}`;
    if (keys.has(key)) throw new Error(`Classificação duplicada: ${key}.`); keys.add(key);
    if (item.kind === "SOURCE" && (!item.tceCode || !item.stnGroup || !item.stnSpecification || !item.stnDetail)) throw new Error(`Complete os campos TCE/STN da fonte ${item.code}.`);
    if (item.parentCode) { const parent = parents.get(`${item.kind}:${item.parentCode}`); if (!parent || parent.degree >= item.degree) throw new Error(`Pai ausente ou grau inconsistente em ${key}.`); }
  }
  return parsed;
}

export async function importPlanningCatalogVersion(context: PlanningContext, raw: unknown) {
  assertPlanningOperation(context, "update");
  const input = z.object({ year: z.coerce.number().int().min(1900).max(2200), label: z.string().trim().min(3), normativeReference: z.string().trim().min(3), csv: z.string().min(1).max(8 * 1024 * 1024) }).parse(raw);
  const rows = parsePlanningCatalogCsv(input.csv);
  const sourceHash = createHash("sha256").update(input.csv).digest("hex");
  return withDatabaseTransaction(planningConnection(context), async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PlanningCatalog:${input.year}:${sourceHash}`}))`);
    const [previous] = await tx.select().from(planningCatalogVersions).where(and(eq(planningCatalogVersions.year, input.year), eq(planningCatalogVersions.sourceHash, sourceHash))).limit(1);
    if (previous) { if (previous.normativeReference !== input.normativeReference || previous.label !== input.label) throw new Error("Arquivo já importado com outra referência/identificação."); return previous.id; }
    const [version] = await tx.insert(planningCatalogVersions).values({ year: input.year, label: input.label, normativeReference: input.normativeReference, sourceHash, createdById: context.user.id }).returning();
    for (const kind of ["SOURCE", "REVENUE", "EXPENSE"] as const) {
      const selected = rows.filter((row) => row.kind === kind);
      for (let offset = 0; offset < selected.length; offset += 500) {
        const batch = selected.slice(offset, offset + 500);
        if (kind === "SOURCE") await tx.insert(planningResourceSources).values(batch.map(row => ({ code: row.code, name: row.name, tceCode: row.tceCode, stnGroup: row.stnGroup, stnSpecification: row.stnSpecification, stnDetail: row.stnDetail, referenceYear: input.year }))).onConflictDoNothing();
        else if (kind === "REVENUE") await tx.insert(planningRevenueNatures).values(batch.map(row => ({ code: row.code, name: row.name, degree: row.degree, shortCode: row.shortCode || undefined, referenceYear: input.year }))).onConflictDoNothing();
        else await tx.insert(planningExpenseNatures).values(batch.map(row => ({ code: row.code, name: row.name }))).onConflictDoNothing();
      }
      const codes = selected.map(row => row.code);
      const canonical = kind === "SOURCE" ? await tx.select({ id: planningResourceSources.id, code: planningResourceSources.code }).from(planningResourceSources).where(inArray(planningResourceSources.code, codes)) : kind === "REVENUE" ? await tx.select({ id: planningRevenueNatures.id, code: planningRevenueNatures.code }).from(planningRevenueNatures).where(inArray(planningRevenueNatures.code, codes)) : await tx.select({ id: planningExpenseNatures.id, code: planningExpenseNatures.code }).from(planningExpenseNatures).where(inArray(planningExpenseNatures.code, codes));
      const ids = new Map(canonical.map((row) => [row.code, row.id]));
      for (let offset = 0; offset < selected.length; offset += 500) await tx.insert(planningCatalogEntries).values(selected.slice(offset, offset + 500).map(row => ({ versionId: version.id, kind: row.kind, code: row.code, name: row.name, parentCode: row.parentCode || null, degree: row.degree, canonicalId: ids.get(row.code)!, attributes: jsonValue(row) })));
    }
    await tx.insert(financialAuditLogs).values({ action: "PLANNING_CATALOG_IMPORT", entityType: "PLANNING_CATALOG", entityId: version.id, authorUsuarioId: context.user.id, payload: { year: input.year, sourceHash, count: rows.length, normativeReference: input.normativeReference } });
    return version.id;
  }, { timeoutMs: 120000 });
}

export async function publishPlanningCatalogVersion(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  const input = z.object({ versionId: z.string().min(1) }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async tx => {
    const [version] = await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, input.versionId)).for("update");
    if (!version) throw new Error("Versão de catálogo não encontrada.");
    const entries = await tx.select().from(planningCatalogEntries).where(eq(planningCatalogEntries.versionId, version.id));
    if (version.status === "PUBLISHED") return version.id;
    if (!entries.length) throw new Error("Versão sem classificações.");
    if (entries.some(entry => entry.canonicalId.startsWith("UNMAPPED:"))) throw new Error("Conclua o de-para aos cadastros canônicos antes de publicar o catálogo oficial.");
    await tx.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, version.id));
    await tx.insert(financialAuditLogs).values({ action: "PLANNING_CATALOG_PUBLISH", entityType: "PLANNING_CATALOG", entityId: version.id, authorUsuarioId: context.user.id, payload: { sourceHash: version.sourceHash, rowsHash: contentHash(entries), normativeReference: version.normativeReference } });
    return version.id;
  });
}

export async function planningLineClassification(tx: DatabaseTransaction, piece: { id: string; kind: string; startYear: number; endYear: number; catalogVersionId: string | null }, line: { year: number; resourceSourceId: string; revenueNatureId?: string | null; expenseNatureId?: string | null }) {
  if (!piece.catalogVersionId) { await tx.insert(planningInstrumentSources).values({ instrumentId: piece.id, resourceSourceId: line.resourceSourceId }).onConflictDoNothing({ target: [planningInstrumentSources.instrumentId, planningInstrumentSources.resourceSourceId] }); return null; }
  const [version] = await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, piece.catalogVersionId)).limit(1);
  if (!version) throw new Error("Versão de catálogo não encontrada.");
  if (version.status !== "PUBLISHED" || version.year < piece.startYear || version.year > piece.endYear) throw new Error("Selecione catálogo publicado e vigente na peça.");
  const [owner] = await tx.select({ governmentEntityId: planningInstruments.governmentEntityId }).from(planningInstruments).where(eq(planningInstruments.id, piece.id)).limit(1);
  if (!owner) throw new Error("Peça orçamentária não encontrada.");
  const entry = async (kind: string, id?: string | null) => {
    if (!id) return null;
    const [found] = await tx.select().from(planningCatalogEntries).where(and(eq(planningCatalogEntries.versionId, version.id), eq(planningCatalogEntries.kind, kind), eq(planningCatalogEntries.canonicalId, id))).limit(1);
    if (!found) throw new Error(`Classificação ${kind} ausente na versão selecionada.`);
    const attributes = found.attributes as JsonObject;
    if (attributes.governmentEntityId && attributes.governmentEntityId !== owner.governmentEntityId) throw new Error("Classificação municipal pertence a outro ente.");
    if (attributes.budgetUnitId && (!("budgetUnitId" in line) || attributes.budgetUnitId !== line.budgetUnitId)) throw new Error("Classificação municipal exige a UG da edição adotada.");
    if (attributes.pocOnly === true && process.env.CELERIFLOW_ACCOUNTING_MODE !== "POC") throw new Error("Classificação de ensaio não pode ser utilizada na peça municipal.");
    return found;
  };
  const source = (await entry("SOURCE", line.resourceSourceId))!;
  await tx.insert(planningInstrumentSources).values({ instrumentId: piece.id, resourceSourceId: line.resourceSourceId, catalogEntryId: source.id }).onConflictDoNothing({ target: [planningInstrumentSources.instrumentId, planningInstrumentSources.resourceSourceId] });
  const revenue = await entry("REVENUE", line.revenueNatureId), expense = await entry("EXPENSE", line.expenseNatureId);
  const tree = [];
  for (const selected of [revenue, expense]) {
    let node = selected;
    const visited = new Set<string>();
    while (node) {
      if (visited.has(node.id)) throw new Error("Ciclo na hierarquia de classificações; concilie a árvore da edição.");
      visited.add(node.id);
      tree.push({ kind: node.kind, code: node.code, parentCode: node.parentCode, degree: node.degree, name: node.name });
      if (node.parentCode) { const [parent] = await tx.select().from(planningCatalogEntries).where(and(eq(planningCatalogEntries.versionId, version.id), eq(planningCatalogEntries.kind, node.kind), eq(planningCatalogEntries.code, node.parentCode))).limit(1); if (!parent) throw new Error("Pai da classificação não encontrado."); node = parent; } else node = null;
    }
  }
  return jsonValue({ versionId: version.id, year: version.year, normativeReference: version.normativeReference, sourceHash: version.sourceHash, source, revenue, expense, tree });
}

export async function automaticPlanningReducedCode(tx: DatabaseTransaction, instrumentId: string, input: { kind: string; year: number; budgetUnitId: string; programId?: string | null; actionId?: string | null; functionCode?: string | null; subfunctionCode?: string | null }) {
  if (input.kind !== "EXPENSE") return null;
  const [unit, program, action] = await Promise.all([tx.select({ code: planningBudgetUnits.code }).from(planningBudgetUnits).where(eq(planningBudgetUnits.id, input.budgetUnitId)).limit(1).then(rows => rows[0]), tx.select({ code: planningPrograms.code }).from(planningPrograms).where(eq(planningPrograms.id, input.programId!)).limit(1).then(rows => rows[0]), tx.select({ code: planningActions.code }).from(planningActions).where(eq(planningActions.id, input.actionId!)).limit(1).then(rows => rows[0])]);
  if (!unit || !program || !action) throw new Error("Classificação funcional não encontrada.");
  const base = `${unit.code}.${input.functionCode}.${input.subfunctionCode}.${program.code}.${action.code}.${input.year}`;
  const existing = await tx.select({ reducedCode: planningLines.reducedCode }).from(planningLines).where(and(eq(planningLines.instrumentId, instrumentId), sql`starts_with(${planningLines.reducedCode}, ${`${base}.`})`));
  let suffix = 1; while (existing.some((line) => line.reducedCode === `${base}.${String(suffix).padStart(3, "0")}`)) suffix++;
  return `${base}.${String(suffix).padStart(3, "0")}`;
}
