import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
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
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PlanningCatalog:${input.year}:${sourceHash}`}))`;
    const previous = await tx.planningCatalogVersion.findUnique({ where: { year_sourceHash: { year: input.year, sourceHash } } });
    if (previous) { if (previous.normativeReference !== input.normativeReference || previous.label !== input.label) throw new Error("Arquivo já importado com outra referência/identificação."); return previous.id; }
    const version = await tx.planningCatalogVersion.create({ data: { year: input.year, label: input.label, normativeReference: input.normativeReference, sourceHash, createdById: context.user.id } });
    for (const kind of ["SOURCE", "REVENUE", "EXPENSE"] as const) {
      const selected = rows.filter((row) => row.kind === kind);
      for (let offset = 0; offset < selected.length; offset += 500) {
        const batch = selected.slice(offset, offset + 500);
        if (kind === "SOURCE") await tx.resourceSource.createMany({ skipDuplicates: true, data: batch.map((row) => ({ code: row.code, name: row.name, tceCode: row.tceCode, stnGroup: row.stnGroup, stnSpecification: row.stnSpecification, stnDetail: row.stnDetail, referenceYear: input.year })) });
        else if (kind === "REVENUE") await tx.revenueNature.createMany({ skipDuplicates: true, data: batch.map((row) => ({ code: row.code, name: row.name, degree: row.degree, shortCode: row.shortCode || undefined, referenceYear: input.year })) });
        else await tx.expenseNature.createMany({ skipDuplicates: true, data: batch.map((row) => ({ code: row.code, name: row.name })) });
      }
      const where = { code: { in: selected.map((row) => row.code) } }; const select = { id: true, code: true };
      const canonical = kind === "SOURCE" ? await tx.resourceSource.findMany({ where, select }) : kind === "REVENUE" ? await tx.revenueNature.findMany({ where, select }) : await tx.expenseNature.findMany({ where, select });
      const ids = new Map(canonical.map((row) => [row.code, row.id]));
      for (let offset = 0; offset < selected.length; offset += 500) await tx.planningCatalogEntry.createMany({ data: selected.slice(offset, offset + 500).map((row) => ({ versionId: version.id, kind: row.kind, code: row.code, name: row.name, parentCode: row.parentCode || null, degree: row.degree, canonicalId: ids.get(row.code)!, attributes: jsonValue(row) })) });
    }
    await tx.financialAuditLog.create({ data: { action: "PLANNING_CATALOG_IMPORT", entityType: "PLANNING_CATALOG", entityId: version.id, authorUsuarioId: context.user.id, payload: { year: input.year, sourceHash, count: rows.length, normativeReference: input.normativeReference } } });
    return version.id;
  }, { timeout: 120000 });
}

export async function publishPlanningCatalogVersion(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  const input = z.object({ versionId: z.string().min(1) }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PlanningCatalogVersion" WHERE id=${input.versionId} FOR UPDATE`;
    const version = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: input.versionId }, include: { entries: true } });
    if (version.status === "PUBLISHED") return version.id;
    if (!version.entries.length) throw new Error("Versão sem classificações.");
    if (version.entries.some((entry) => entry.canonicalId.startsWith("UNMAPPED:"))) throw new Error("Conclua o de-para aos cadastros canônicos antes de publicar o catálogo oficial.");
    await tx.planningCatalogVersion.update({ where: { id: version.id }, data: { status: "PUBLISHED" } });
    await tx.financialAuditLog.create({ data: { action: "PLANNING_CATALOG_PUBLISH", entityType: "PLANNING_CATALOG", entityId: version.id, authorUsuarioId: context.user.id, payload: { sourceHash: version.sourceHash, rowsHash: contentHash(version.entries), normativeReference: version.normativeReference } } });
    return version.id;
  });
}

export async function planningLineClassification(tx: Prisma.TransactionClient, piece: { id: string; kind: string; startYear: number; endYear: number; catalogVersionId: string | null }, line: { year: number; resourceSourceId: string; revenueNatureId?: string | null; expenseNatureId?: string | null }) {
  if (!piece.catalogVersionId) { await tx.planningInstrumentSource.upsert({ where: { instrumentId_resourceSourceId: { instrumentId: piece.id, resourceSourceId: line.resourceSourceId } }, create: { instrumentId: piece.id, resourceSourceId: line.resourceSourceId }, update: {} }); return null; }
  const version = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: piece.catalogVersionId } });
  if (version.status !== "PUBLISHED" || version.year < piece.startYear || version.year > piece.endYear) throw new Error("Selecione catálogo publicado e vigente na peça.");
  const owner = await tx.planningInstrument.findUniqueOrThrow({ where: { id: piece.id }, select: { governmentEntityId: true } });
  const entry = async (kind: string, id?: string | null) => {
    if (!id) return null;
    const found = await tx.planningCatalogEntry.findUnique({ where: { versionId_kind_canonicalId: { versionId: version.id, kind, canonicalId: id } } });
    if (!found) throw new Error(`Classificação ${kind} ausente na versão selecionada.`);
    const attributes = found.attributes as Prisma.JsonObject;
    if (attributes.governmentEntityId && attributes.governmentEntityId !== owner.governmentEntityId) throw new Error("Classificação municipal pertence a outro ente.");
    if (attributes.budgetUnitId && (!("budgetUnitId" in line) || attributes.budgetUnitId !== line.budgetUnitId)) throw new Error("Classificação municipal exige a UG da edição adotada.");
    if (attributes.pocOnly === true && process.env.CELERIFLOW_ACCOUNTING_MODE !== "POC") throw new Error("Classificação de ensaio não pode ser utilizada na peça municipal.");
    return found;
  };
  const source = (await entry("SOURCE", line.resourceSourceId))!;
  await tx.planningInstrumentSource.upsert({ where: { instrumentId_resourceSourceId: { instrumentId: piece.id, resourceSourceId: line.resourceSourceId } }, create: { instrumentId: piece.id, resourceSourceId: line.resourceSourceId, catalogEntryId: source.id }, update: {} });
  const revenue = await entry("REVENUE", line.revenueNatureId), expense = await entry("EXPENSE", line.expenseNatureId);
  const tree = [];
  for (const selected of [revenue, expense]) {
    let node = selected;
    const visited = new Set<string>();
    while (node) {
      if (visited.has(node.id)) throw new Error("Ciclo na hierarquia de classificações; concilie a árvore da edição.");
      visited.add(node.id);
      tree.push({ kind: node.kind, code: node.code, parentCode: node.parentCode, degree: node.degree, name: node.name });
      node = node.parentCode ? await tx.planningCatalogEntry.findUniqueOrThrow({ where: { versionId_kind_code: { versionId: version.id, kind: node.kind, code: node.parentCode } } }) : null;
    }
  }
  return jsonValue({ versionId: version.id, year: version.year, normativeReference: version.normativeReference, sourceHash: version.sourceHash, source, revenue, expense, tree });
}

export async function automaticPlanningReducedCode(tx: Prisma.TransactionClient, instrumentId: string, input: { kind: string; year: number; budgetUnitId: string; programId?: string | null; actionId?: string | null; functionCode?: string | null; subfunctionCode?: string | null }) {
  if (input.kind !== "EXPENSE") return null;
  const [unit, program, action] = await Promise.all([tx.budgetUnit.findUniqueOrThrow({ where: { id: input.budgetUnitId }, select: { code: true } }), tx.programPPA.findUniqueOrThrow({ where: { id: input.programId! }, select: { code: true } }), tx.actionPPA.findUniqueOrThrow({ where: { id: input.actionId! }, select: { code: true } })]);
  const base = `${unit.code}.${input.functionCode}.${input.subfunctionCode}.${program.code}.${action.code}.${input.year}`;
  const existing = await tx.planningBudgetLine.findMany({ where: { instrumentId, reducedCode: { startsWith: `${base}.` } }, select: { reducedCode: true } });
  let suffix = 1; while (existing.some((line) => line.reducedCode === `${base}.${String(suffix).padStart(3, "0")}`)) suffix++;
  return `${base}.${String(suffix).padStart(3, "0")}`;
}
