import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import type { JsonObject, JsonValue } from "@/db/json";
import { planningCatalogEntries, planningCatalogVersions, planningEntityUnits } from "@/db/schema/planning-catalog";
import { governmentEntities } from "@/db/schema/master-data";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { findMscCanonical, findMscCatalogVersion, hasMscAccountChildren, listMscPublishedEntries, readMscCatalogEntry, readMscFinancialYear, readMscUnitBinding } from "@/db/repositories/finance/msc-configuration";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";

export const mscReference2026Hash = "a260f4fafb40d8d19c91113237c8249a619eed815d5fcc0fb6bd2c6cf0482c37";
const normalizedCaptureHash = "8919bc6ffe4448aa0775da66f0e3af98c965f5d9792a9b47e4a77dfa467286cd";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const object = (value: JsonValue): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const informationType = z.enum(["PO", "FP", "DC", "FR", "CO", "NR", "ND", "FS", "AI"]);
const dictionaryEntry = z.object({ code: z.string(), name: z.string(), sourceRow: z.number().int().positive() });
const referenceSchema = z.object({ year: z.literal(2026), sourceHash: z.literal(mscReference2026Hash), sourceUrl: z.string().url(), publishedRevision: z.literal("2026-07-08"), informationPairs: z.literal(6), accounts: z.array(z.object({ code: z.string().regex(/^[1-8]\d{8}$/), name: z.string(), balanceNature: z.string(), financialAttribute: z.string(), informationTypes: z.array(informationType).max(6), sourceRow: z.number().int(), layoutRow: z.number().int() })).length(6119), dictionaries: z.object({ PO: z.array(dictionaryEntry), FR_GROUP: z.array(dictionaryEntry), CO: z.array(dictionaryEntry), NR: z.array(dictionaryEntry), ND: z.array(dictionaryEntry), FUNCTION: z.array(dictionaryEntry), SUBFUNCTION: z.array(dictionaryEntry) }) });

function assertConfigurationAccess(context: AppContext) {
  if (!canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new AccessError("Configurar a MSC exige alteração autorizada no Financeiro.", 403);
}

/** Captures only the verified official derivation; it does not adopt accounts or alter balances. */
export async function captureMscReference2026(connection: DatabaseConnection, context: AppContext, sourceContents: string) {
  assertConfigurationAccess(context);
  if (Buffer.byteLength(sourceContents, "utf8") > 8 * 1024 * 1024) throw new Error("Captura MSC excede 8 MB.");
  const normalized = sourceContents.replaceAll("\r\n", "\n");
  if (hash(normalized) !== normalizedCaptureHash) throw new Error("Capture a derivação oficial MSC_STN_2026_20260708.json preservada no projeto; conteúdo divergente não será publicado.");
  const reference = referenceSchema.parse(JSON.parse(normalized));
  const id = "msc-reference:stn:2026:20260708";
  const rows: (typeof planningCatalogEntries.$inferInsert)[] = [];
  const add = (kind: string, code: string, name: string, attributes: JsonObject) => rows.push({ id: `${id}:${kind}:${code}`, versionId: id, kind: `MSC_${kind}`, canonicalId: `UNMAPPED:MSC:${kind}:${code}`, code, name, degree: 1, attributes: { ...attributes, sourceHash: reference.sourceHash, authority: "STN_SICONFI", captured: true, operational: false } });
  for (const account of reference.accounts) add("ACCOUNT", account.code, account.name, { informationTypes: account.informationTypes, balanceNature: account.balanceNature, financialAttribute: account.financialAttribute, sourceRow: account.sourceRow, layoutRow: account.layoutRow });
  for (const type of ["PO", "CO", "NR", "ND", "FUNCTION", "SUBFUNCTION"] as const) for (const entry of reference.dictionaries[type]) add(type, entry.code, entry.name, { sourceRow: entry.sourceRow });
  for (const prefix of ["1", "2", "9"]) for (const entry of reference.dictionaries.FR_GROUP) add("FR", prefix + entry.code, `${prefix === "1" ? "Exercício corrente" : prefix === "2" ? "Exercícios anteriores" : "Recursos condicionados"} · ${entry.name}`, { sourceRow: entry.sourceRow, resourceYearType: prefix, resourceGroup: entry.code });
  add("FP", "1", "Financeiro", {}); add("FP", "2", "Permanente", {}); add("DC", "1", "Não compõe a dívida consolidada", {});
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("Captura contém referência duplicada.");
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))::text`);
    const prior = await findMscCatalogVersion(tx, id);
    if (prior) {
      if (prior.sourceHash !== reference.sourceHash || prior.status !== "PUBLISHED" || prior._count.entries !== rows.length) throw new Error("Referência MSC existente diverge da captura preservada.");
      return prior.id;
    }
    await tx.insert(planningCatalogVersions).values({ id, year: 2026, label: "STN MSC 2026 · revisão 08/07/2026", normativeReference: `${reference.sourceUrl}; Anexo II da Portaria STN 642/2019, revisão ${reference.publishedRevision}. Captura de referência, sem adoção municipal.`, sourceHash: reference.sourceHash, status: "DRAFT", createdById: context.user.id });
    for (let offset = 0; offset < rows.length; offset += 300) await tx.insert(planningCatalogEntries).values(rows.slice(offset, offset + 300));
    await tx.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, id));
    await tx.insert(financialAuditLogs).values({ action: "MSC_REFERENCE_CAPTURE", entityType: "PlanningCatalogVersion", entityId: id, authorUsuarioId: context.user.id, payload: { sourceHash: reference.sourceHash, normalizedCaptureHash, rows: rows.length, operational: false } });
    return id;
  }, { timeoutMs: 60000 });
}

const optionalId = z.preprocess(value => value === "" ? undefined : value, z.string().trim().min(1).optional());
export const mscMappingInput = z.object({
  kind: z.enum(["ACCOUNT", "SOURCE", "REVENUE", "EXPENSE"]), canonicalId: z.string().trim().min(1), referenceEntryId: z.string().trim().min(1),
  governmentEntityId: z.string().trim().min(1), budgetUnitId: z.string().trim().min(1), financialYearId: z.string().trim().min(1),
  effectiveFrom: z.iso.date(), effectiveUntil: z.iso.date(), predecessorEntryId: optionalId,
  poEntryId: optionalId, fpEntryId: optionalId, dcEntryId: optionalId, coEntryId: optionalId,
  omitCo: z.boolean().default(false), omitDc: z.boolean().default(false), reason: z.string().trim().min(10).max(4000),
}).strict();

/** Additive per-UG editions leave both official references and earlier mappings intact. */
export async function configureMscMapping(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  assertConfigurationAccess(context);
  const input = mscMappingInput.parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return withDatabaseTransaction(connection, async tx => {
    const year = await readMscFinancialYear(tx, input.financialYearId);
    const binding = await readMscUnitBinding(tx, input.budgetUnitId);
    if (year.governmentEntityId !== input.governmentEntityId || binding.governmentEntityId !== input.governmentEntityId) throw new Error("Exercício, ente e UG devem coincidir na configuração MSC.");
    if (input.effectiveFrom > input.effectiveUntil || Number(input.effectiveFrom.slice(0, 4)) !== year.year || Number(input.effectiveUntil.slice(0, 4)) !== year.year) throw new Error("Vigência MSC deve pertencer ao exercício selecionado.");
    const canonical = await findMscCanonical(tx, input.kind, input.canonicalId);
    if (!canonical) throw new Error("Cadastro canônico não encontrado para o tipo selecionado.");
    if (input.kind === "ACCOUNT" && await hasMscAccountChildren(tx, canonical.code)) throw new Error("De-para MSC exige conta contábil analítica.");
    const target = await readMscCatalogEntry(tx, input.referenceEntryId);
    const targetKind = input.kind === "SOURCE" ? "FR" : input.kind === "REVENUE" ? "NR" : input.kind === "EXPENSE" ? "ND" : "ACCOUNT";
    if (target.kind !== `MSC_${targetKind}` || target.version.year !== year.year || target.version.sourceHash !== mscReference2026Hash || object(target.attributes).sourceHash !== target.version.sourceHash) throw new Error("Selecione referência oficial MSC do tipo e exercício correspondentes.");
    const fixed: Record<string, string> = {};
    const allowed = input.kind === "ACCOUNT" ? z.array(informationType).parse(object(target.attributes).informationTypes) : [];
    for (const [type, id] of [["PO", input.poEntryId], ["FP", input.fpEntryId], ["DC", input.dcEntryId], ["CO", input.coEntryId]] as const) {
      if (!id) continue;
      if (input.kind !== "ACCOUNT" || !allowed.includes(type)) throw new Error(`A conta não admite a informação ${type}.`);
      const reference = await readMscCatalogEntry(tx, id);
      if (reference.kind !== `MSC_${type}` || reference.version.year !== year.year || reference.version.sourceHash !== target.version.sourceHash) throw new Error(`Referência de ${type} incompatível com o leiaute.`);
      fixed[type] = reference.code;
    }
    const omitted: string[] = [];
    const financialAttribute = object(target.attributes).financialAttribute;
    if (fixed.FP && (financialAttribute === "Financeiro" && fixed.FP !== "1" || financialAttribute === "Permanente" && fixed.FP !== "2")) throw new Error("FP selecionado diverge do atributo admitido pela conta oficial.");
    if (fixed.PO && (binding.governmentEntity.type === "CAMARA" ? fixed.PO !== "20231" : binding.governmentEntity.type === "PREFEITURA" ? !["10131", "10132"].includes(fixed.PO) : !["10131", "10132", "20231"].includes(fixed.PO))) throw new Error("Poder/Órgão selecionado não corresponde ao alcance municipal do ente/UG.");
    for (const [type, omit] of [["CO", input.omitCo], ["DC", input.omitDc]] as const) {
      if (!omit) continue;
      if (!allowed.includes(type) || fixed[type]) throw new Error(`Declare ausência fundamentada de ${type} somente quando a conta o admite e não há código selecionado.`);
      omitted.push(type);
    }
    if (input.kind === "ACCOUNT" && (allowed.includes("PO") && !fixed.PO || allowed.includes("FP") && !fixed.FP)) throw new Error("Selecione Poder/Órgão e atributo Financeiro/Permanente exigidos pela conta.");
    if (input.kind === "ACCOUNT" && allowed.includes("CO") && !fixed.CO && !input.omitCo) throw new Error("Informe CO ou declare sua não aplicação fundamentada.");
    if (input.kind === "ACCOUNT" && allowed.includes("DC") && !fixed.DC && !input.omitDc) throw new Error("Informe o marcador DC ou declare sua não aplicação fundamentada.");
    const mappingHash = hash(JSON.stringify({ ...input, targetCode: target.code, referenceHash: target.version.sourceHash }));
    const versionId = `msc-mapping:${mappingHash}`, entryId = `${versionId}:entry`, kind = `MSC_MAPPING_${input.kind}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`MSC_MAPPING:${input.governmentEntityId}:${input.budgetUnitId}:${year.year}:${kind}:${input.canonicalId}`}, 0))::text`);
    const prior = await findMscCatalogVersion(tx, versionId);
    if (prior) { if (prior.sourceHash !== mappingHash || prior.status !== "PUBLISHED" || prior._count.entries !== 1) throw new Error("Edição MSC persistida divergente."); return entryId; }
    const candidates = await listMscPublishedEntries(tx, { kind, canonicalId: input.canonicalId, year: year.year, governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId });
    const overlaps = candidates.filter(entry => { const attrs = object(entry.attributes); return typeof attrs.effectiveFrom === "string" && typeof attrs.effectiveUntil === "string" && attrs.effectiveFrom <= input.effectiveUntil && attrs.effectiveUntil >= input.effectiveFrom; });
    const replaced = new Set(overlaps.map(entry => object(entry.attributes).predecessorEntryId));
    const current = overlaps.filter(entry => !replaced.has(entry.id));
    if (input.predecessorEntryId) {
      if (current.length !== 1 || current[0].id !== input.predecessorEntryId || input.effectiveFrom <= String(object(current[0].attributes).effectiveFrom) || input.effectiveUntil > String(object(current[0].attributes).effectiveUntil)) throw new Error("Sucessão MSC exige a edição vigente, data posterior e vigência contida na original.");
    } else if (current.length) throw new Error("De-para MSC sobreposto; selecione a edição predecessora.");
    await tx.insert(planningCatalogVersions).values({ id: versionId, year: year.year, label: `MSC · ${canonical.code} → ${target.code} · UG ${input.budgetUnitId}`, normativeReference: input.reason, sourceHash: mappingHash, status: "DRAFT", createdById: context.user.id });
    await tx.insert(planningCatalogEntries).values({ versionId, id: entryId, kind, canonicalId: input.canonicalId, code: target.code, name: target.name, degree: 1, attributes: { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, predecessorEntryId: input.predecessorEntryId ?? null, referenceEntryId: target.id, referenceVersionId: target.versionId, referenceHash: target.version.sourceHash, informationTypes: allowed, fixedInformation: fixed, omittedInformationTypes: omitted, informationPairs: 6, decision: input.reason, operational: true } });
    await tx.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, versionId));
    await tx.insert(financialAuditLogs).values({ action: "MSC_MAPPING_PUBLISHED", entityType: "PlanningCatalogEntry", entityId: entryId, authorUsuarioId: context.user.id, financialYearId: input.financialYearId, payload: { ...input, mappingHash, referenceHash: target.version.sourceHash, fixedInformation: fixed, omittedInformationTypes: omitted } });
    return entryId;
  }, { timeoutMs: 60000 });
}

/** Defines the Executive's reporting perimeter explicitly; organizational links are never inferred by name. */
export async function configureMscReportingScope(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  assertConfigurationAccess(context);
  const input = z.object({ governmentEntityId: z.string().min(1), financialYearId: z.string().min(1), institutionCode: z.string().regex(/^\d{7}EX$/), entityIds: z.array(z.string().min(1)).min(1).max(50), predecessorEntryId: optionalId, reason: z.string().trim().min(10).max(4000) }).strict().parse(raw);
  input.entityIds = [...new Set(input.entityIds)].sort();
  if (!input.entityIds.includes(input.governmentEntityId)) throw new Error("O perímetro deve incluir o Executivo responsável pelo envio.");
  return withDatabaseTransaction(connection, async tx => {
    const year = await readMscFinancialYear(tx, input.financialYearId);
    const entities = await tx.select({ id: governmentEntities.id, type: governmentEntities.type, parentId: governmentEntities.parentId }).from(governmentEntities).where(inArray(governmentEntities.id, input.entityIds));
    const executive = entities.find(entity => entity.id === input.governmentEntityId);
    if (year.governmentEntityId !== input.governmentEntityId || executive?.type !== "PREFEITURA" || entities.length !== input.entityIds.length || entities.some(entity => entity.id !== executive.id && entity.parentId !== executive.id)) throw new Error("O perímetro exige Prefeitura e órgãos/poderes vinculados documentalmente ao mesmo Executivo no cadastro de entidades.");
    const related = await tx.select({ id: governmentEntities.id }).from(governmentEntities).where(and(eq(governmentEntities.parentId, input.governmentEntityId), eq(governmentEntities.status, "ATIVA")));
    if (related.some(entity => !input.entityIds.includes(entity.id))) throw new Error("Inclua todos os órgãos/poderes ativos vinculados ao Executivo; MSC oficial não admite recorte do perímetro cadastrado.");
    const units = await tx.select().from(planningEntityUnits).where(inArray(planningEntityUnits.governmentEntityId, input.entityIds));
    if (input.entityIds.some(id => !units.some(unit => unit.governmentEntityId === id))) throw new Error("Cada integrante do perímetro deve possuir UG conciliada.");
    for (const unit of units) assertBudgetUnitAccess(context.user, unit.budgetUnitId);
    const id = `msc-reporting-scope:${hash(JSON.stringify(input))}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`MSC_REPORTING_SCOPE:${input.governmentEntityId}:${year.year}`}, 0))::text`);
    const [prior] = await tx.select({ id: planningCatalogEntries.id }).from(planningCatalogEntries).where(eq(planningCatalogEntries.id, id));
    if (prior) return prior.id;
    const entries = await listMscPublishedEntries(tx, { kind: "MSC_REPORTING_SCOPE", canonicalId: input.governmentEntityId, year: year.year });
    const replaced = new Set(entries.map(entry => object(entry.attributes).predecessorEntryId));
    const current = entries.filter(entry => !replaced.has(entry.id));
    if (input.predecessorEntryId ? current.length !== 1 || current[0].id !== input.predecessorEntryId : current.length > 0) throw new Error("Selecione a edição vigente ao suceder o perímetro de envio.");
    const versionId = `${id}:version`;
    await tx.insert(planningCatalogVersions).values({ id: versionId, year: year.year, label: `MSC · perímetro ${input.institutionCode} · ${year.year}`, normativeReference: input.reason, sourceHash: hash(JSON.stringify(input)), status: "DRAFT", createdById: context.user.id });
    await tx.insert(planningCatalogEntries).values({ versionId, id, kind: "MSC_REPORTING_SCOPE", canonicalId: input.governmentEntityId, code: input.institutionCode, name: `MSC agregada ${year.year}`, degree: 1, attributes: { governmentEntityId: input.governmentEntityId, entityIds: input.entityIds, budgetUnitIds: units.map(unit => unit.budgetUnitId).sort(), predecessorEntryId: input.predecessorEntryId ?? null, decision: input.reason, aggregation: "WITHOUT_RECIPROCAL_ELIMINATION", operational: true } });
    await tx.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, versionId));
    await tx.insert(financialAuditLogs).values({ action: "MSC_REPORTING_SCOPE_PUBLISHED", entityType: "PlanningCatalogEntry", entityId: id, authorUsuarioId: context.user.id, financialYearId: input.financialYearId, payload: { ...input, budgetUnitIds: units.map(unit => unit.budgetUnitId).sort() } });
    return id;
  }, { timeoutMs: 60000 });
}
