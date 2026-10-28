import "server-only";
import { currentPresentationEntries } from "./catalog-presentation";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { JsonObject, JsonValue } from "@/db/json";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { planningCatalogEntries, planningCatalogVersions, planningExpenseNatures, planningResourceSources, planningRevenueNatures } from "@/db/schema/planning-legal";
import { planningBudgetUnits, planningEntityUnits } from "@/db/schema/planning-budget";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { accountingPlans } from "@/db/schema/finance-accounting";
import { governmentEntities, healthCbos } from "@/db/schema/master-data";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { catalogServiceTargets } from "@/db/schema/planning-catalog-operations";
import { planningEntityScope, planningUnitScope } from "@/db/repositories/planning/scope";
import { planningConnection } from "./database";
import { z } from "zod";
import { assertPlanningLegalAuthority, type PlanningContext } from "./access";
import { contentHash, jsonValue } from "./operations-core";
import { AccessError, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { createHash } from "node:crypto";

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Data de vigência inválida.");
const mappingSchema = z.array(z.object({
  sourceEntryId: z.string().trim().min(1), canonicalId: z.string().trim().min(1),
  predecessorEntryId: z.string().trim().min(1).optional(),
  redistributionDebitSource: z.enum(["ORIGIN", "DESTINATION"]).optional(),
})).min(1).max(500);

function object(value: JsonValue): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function assertCanonicalTarget(tx: DatabaseTransaction, kind: string, id: string) {
  const rows = kind === "ACCOUNT" ? await tx.select({ id: accountingPlans.id }).from(accountingPlans).where(eq(accountingPlans.id, id)).limit(1)
    : kind === "SOURCE" ? await tx.select({ id: planningResourceSources.id }).from(planningResourceSources).where(eq(planningResourceSources.id, id)).limit(1)
      : kind === "REVENUE" ? await tx.select({ id: planningRevenueNatures.id }).from(planningRevenueNatures).where(eq(planningRevenueNatures.id, id)).limit(1)
        : kind === "EXPENSE" ? await tx.select({ id: planningExpenseNatures.id }).from(planningExpenseNatures).where(eq(planningExpenseNatures.id, id)).limit(1)
          : kind === "CBO" ? await tx.select({ id: healthCbos.id }).from(healthCbos).where(eq(healthCbos.id, id)).limit(1)
            : kind === "SERVICE" ? await tx.select({ id: catalogServiceTargets.id }).from(catalogServiceTargets).where(eq(catalogServiceTargets.id, id)).limit(1)
              : kind === "CNAE" ? await tx.select({ id: taxRegistryEntries.id }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.id, id), eq(taxRegistryEntries.category, "CNAE_CATALOG"), eq(taxRegistryEntries.status, "ATIVO"))).limit(1) : [];
  if (!rows.length) throw new Error(`Destino canônico inexistente ou tipo não suportado: ${kind}.`);
}

/** Preserve a supplied table as a captured reference, including services and account metadata. */
export async function importSharedReferenceCatalog(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  const input = z.object({ year: z.coerce.number().int().min(1900).max(2200), label: z.string().trim().min(3).max(200), normativeReference: z.string().trim().min(3).max(4000), sourceContents: z.string().min(1).max(8 * 1024 * 1024) }).parse(raw);
  let decoded: unknown;
  try { decoded = JSON.parse(input.sourceContents); } catch { throw new Error("Tabela de referência deve ser um array JSON."); }
  const rows = z.array(z.object({ kind: z.enum(["ACCOUNT", "SOURCE", "REVENUE", "EXPENSE", "CNAE", "CBO", "SERVICE"]), code: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(500), degree: z.number().int().min(1).max(12), parentCode: z.string().trim().min(1).optional(), attributes: z.record(z.string(), z.unknown()).default({}) })).min(1).max(5000).parse(decoded);
  const byCode = new Map(rows.map(row => [`${row.kind}:${row.code}`, row]));
  if (byCode.size !== rows.length) throw new Error("Código externo repetido na tabela de referência.");
  for (const row of rows) {
    if (!row.parentCode) continue;
    const parent = byCode.get(`${row.kind}:${row.parentCode}`);
    if (!parent || parent.degree >= row.degree) throw new Error("Hierarquia incompleta ou grau do pai incompatível.");
  }
  const sourceHash = createHash("sha256").update(input.sourceContents).digest("hex");
  return withDatabaseTransaction(planningConnection(context), async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`SHARED_REFERENCE:${input.year}:${sourceHash}`}, 0))::text`);
    const [prior] = await tx.select().from(planningCatalogVersions).where(and(eq(planningCatalogVersions.year, input.year), eq(planningCatalogVersions.sourceHash, sourceHash))).limit(1);
    if (prior) {
      if (prior.label !== input.label || prior.normativeReference !== input.normativeReference) throw new Error("Arquivo já capturado com outra identificação ou referência.");
      return prior.id;
    }
    const [version] = await tx.insert(planningCatalogVersions).values({ year: input.year, label: input.label, normativeReference: input.normativeReference, sourceHash, createdById: context.user.id }).returning();
    for (let offset = 0; offset < rows.length; offset += 300) await tx.insert(planningCatalogEntries).values(rows.slice(offset, offset + 300).map(row => ({ versionId: version.id, kind: row.kind, code: row.code, name: row.name, degree: row.degree, parentCode: row.parentCode, canonicalId: `UNMAPPED:${row.kind}:${row.code}`, attributes: jsonValue({ ...row.attributes, sourceHash, externalCode: row.code, operational: false, mapped: false, homologated: false, sourceOrigin: "SUPPLIED_REFERENCE" }) })));
    await tx.insert(financialAuditLogs).values({ action: "SHARED_REFERENCE_CAPTURE", entityType: "PlanningCatalogVersion", entityId: version.id, authorUsuarioId: context.user.id, payload: { year: input.year, sourceHash, sourceContents: input.sourceContents, sourceEncoding: "UTF-8", normativeReference: input.normativeReference, rows: rows.length, status: "DRAFT" } });
    return version.id;
  }, { timeoutMs: 60000 });
}

/** Creates only the shared canonical reference; operational adoption remains a distinct edition. */
export async function createCanonicalActivityReference(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  if (!canPerformModuleOperation(context.user, "CADASTROS", "create")) throw new AccessError("Cadastrar referências exige autorização em Cadastros.", 403);
  const input = z.object({ sourceEntryId: z.string().trim().min(1) }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async tx => {
    const [row] = await tx.select({ entry: planningCatalogEntries, version: planningCatalogVersions }).from(planningCatalogEntries).innerJoin(planningCatalogVersions, eq(planningCatalogVersions.id, planningCatalogEntries.versionId)).where(eq(planningCatalogEntries.id, input.sourceEntryId)).limit(1);
    if (!row) throw new Error("Referência de catálogo não encontrada.");
    const entry = { ...row.entry, version: row.version };
    if (!["CNAE", "CBO"].includes(entry.kind) || !/^[a-f0-9]{64}$/i.test(entry.version.sourceHash)) throw new Error("Selecione uma referência CNAE/CBO com origem capturada e hash preservado.");
    const code = entry.code.replace(/\D/g, "");
    if (code.length !== (entry.kind === "CNAE" ? 7 : 6)) throw new Error("Código externo de CNAE/CBO inválido.");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`CANONICAL_REFERENCE:${entry.kind}:${code}`}, 0))::text`);
    if (entry.kind === "CBO") {
      const [existing] = await tx.select().from(healthCbos).where(eq(healthCbos.code, code)).limit(1);
      if (existing) return existing.id;
      const [reference] = await tx.insert(healthCbos).values({ code, description: entry.name }).returning();
      await tx.insert(financialAuditLogs).values({ action: "CANONICAL_ACTIVITY_REFERENCE", entityType: "HealthCbo", entityId: reference.id, authorUsuarioId: context.user.id, payload: { sourceEntryId: entry.id, sourceVersionId: entry.versionId, sourceHash: entry.version.sourceHash, externalCode: code } });
      return reference.id;
    }
    const referenceId = `CNAE_REFERENCE:${code}`;
    const [existing] = await tx.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.id, referenceId)).limit(1);
    if (existing) {
      if (existing.category !== "CNAE_CATALOG" || existing.entityType !== "CNAE_REFERENCE" || existing.entityId !== code) throw new Error("Identificador de referência já utilizado com outro conteúdo.");
      return existing.id;
    }
    await tx.insert(taxRegistryEntries).values({ id: referenceId, entityType: "CNAE_REFERENCE", entityId: code, category: "CNAE_CATALOG", title: entry.name, source: "OFFICIAL_CAPTURE", actorUsuarioId: context.user.id, data: { externalCode: code, sourceEntryId: entry.id, sourceVersionId: entry.versionId, sourceHash: entry.version.sourceHash, effectiveDatesVerified: false } });
    await tx.insert(financialAuditLogs).values({ action: "CANONICAL_ACTIVITY_REFERENCE", entityType: "TaxRegistryEntry", entityId: referenceId, authorUsuarioId: context.user.id, payload: { sourceEntryId: entry.id, sourceVersionId: entry.versionId, sourceHash: entry.version.sourceHash, externalCode: code } });
    return referenceId;
  });
}

/** An adoption is a new edition; captured official data and canonical IDs are never rewritten. */
export async function adoptMunicipalCatalog(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  const input = z.object({ sourceVersionId: z.string().trim().min(1), governmentEntityId: z.string().trim().min(1), budgetUnitId: z.preprocess(value => value === "" ? undefined : value, z.string().trim().min(1).optional()), label: z.string().trim().min(3).max(200), reason: z.string().trim().min(3).max(4000), effectiveFrom: daySchema, effectiveUntil: daySchema, mappings: z.string().max(150000) }).parse(raw);
  if (input.effectiveUntil < input.effectiveFrom || input.effectiveUntil.slice(0, 4) !== input.effectiveFrom.slice(0, 4)) throw new Error("A vigência deve estar contida em um exercício.");
  let decoded: unknown;
  try { decoded = JSON.parse(input.mappings); } catch { throw new Error("De-para deve ser um array JSON de sourceEntryId e canonicalId."); }
  const mappings = mappingSchema.parse(decoded).sort((a, b) => a.sourceEntryId.localeCompare(b.sourceEntryId));
  if (new Set(mappings.map(row => row.sourceEntryId)).size !== mappings.length) throw new Error("Entrada de origem repetida no de-para.");
  return withDatabaseTransaction(planningConnection(context), async tx => {
    const [entity] = await tx.select({ id: governmentEntities.id }).from(governmentEntities).where(and(eq(governmentEntities.id, input.governmentEntityId), planningEntityScope(context, governmentEntities.id))).limit(1);
    if (!entity) throw new AccessError("Entidade não autorizada para esta adoção.", 403);
    if (input.budgetUnitId) {
      const [unit] = await tx.select({ id: planningBudgetUnits.id }).from(planningBudgetUnits).innerJoin(planningEntityUnits, eq(planningEntityUnits.budgetUnitId, planningBudgetUnits.id)).where(and(planningUnitScope(context, planningBudgetUnits.id), eq(planningBudgetUnits.id, input.budgetUnitId), eq(planningEntityUnits.governmentEntityId, input.governmentEntityId))).limit(1);
      if (!unit) throw new AccessError("Unidade não autorizada nesta entidade.", 403);
    }
    const year = Number(input.effectiveFrom.slice(0, 4));
    // Entity-wide lock also serializes UG editions against entity-wide editions.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`MUNICIPAL_CATALOG:${input.governmentEntityId}:${year}`}, 0))::text`);
    const [source] = await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, input.sourceVersionId)).limit(1);
    if (!source) throw new Error("Versão de origem não encontrada.");
    if (source.year !== year || !/^[a-f0-9]{64}$/i.test(source.sourceHash)) throw new Error("Origem sem hash verificável ou pertencente a outro exercício.");
    const entries = await tx.select().from(planningCatalogEntries).where(and(eq(planningCatalogEntries.versionId, source.id), inArray(planningCatalogEntries.id, mappings.map(row => row.sourceEntryId))));
    if (entries.length !== mappings.length) throw new Error("O de-para contém entrada de outra origem ou inexistente.");
    const { mappings: serializedMappings, ...decision } = input;
    void serializedMappings;
    const hash = contentHash({ ...decision, mappings, sourceHash: source.sourceHash });
    const versionId = `municipal-catalog:${hash}`;
    const [prior] = await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, versionId)).limit(1);
    if (prior) {
      const priorEntries = await tx.select({ id: planningCatalogEntries.id }).from(planningCatalogEntries).where(eq(planningCatalogEntries.versionId, prior.id));
      if (prior.sourceHash !== hash || prior.status !== "PUBLISHED" || priorEntries.length !== mappings.length) throw new Error("Adoção persistida divergente; concilie sua edição.");
      return prior.id;
    }
    const canonicalKeys = new Set<string>();
    const adopted: (typeof planningCatalogEntries.$inferInsert)[] = [];
    for (const mapping of mappings) {
      const entry = entries.find(row => row.id === mapping.sourceEntryId)!;
      const key = `${entry.kind}:${mapping.canonicalId}`;
      if (canonicalKeys.has(key)) throw new Error("Dois códigos externos do mesmo tipo não podem apontar para o mesmo cadastro nesta edição.");
      canonicalKeys.add(key);
      await assertCanonicalTarget(tx, entry.kind, mapping.canonicalId);
      const attributes = object(entry.attributes);
      if (mapping.redistributionDebitSource && entry.kind !== "ACCOUNT") throw new Error("Configuração de fonte por linha se aplica somente a contas contábeis.");
      if (attributes.synthetic === true || attributes.pocOnly === true) throw new Error("Uma referência sintética não pode ser promovida a catálogo municipal.");
      if (typeof attributes.effectiveFrom === "string" && input.effectiveFrom < attributes.effectiveFrom || typeof attributes.effectiveUntil === "string" && input.effectiveUntil > attributes.effectiveUntil) throw new Error("Vigência municipal excede a vigência documentada da origem.");
      if (entry.kind === "ACCOUNT" && (attributes.postingAllowed !== true || !["D", "C", "X", "DC", "D/C"].includes(String(attributes.balanceNature)))) throw new Error("Conta de origem sintética ou sem natureza D/C documentada.");
      const overlapRows = await tx.select({ entry: planningCatalogEntries, year: planningCatalogVersions.year }).from(planningCatalogEntries).innerJoin(planningCatalogVersions, eq(planningCatalogVersions.id, planningCatalogEntries.versionId)).where(and(eq(planningCatalogEntries.kind, entry.kind), eq(planningCatalogEntries.canonicalId, mapping.canonicalId), eq(planningCatalogVersions.year, year), eq(planningCatalogVersions.status, "PUBLISHED")));
      const overlaps = overlapRows.map(row => ({ ...row.entry, version: { year: row.year } }));
      const applicable = overlaps.filter(row => {
        const attrs = object(row.attributes);
        return (!attrs.governmentEntityId || attrs.governmentEntityId === input.governmentEntityId)
          && (!attrs.budgetUnitId || !input.budgetUnitId || attrs.budgetUnitId === input.budgetUnitId)
          && typeof attrs.effectiveFrom === "string" && typeof attrs.effectiveUntil === "string"
          && attrs.effectiveFrom <= input.effectiveUntil && attrs.effectiveUntil >= input.effectiveFrom;
      });
      const replaced = new Set(applicable.map(row => object(row.attributes).predecessorEntryId));
      const current = currentPresentationEntries(applicable, input.effectiveFrom).filter(row => !replaced.has(row.id));
      if (mapping.predecessorEntryId) {
        if (current.length !== 1 || current[0].id !== mapping.predecessorEntryId) throw new Error("Selecione a única edição vigente que está sendo sucedida.");
        const previous = object(current[0].attributes);
        if ((previous.governmentEntityId ?? null) !== input.governmentEntityId || (previous.budgetUnitId ?? null) !== (input.budgetUnitId ?? null)) throw new Error("Uma sucessão deve preservar o ente e o alcance de UG da edição anterior.");
        if (input.effectiveFrom <= String(previous.effectiveFrom) || input.effectiveUntil > String(previous.effectiveUntil)) throw new Error("Sucessão exige data posterior e vigência contida na edição anterior.");
      } else if (current.length) throw new Error("Classificação publicada sobreposta; informe predecessorEntryId no de-para ou ajuste a vigência.");
      adopted.push({ versionId, kind: entry.kind, code: entry.code, name: entry.name, degree: entry.degree, canonicalId: mapping.canonicalId,
        // A subset is not a fabricated full official hierarchy; preserve its source parent in the snapshot.
        parentCode: entries.some(row => row.kind === entry.kind && row.code === entry.parentCode) ? entry.parentCode : null,
        attributes: { ...attributes, ...(mapping.redistributionDebitSource ? { redistributionDebitSource: mapping.redistributionDebitSource } : {}), sourceParentCode: entry.parentCode, sourceEntryId: entry.id, sourceVersionId: source.id, sourceHash: source.sourceHash, externalCode: entry.code, governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId ?? null, predecessorEntryId: mapping.predecessorEntryId ?? null, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, operational: true, mapped: true, pocOnly: false, homologated: false, parameterOrigin: "MUNICIPAL_CONFIGURATION", decision: input.reason } });
    }
    await tx.insert(planningCatalogVersions).values({ id: versionId, year, label: input.label, normativeReference: input.reason, sourceHash: hash, status: "DRAFT", createdById: context.user.id });
    await tx.insert(planningCatalogEntries).values(adopted);
    await tx.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, versionId));
    await tx.insert(financialAuditLogs).values({ action: "MUNICIPAL_CATALOG_ADOPTION", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: context.user.id, payload: { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId ?? null, sourceVersionId: source.id, sourceHash: source.sourceHash, adoptionHash: hash, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, mappings, reason: input.reason, homologated: false } });
    return versionId;
  }, { timeoutMs: 60000 });
}
