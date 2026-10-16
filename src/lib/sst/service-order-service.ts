import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertBudgetUnitAccess, canPerformModuleOperation, AccessError, type AppContext } from "@/lib/platform/tenant-context";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { functionalAuthorizedScope } from "./functional-service";
import { matchesHistoricalExposure, type FunctionalScope } from "./functional-policy";
import { responsibilityInput, serviceOrderInput } from "./service-order-policy";
import { SstValidationError } from "./errors";

function mutationAccess(context: AppContext, budgetUnitId: string, operation: "create" | "update" = "create") {
  assertBudgetUnitAccess(context.user, budgetUnitId);
  if (!canPerformModuleOperation(context.user, "SST", operation)) throw new AccessError("Operação SST não autorizada.", 403);
}

export async function registerTechnicalResponsibility(context: AppContext, raw: unknown) {
  const input = responsibilityInput.parse(raw);
  mutationAccess(context, input.budgetUnitId);
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_RESPONSIBILITY:${input.budgetUnitId}`}))`;
    const existing = await tx.$queryRaw<{ requestHash: string; createdById: string }[]>`SELECT "requestHash","createdById" FROM "SstTechnicalResponsibility" WHERE id=${input.submissionKey}`;
    if (existing[0]) {
      if (existing[0].requestHash !== hash || existing[0].createdById !== context.user.id) throw new SstValidationError("Submissão já utilizada.");
      return input.submissionKey;
    }
    const person = await tx.person.findUnique({ where: { id: input.personId }, select: { id: true, fullName: true } });
    if (!person) throw new SstValidationError("Responsável não encontrado no Cadastro Único.");
    if (input.groupId && !await tx.sstExposureGroup.findFirst({ where: { id: input.groupId, budgetUnitId: input.budgetUnitId, startsAt: { lte: input.startsAt }, OR: [{ endsAt: null }, { endsAt: { gte: input.endsAt } }] } })) throw new SstValidationError("GHE de outra UG ou fora da vigência.");
    const overlaps = await tx.$queryRaw<{ id: string }[]>`SELECT r.id FROM "SstTechnicalResponsibility" r WHERE r."budgetUnitId"=${input.budgetUnitId} AND r.kind=${input.kind} AND (r."groupId" IS NULL OR ${input.groupId || null}::text IS NULL OR r."groupId"=${input.groupId || null}) AND r."startsAt"<${input.endsAt} AND r."endsAt">${input.startsAt} AND NOT EXISTS (SELECT 1 FROM "SstFoundationalRevocation" v WHERE v."responsibilityId"=r.id) LIMIT 1`;
    if (overlaps.length) throw new SstValidationError("Já existe responsabilidade do mesmo tipo/escopo neste período. Revogue justificadamente antes de substituir.");
    await tx.$executeRaw`INSERT INTO "SstTechnicalResponsibility" (id,"budgetUnitId","personId",kind,"groupId",council,"sourceReference","startsAt","endsAt",snapshot,"requestHash","createdById") VALUES (${input.submissionKey},${input.budgetUnitId},${person.id},${input.kind},${input.groupId || null},${input.council},${input.sourceReference},${input.startsAt},${input.endsAt},${JSON.stringify({ personName: person.fullName, council: input.council, sourceReference: input.sourceReference })}::jsonb,${hash},${context.user.id})`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_TECHNICAL_RESPONSIBILITY", targetId: input.submissionKey });
    return input.submissionKey;
  });
}

export async function registerServiceOrder(context: AppContext, raw: unknown) {
  const input = serviceOrderInput.parse(raw);
  mutationAccess(context, input.budgetUnitId);
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_ORDER:${input.submissionKey}`}))`;
    // Same UG lock as responsibility revocations prevents issuance against a concurrently revoked source.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_RESPONSIBILITY:${input.budgetUnitId}`}))`;
    const existing = await tx.$queryRaw<{ requestHash: string; createdById: string }[]>`SELECT "requestHash","createdById" FROM "SstServiceOrder" WHERE id=${input.submissionKey}`;
    if (existing[0]) {
      if (existing[0].requestHash !== hash || existing[0].createdById !== context.user.id) throw new SstValidationError("Submissão já utilizada.");
      return input.submissionKey;
    }
    const group = await tx.sstProgramExposureGroup.findUnique({ where: { id: input.programGroupId }, include: { program: true } });
    if (!group || group.program.budgetUnitId !== input.budgetUnitId || !["LTCAT", "PGR"].includes(group.program.kind) || group.program.startsAt > input.startsAt || group.program.endsAt < input.endsAt) throw new SstValidationError("Selecione versão de risco LTCAT/PGR da UG vigente em todo o período.");
    const rule = z.object({ departmentIds: z.array(z.string()), roleIds: z.array(z.string()), startsAt: z.coerce.date(), endsAt: z.coerce.date().nullable() }).parse(group.groupSnapshot);
    if (rule.startsAt > input.startsAt || (rule.endsAt && rule.endsAt < input.endsAt)) throw new SstValidationError("GHE fora da vigência histórica.");
    const [responsible] = await tx.$queryRaw<{ id: string; snapshot: Prisma.JsonValue }[]>`SELECT r.id,r.snapshot FROM "SstTechnicalResponsibility" r WHERE r.id=${input.responsibilityId} AND r."budgetUnitId"=${input.budgetUnitId} AND r.kind='ENVIRONMENTAL' AND (r."groupId" IS NULL OR r."groupId"=${group.groupId}) AND r."startsAt"<=${input.startsAt} AND r."endsAt">=${input.endsAt} AND NOT EXISTS (SELECT 1 FROM "SstFoundationalRevocation" v WHERE v."responsibilityId"=r.id)`;
    if (!responsible) throw new SstValidationError("Responsável ambiental fora do escopo/vigência ou revogado.");
    let period: FunctionalScope | undefined;
    if (input.employeeId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HR_FUNCTIONAL:${input.employeeId}`}))`;
      [period] = await tx.$queryRaw<FunctionalScope[]>`SELECT p.* FROM "HrEmployeeFunctionalPeriod" p WHERE p.id=${input.functionalPeriodId} AND p."employeeId"=${input.employeeId} AND p."budgetUnitId"=${input.budgetUnitId} AND NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) AND p."startsAt"<=${input.startsAt} AND p."endsAt">=${input.endsAt}`;
      if (!period || !matchesHistoricalExposure(period, rule)) throw new SstValidationError("Servidor sem período histórico compatível com o GHE.");
    }
    const ids = input.equipmentRequirements.map((e) => e.materialId);
    const materials = ids.length ? await tx.material.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, name: true } }) : [];
    if (materials.length !== ids.length) throw new SstValidationError("Equipamento deve referenciar material canônico ativo.");
    const snapshot = { program: { id: group.program.id, code: group.program.code, version: group.program.version, kind: group.program.kind }, group: group.groupSnapshot, risks: group.risks, responsibility: responsible.snapshot, functionalPeriod: period || null, equipment: materials };
    await tx.$executeRaw`INSERT INTO "SstServiceOrder" (id,"budgetUnitId","programGroupId","employeeId","functionalPeriodId","responsibilityId","startsAt","endsAt",prevention,standards,"accidentConduct","trainingRequirements","equipmentRequirements",snapshot,"requestHash","createdById") VALUES (${input.submissionKey},${input.budgetUnitId},${group.id},${input.employeeId || null},${period?.id || null},${responsible.id},${input.startsAt},${input.endsAt},${input.prevention},${input.standards},${input.accidentConduct},${JSON.stringify(input.trainingRequirements)}::jsonb,${JSON.stringify(input.equipmentRequirements)}::jsonb,${JSON.stringify(snapshot)}::jsonb,${hash},${context.user.id})`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_SERVICE_ORDER", targetId: input.submissionKey });
    return input.submissionKey;
  });
}

export async function revokeFoundationalRecord(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().min(1), kind: z.enum(["ORDER", "RESPONSIBILITY"]), reason: z.string().trim().min(10).max(1000) }).parse(raw);
  const table = input.kind === "ORDER" ? Prisma.sql`"SstServiceOrder"` : Prisma.sql`"SstTechnicalResponsibility"`;
  return context.prisma.$transaction(async (tx) => {
    const [record] = await tx.$queryRaw<{ budgetUnitId: string }[]>(Prisma.sql`SELECT "budgetUnitId" FROM ${table} WHERE id=${input.id}`);
    if (!record) throw new SstValidationError("Registro não encontrado.");
    mutationAccess(context, record.budgetUnitId, "update");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_RESPONSIBILITY:${record.budgetUnitId}`}))`;
    if (input.kind === "RESPONSIBILITY") {
      const used = await tx.$queryRaw<{ id: string }[]>`SELECT o.id FROM "SstServiceOrder" o WHERE o."responsibilityId"=${input.id} AND NOT EXISTS (SELECT 1 FROM "SstFoundationalRevocation" v WHERE v."serviceOrderId"=o.id) LIMIT 1`;
      if (used.length) throw new SstValidationError("Revogue/substitua as ordens vigentes vinculadas antes de revogar o responsável.");
    }
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO "SstFoundationalRevocation" (id,"serviceOrderId","responsibilityId",reason,"createdById") VALUES (${id},${input.kind === "ORDER" ? input.id : null},${input.kind === "RESPONSIBILITY" ? input.id : null},${input.reason},${context.user.id})`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_FOUNDATIONAL_REVOCATION", targetId: id });
    return input.id;
  });
}

export type ServiceOrderRecord = { id: string; budgetUnitId: string; employeeId: string | null; startsAt: Date; endsAt: Date; prevention: string; standards: string; accidentConduct: string; trainingRequirements: string[]; equipmentRequirements: Prisma.JsonValue; snapshot: Prisma.JsonValue; revoked: boolean };
export async function listServiceOrders(context: AppContext, budgetUnitId?: string, requestedPage = 1) {
  const scope = functionalAuthorizedScope(context, budgetUnitId);
  const [count] = await context.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT count(*)::int AS total FROM "SstServiceOrder" p WHERE ${scope}`);
  const page = Math.min(Math.max(1, Math.trunc(requestedPage || 1)), Math.max(1, Math.ceil(count.total / 20)));
  const records = await context.prisma.$queryRaw<ServiceOrderRecord[]>(Prisma.sql`SELECT p.*,EXISTS(SELECT 1 FROM "SstFoundationalRevocation" v WHERE v."serviceOrderId"=p.id) AS revoked FROM "SstServiceOrder" p WHERE ${scope} ORDER BY p."startsAt" DESC,p.id LIMIT 20 OFFSET ${(page - 1) * 20}`);
  return { records, page, total: count.total };
}

export async function getServiceOrder(context: AppContext, id: string) {
  const scope = functionalAuthorizedScope(context);
  const [record] = await context.prisma.$queryRaw<ServiceOrderRecord[]>(Prisma.sql`SELECT p.*,EXISTS(SELECT 1 FROM "SstFoundationalRevocation" v WHERE v."serviceOrderId"=p.id) AS revoked FROM "SstServiceOrder" p WHERE ${scope} AND p.id=${id}`);
  return record || null;
}
