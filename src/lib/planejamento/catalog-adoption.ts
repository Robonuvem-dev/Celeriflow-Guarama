import "server-only";
import { currentPresentationEntries } from "./catalog-presentation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertPlanningLegalAuthority, planningEntityWhere, planningUnitWhere, type PlanningContext } from "./access";
import { contentHash } from "./operations-core";
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

function object(value: Prisma.JsonValue): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

async function assertCanonicalTarget(tx: Prisma.TransactionClient, kind: string, id: string) {
  const exists = kind === "ACCOUNT" ? await tx.accountingPlan.findUnique({ where: { id }, select: { id: true } })
    : kind === "SOURCE" ? await tx.resourceSource.findUnique({ where: { id }, select: { id: true } })
      : kind === "REVENUE" ? await tx.revenueNature.findUnique({ where: { id }, select: { id: true } })
        : kind === "EXPENSE" ? await tx.expenseNature.findUnique({ where: { id }, select: { id: true } })
          : kind === "CBO" ? await tx.healthCbo.findUnique({ where: { id }, select: { id: true } })
            : kind === "SERVICE" ? await tx.taxServiceActivity.findUnique({ where: { id }, select: { id: true } })
              : kind === "CNAE" ? await tx.taxRegistryEntry.findFirst({ where: { id, category: "CNAE_CATALOG", status: "ATIVO" }, select: { id: true } }) : null;
  if (!exists) throw new Error(`Destino canônico inexistente ou tipo não suportado: ${kind}.`);
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
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`SHARED_REFERENCE:${input.year}:${sourceHash}`}, 0))::text`;
    const prior = await tx.planningCatalogVersion.findUnique({ where: { year_sourceHash: { year: input.year, sourceHash } } });
    if (prior) {
      if (prior.label !== input.label || prior.normativeReference !== input.normativeReference) throw new Error("Arquivo já capturado com outra identificação ou referência.");
      return prior.id;
    }
    const version = await tx.planningCatalogVersion.create({ data: { year: input.year, label: input.label, normativeReference: input.normativeReference, sourceHash, createdById: context.user.id } });
    for (let offset = 0; offset < rows.length; offset += 300) await tx.planningCatalogEntry.createMany({ data: rows.slice(offset, offset + 300).map(row => ({ versionId: version.id, kind: row.kind, code: row.code, name: row.name, degree: row.degree, parentCode: row.parentCode, canonicalId: `UNMAPPED:${row.kind}:${row.code}`, attributes: { ...(row.attributes as Prisma.InputJsonObject), sourceHash, externalCode: row.code, operational: false, mapped: false, homologated: false, sourceOrigin: "SUPPLIED_REFERENCE" } })) });
    await tx.financialAuditLog.create({ data: { action: "SHARED_REFERENCE_CAPTURE", entityType: "PlanningCatalogVersion", entityId: version.id, authorUsuarioId: context.user.id, payload: { year: input.year, sourceHash, sourceContents: input.sourceContents, sourceEncoding: "UTF-8", normativeReference: input.normativeReference, rows: rows.length, status: "DRAFT" } } });
    return version.id;
  }, { timeout: 60000 });
}

/** Creates only the shared canonical reference; operational adoption remains a distinct edition. */
export async function createCanonicalActivityReference(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  if (!canPerformModuleOperation(context.user, "CADASTROS", "create")) throw new AccessError("Cadastrar referências exige autorização em Cadastros.", 403);
  const input = z.object({ sourceEntryId: z.string().trim().min(1) }).parse(raw);
  return context.prisma.$transaction(async tx => {
    const entry = await tx.planningCatalogEntry.findUniqueOrThrow({ where: { id: input.sourceEntryId }, include: { version: true } });
    if (!["CNAE", "CBO"].includes(entry.kind) || !/^[a-f0-9]{64}$/i.test(entry.version.sourceHash)) throw new Error("Selecione uma referência CNAE/CBO com origem capturada e hash preservado.");
    const code = entry.code.replace(/\D/g, "");
    if (code.length !== (entry.kind === "CNAE" ? 7 : 6)) throw new Error("Código externo de CNAE/CBO inválido.");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`CANONICAL_REFERENCE:${entry.kind}:${code}`}, 0))::text`;
    if (entry.kind === "CBO") {
      const existing = await tx.healthCbo.findUnique({ where: { code } });
      if (existing) return existing.id;
      const reference = await tx.healthCbo.create({ data: { code, description: entry.name } });
      await tx.financialAuditLog.create({ data: { action: "CANONICAL_ACTIVITY_REFERENCE", entityType: "HealthCbo", entityId: reference.id, authorUsuarioId: context.user.id, payload: { sourceEntryId: entry.id, sourceVersionId: entry.versionId, sourceHash: entry.version.sourceHash, externalCode: code } } });
      return reference.id;
    }
    const referenceId = `CNAE_REFERENCE:${code}`;
    const existing = await tx.taxRegistryEntry.findUnique({ where: { id: referenceId } });
    if (existing) {
      if (existing.category !== "CNAE_CATALOG" || existing.entityType !== "CNAE_REFERENCE" || existing.entityId !== code) throw new Error("Identificador de referência já utilizado com outro conteúdo.");
      return existing.id;
    }
    await tx.taxRegistryEntry.create({ data: { id: referenceId, entityType: "CNAE_REFERENCE", entityId: code, category: "CNAE_CATALOG", title: entry.name, source: "OFFICIAL_CAPTURE", actorUsuarioId: context.user.id, data: { externalCode: code, sourceEntryId: entry.id, sourceVersionId: entry.versionId, sourceHash: entry.version.sourceHash, effectiveDatesVerified: false } } });
    await tx.financialAuditLog.create({ data: { action: "CANONICAL_ACTIVITY_REFERENCE", entityType: "TaxRegistryEntry", entityId: referenceId, authorUsuarioId: context.user.id, payload: { sourceEntryId: entry.id, sourceVersionId: entry.versionId, sourceHash: entry.version.sourceHash, externalCode: code } } });
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
  return context.prisma.$transaction(async tx => {
    await tx.governmentEntity.findFirstOrThrow({ where: { AND: [planningEntityWhere(context), { id: input.governmentEntityId }] } });
    if (input.budgetUnitId) await tx.budgetUnit.findFirstOrThrow({ where: { AND: [planningUnitWhere(context), { id: input.budgetUnitId, planningEntityUnit: { is: { governmentEntityId: input.governmentEntityId } } }] } });
    const year = Number(input.effectiveFrom.slice(0, 4));
    // Entity-wide lock also serializes UG editions against entity-wide editions.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`MUNICIPAL_CATALOG:${input.governmentEntityId}:${year}`}, 0))::text`;
    const source = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: input.sourceVersionId } });
    if (source.year !== year || !/^[a-f0-9]{64}$/i.test(source.sourceHash)) throw new Error("Origem sem hash verificável ou pertencente a outro exercício.");
    const entries = await tx.planningCatalogEntry.findMany({ where: { versionId: source.id, id: { in: mappings.map(row => row.sourceEntryId) } } });
    if (entries.length !== mappings.length) throw new Error("O de-para contém entrada de outra origem ou inexistente.");
    const { mappings: serializedMappings, ...decision } = input;
    void serializedMappings;
    const hash = contentHash({ ...decision, mappings, sourceHash: source.sourceHash });
    const versionId = `municipal-catalog:${hash}`;
    const prior = await tx.planningCatalogVersion.findUnique({ where: { id: versionId }, include: { entries: true } });
    if (prior) {
      if (prior.sourceHash !== hash || prior.status !== "PUBLISHED" || prior.entries.length !== mappings.length) throw new Error("Adoção persistida divergente; concilie sua edição.");
      return prior.id;
    }
    const canonicalKeys = new Set<string>();
    const adopted: Prisma.PlanningCatalogEntryCreateWithoutVersionInput[] = [];
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
      const overlaps = await tx.planningCatalogEntry.findMany({ where: { kind: entry.kind, canonicalId: mapping.canonicalId, version: { year, status: "PUBLISHED" } }, include: { version: { select: { year: true } } } });
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
      adopted.push({ kind: entry.kind, code: entry.code, name: entry.name, degree: entry.degree, canonicalId: mapping.canonicalId,
        // A subset is not a fabricated full official hierarchy; preserve its source parent in the snapshot.
        parentCode: entries.some(row => row.kind === entry.kind && row.code === entry.parentCode) ? entry.parentCode : null,
        attributes: { ...attributes, ...(mapping.redistributionDebitSource ? { redistributionDebitSource: mapping.redistributionDebitSource } : {}), sourceParentCode: entry.parentCode, sourceEntryId: entry.id, sourceVersionId: source.id, sourceHash: source.sourceHash, externalCode: entry.code, governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId ?? null, predecessorEntryId: mapping.predecessorEntryId ?? null, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, operational: true, mapped: true, pocOnly: false, homologated: false, parameterOrigin: "MUNICIPAL_CONFIGURATION", decision: input.reason } as Prisma.InputJsonObject });
    }
    await tx.planningCatalogVersion.create({ data: { id: versionId, year, label: input.label, normativeReference: input.reason, sourceHash: hash, status: "DRAFT", createdById: context.user.id, entries: { create: adopted } } });
    await tx.planningCatalogVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED" } });
    await tx.financialAuditLog.create({ data: { action: "MUNICIPAL_CATALOG_ADOPTION", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: context.user.id, payload: { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId ?? null, sourceVersionId: source.id, sourceHash: source.sourceHash, adoptionHash: hash, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, mappings, reason: input.reason, homologated: false } } });
    return versionId;
  }, { timeout: 60000 });
}
