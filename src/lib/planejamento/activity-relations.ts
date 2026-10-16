import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { assertPlanningLegalAuthority, planningEntityWhere, type PlanningContext } from "./access";
import { contentHash } from "./operations-core";

const object = (value: Prisma.JsonValue): Prisma.JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};

/** Municipal relationships are explicit and versioned; CNAE/CBO never imply an ISS rate. */
export async function configureMunicipalActivityRelation(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  const input = z.object({ governmentEntityId: z.string().trim().min(1), relationType: z.enum(["CNAE_SERVICE", "CBO_SERVICE"]), leftEntryId: z.string().trim().min(1), rightEntryId: z.string().trim().min(1), supersedesEntryId: z.string().trim().min(1).optional(), reason: z.string().trim().min(3).max(4000) }).parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.governmentEntity.findFirstOrThrow({ where: { AND: [planningEntityWhere(context), { id: input.governmentEntityId }] } });
    const entries = await tx.planningCatalogEntry.findMany({ where: { id: { in: [input.leftEntryId, input.rightEntryId] }, version: { status: "PUBLISHED" } }, include: { version: { select: { year: true, sourceHash: true } } } });
    const left = entries.find(entry => entry.id === input.leftEntryId), right = entries.find(entry => entry.id === input.rightEntryId);
    if (!left || !right || left.kind !== (input.relationType === "CNAE_SERVICE" ? "CNAE" : "CBO") || right.kind !== "SERVICE" || left.version.year !== right.version.year) throw new Error("Relacione CNAE/CBO com serviço em edições publicadas do mesmo exercício.");
    const leftAttrs = object(left.attributes), rightAttrs = object(right.attributes);
    for (const attributes of [leftAttrs, rightAttrs]) {
      if (attributes.operational !== true || attributes.pocOnly !== false || attributes.governmentEntityId !== input.governmentEntityId) throw new Error("Relação exige adoções municipais explícitas do mesmo ente.");
      if (attributes.budgetUnitId) throw new Error("Relação compartilhada por ente exige edições com alcance de entidade.");
    }
    if (left.canonicalId.startsWith("UNMAPPED:") || right.canonicalId.startsWith("UNMAPPED:")) throw new Error("Conclua o de-para antes de relacionar classificações.");
    const from = [leftAttrs.effectiveFrom, rightAttrs.effectiveFrom].map(String).sort().at(-1)!;
    const until = [leftAttrs.effectiveUntil, rightAttrs.effectiveUntil].map(String).sort()[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(until) || from > until) throw new Error("Classificações sem vigência comum documentada.");
    const fingerprint = contentHash({ ...input, from, until, leftSourceHash: left.version.sourceHash, rightSourceHash: right.version.sourceHash });
    const id = `municipal-activity-relation:${fingerprint}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ACTIVITY_RELATION:${input.governmentEntityId}:${input.relationType}:${left.canonicalId}:${right.canonicalId}`}, 0))::text`;
    const existing = await tx.taxRegistryEntry.findUnique({ where: { id } });
    if (existing) return existing.id;
    const overlapping = await tx.taxRegistryEntry.findMany({ where: { category: "MUNICIPAL_ACTIVITY_RELATION", entityType: "GOVERNMENT_ENTITY", entityId: input.governmentEntityId, status: "ATIVO", effectiveFrom: { lte: new Date(`${until}T23:59:59.999Z`) }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: new Date(`${from}T00:00:00.000Z`) } }], AND: [{ data: { path: ["relationType"], equals: input.relationType } }, { data: { path: ["leftCanonicalId"], equals: left.canonicalId } }, { data: { path: ["rightCanonicalId"], equals: right.canonicalId } }] } });
    const replaced = new Set(overlapping.map(row => object(row.data).supersedesEntryId));
    const current = overlapping.filter(row => !replaced.has(row.id));
    if (input.supersedesEntryId) {
      if (current.length !== 1 || current[0].id !== input.supersedesEntryId || new Date(`${from}T00:00:00.000Z`) <= current[0].effectiveFrom || !current[0].effectiveUntil || new Date(`${until}T23:59:59.999Z`) > current[0].effectiveUntil) throw new Error("Sucessão da relação exige a edição corrente e vigência posterior contida na original.");
    } else if (current.length) throw new Error("Relação já registrada para a vigência; selecione sua edição predecessora.");
    const snapshot = (entry: NonNullable<typeof left>) => ({ entryId: entry.id, versionId: entry.versionId, canonicalId: entry.canonicalId, externalCode: entry.code, name: entry.name, sourceHash: entry.version.sourceHash });
    await tx.taxRegistryEntry.create({ data: { id, category: "MUNICIPAL_ACTIVITY_RELATION", entityType: "GOVERNMENT_ENTITY", entityId: input.governmentEntityId, title: `${left.code} → ${right.code}`, source: "MUNICIPAL_CONFIGURATION", actorUsuarioId: context.user.id, effectiveFrom: new Date(`${from}T00:00:00.000Z`), effectiveUntil: new Date(`${until}T23:59:59.999Z`), version: input.supersedesEntryId ? current[0].version + 1 : 1, data: { relationType: input.relationType, leftCanonicalId: left.canonicalId, rightCanonicalId: right.canonicalId, supersedesEntryId: input.supersedesEntryId ?? null, left: snapshot(left), right: snapshot(right), reason: input.reason, fingerprint } } });
    await tx.financialAuditLog.create({ data: { action: "MUNICIPAL_ACTIVITY_RELATION", entityType: "TaxRegistryEntry", entityId: id, authorUsuarioId: context.user.id, payload: { ...input, effectiveFrom: from, effectiveUntil: until, fingerprint } } });
    return id;
  });
}

export async function readMunicipalServiceRelationships(db: PrismaClient | Prisma.TransactionClient, input: { governmentEntityId: string; activityId: string; date: Date }) {
  const rows = await db.taxRegistryEntry.findMany({ where: { category: "MUNICIPAL_ACTIVITY_RELATION", entityType: "GOVERNMENT_ENTITY", entityId: input.governmentEntityId, status: "ATIVO", effectiveFrom: { lte: input.date }, effectiveUntil: { gte: input.date }, data: { path: ["rightCanonicalId"], equals: input.activityId } }, orderBy: { id: "asc" }, select: { id: true, data: true, effectiveFrom: true, effectiveUntil: true } });
  const replaced = new Set(rows.map(row => object(row.data).supersedesEntryId));
  const current = rows.filter(row => !replaced.has(row.id));
  return { status: current.length ? "DOCUMENTED_RELATIONSHIPS" : "NOT_CONFIGURED", relationships: current.map(row => ({ id: row.id, data: row.data as Prisma.InputJsonObject, effectiveFrom: row.effectiveFrom.toISOString(), effectiveUntil: row.effectiveUntil!.toISOString() })) } satisfies Prisma.InputJsonObject;
}
