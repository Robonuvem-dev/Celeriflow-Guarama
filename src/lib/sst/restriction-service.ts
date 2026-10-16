import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { assertDisciplineAccess, disciplineUnitWhere } from "./clinical-access";
import { assertAccidentOperation, accidentHash, assertAccidentPhysician } from "./accident-service";
import { assertRetry } from "./accident-policy";
import { restrictionInput, followupInput } from "./restriction-policy";
import { SstValidationError } from "./errors";

export type RestrictionRow = { id: string; budgetUnitId: string; employeeId: string; startsAt: Date; endsAt: Date; data: Record<string, unknown>; createdById: string; requestHash: string };
export async function readRestriction(context: AppContext, id: string, write = false) {
  const [row] = await context.prisma.$queryRaw<RestrictionRow[]>`SELECT * FROM "SstRestriction" WHERE "id"=${id}`;
  if (!row) throw new SstValidationError("Restrição não encontrada.");
  await assertDisciplineAccess(context, row.budgetUnitId, "MEDICINE", write);
  await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_RESTRICTION_READ", targetId: id });
  return row;
}
export async function registerRoleAttribute(context: AppContext, raw: unknown) {
  assertAccidentOperation(context);
  const input = z.object({ roleId: z.string().min(1), description: z.string().trim().min(1).max(1000) }).parse(raw);
  if (!await context.prisma.role.findUnique({ where: { id: input.roleId } })) throw new SstValidationError("Cargo canônico não encontrado.");
  await context.prisma.$executeRaw`INSERT INTO "SstRoleAttribute" ("id","roleId","description") VALUES (${randomUUID()},${input.roleId},${input.description}) ON CONFLICT ("roleId","description") DO NOTHING`;
}
export async function registerRestriction(context: AppContext, raw: unknown) {
  assertAccidentOperation(context);
  const input = restrictionInput.parse(raw);
  await assertDisciplineAccess(context, input.budgetUnitId, "MEDICINE", true);
  const requestHash = accidentHash(input);
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RESTRICTION:${input.submissionKey}`}))`;
    const [existing] = await tx.$queryRaw<RestrictionRow[]>`SELECT * FROM "SstRestriction" WHERE "submissionKey"=${input.submissionKey}`;
    if (existing) { assertRetry(existing, requestHash, context.user.id); return existing.id; }
    const [employee, unit] = await Promise.all([tx.employee.findUnique({ where: { id: input.employeeId } }), tx.budgetUnit.findUnique({ where: { id: input.budgetUnitId } })]);
    if (!employee?.isActive || !employee.roleId || !employee.secretariatId || !unit || employee.secretariatId !== unit.secretariatId || await tx.budgetUnit.count({ where: { secretariatId: employee.secretariatId } }) !== 1) throw new SstValidationError("Vínculo funcional incompatível ou ambíguo entre UGs.");
    const physician = await assertAccidentPhysician(tx, context, input.professionalRoleId, unit.id, input.startsAt);
    const author = await tx.person.findUniqueOrThrow({ where: { id: physician.personId }, select: { fullName: true } });
    const attributes = await tx.$queryRaw<{ id: string; description: string }[]>`SELECT "id","description" FROM "SstRoleAttribute" WHERE "roleId"=${employee.roleId} ORDER BY "id" FOR SHARE`;
    if (attributes.length !== input.attributes.length || attributes.some(a => !input.attributes.some(b => b.attributeId === a.id))) throw new SstValidationError("Informe liberação/impedimento para cada atribuição do cargo canônico.");
    const responsible = input.notificationEnabled ? await tx.employee.findUnique({ where: { id: input.responsibleEmployeeId } }) : null;
    if (input.notificationEnabled && (!responsible?.isActive || responsible.secretariatId !== unit.secretariatId || !z.email().safeParse(responsible.email).success)) throw new SstValidationError("Responsável precisa de vínculo ativo na UG e e-mail válido.");
    const id = randomUUID(), data = { ...input, employeeName: employee.name, roleId: employee.roleId, authorSnapshot: { personId: physician.personId, name: author.fullName, council: physician.council, recordedBy: context.user.name }, attributes: input.attributes.map(a => ({ ...a, description: attributes.find(b => b.id === a.attributeId)!.description })) };
    await tx.$executeRaw`INSERT INTO "SstRestriction" ("id","budgetUnitId","employeeId","professionalRoleId","startsAt","endsAt","data","createdById","submissionKey","requestHash") VALUES (${id},${unit.id},${employee.id},${input.professionalRoleId},${input.startsAt},${input.endsAt},${JSON.stringify(data)}::jsonb,${context.user.id},${input.submissionKey},${requestHash})`;
    if (responsible?.email) await tx.$executeRaw`INSERT INTO "SstRestrictionEmailOutbox" ("id","restrictionId","recipient","dueAt") VALUES (${randomUUID()},${id},${responsible.email},${new Date(input.endsAt.getTime() - input.notifyDays * 86400000)})`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_RESTRICTION", targetId: id });
    return id;
  });
}
export async function addRestrictionFollowup(context: AppContext, raw: unknown) {
  assertAccidentOperation(context);
  const input = followupInput.parse(raw), row = await readRestriction(context, input.restrictionId, true), requestHash = accidentHash(input);
  if (input.followedAt < row.startsAt || input.followedAt > new Date()) throw new SstValidationError("Data do acompanhamento inválida.");
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "SstRestriction" WHERE "id"=${row.id} FOR UPDATE`;
    const [old] = await tx.$queryRaw<{ requestHash: string; createdById: string }[]>`SELECT "requestHash","createdById" FROM "SstRestrictionFollowup" WHERE "submissionKey"=${input.submissionKey}`;
    if (old) { assertRetry(old, requestHash, context.user.id); return row.id; }
    const released = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "SstRestrictionFollowup" WHERE "restrictionId"=${row.id} AND "data"->>'outcome'='RELEASE'`;
    if (released.length) throw new SstValidationError("Restrição já liberada. Cadastre nova restrição para uma nova avaliação.");
    const physician = await assertAccidentPhysician(tx, context, input.professionalRoleId, row.budgetUnitId, input.followedAt);
    const author = await tx.person.findUniqueOrThrow({ where: { id: physician.personId }, select: { fullName: true } });
    await tx.$executeRaw`INSERT INTO "SstRestrictionFollowup" ("id","restrictionId","followedAt","data","createdById","submissionKey","requestHash") VALUES (${randomUUID()},${row.id},${input.followedAt},${JSON.stringify({ ...input, authorSnapshot: { personId: physician.personId, name: author.fullName, council: physician.council, recordedBy: context.user.name } })}::jsonb,${context.user.id},${input.submissionKey},${requestHash})`;
    if (input.outcome === "RELEASE") await tx.$executeRaw`UPDATE "SstRestrictionEmailOutbox" SET "status"='FAILED',"lastError"='Restrição liberada; aviso cancelado' WHERE "restrictionId"=${row.id} AND "status" IN ('PENDING','FAILED')`;
    return row.id;
  });
}
export async function listRestrictions(context: AppContext, requestedPage = 1) {
  const units = await context.prisma.budgetUnit.findMany({ where: disciplineUnitWhere(context, "MEDICINE"), select: { id: true } });
  const scope = units.length ? Prisma.sql`"budgetUnitId" IN (${Prisma.join(units.map(u => u.id))})` : Prisma.sql`false`;
  const [count] = await context.prisma.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) total FROM "SstRestriction" WHERE ${scope}`;
  const total = Number(count.total), page = Math.min(Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1), Math.max(1, Math.ceil(total / 20)));
  const rows = await context.prisma.$queryRaw<RestrictionRow[]>`SELECT * FROM "SstRestriction" WHERE ${scope} ORDER BY "endsAt","id" LIMIT 20 OFFSET ${(page - 1) * 20}`;
  return { rows, page, total };
}
export async function readRestrictionFollowups(context: AppContext, id: string) {
  await readRestriction(context, id);
  return context.prisma.$queryRaw<{ id: string; followedAt: Date; data: Record<string, unknown> }[]>`SELECT "id","followedAt","data" FROM "SstRestrictionFollowup" WHERE "restrictionId"=${id} ORDER BY "followedAt" DESC,"id" DESC`;
}
export async function listRestrictionFollowups(context: AppContext, id: string, requestedPage = 1) {
  await readRestriction(context, id);
  const [count] = await context.prisma.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) total FROM "SstRestrictionFollowup" WHERE "restrictionId"=${id}`;
  const total = Number(count.total), page = Math.min(Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1), Math.max(1, Math.ceil(total / 20)));
  const rows = await context.prisma.$queryRaw<{ id: string; followedAt: Date; data: Record<string, unknown> }[]>`SELECT "id","followedAt","data" FROM "SstRestrictionFollowup" WHERE "restrictionId"=${id} ORDER BY "followedAt" DESC,"id" DESC LIMIT 20 OFFSET ${(page - 1) * 20}`;
  return { rows, total, page };
}
/** Supply an actual configured provider. No provider exists in the current repository. */
export async function dispatchRestrictionEmails(context: AppContext, send: (message: { to: string; subject: string; text: string; idempotencyKey: string }) => Promise<{ receipt: string }>, now = new Date()) {
  assertAccidentOperation(context);
  const units = await context.prisma.budgetUnit.findMany({ where: disciplineUnitWhere(context, "MEDICINE", true), select: { id: true } });
  if (!units.length) return 0;
  let sent = 0;
  for (let i = 0; i < 20; i++) {
    const message = await context.prisma.$transaction(async tx => {
      const [row] = await tx.$queryRaw<{ id: string; recipient: string; restrictionId: string }[]>`SELECT o."id",o."recipient",o."restrictionId" FROM "SstRestrictionEmailOutbox" o JOIN "SstRestriction" r ON r."id"=o."restrictionId" WHERE r."budgetUnitId" IN (${Prisma.join(units.map(u => u.id))}) AND o."status"='PENDING' AND o."dueAt"<=${now} AND NOT EXISTS (SELECT 1 FROM "SstRestrictionFollowup" f WHERE f."restrictionId"=r."id" AND f."data"->>'outcome'='RELEASE') ORDER BY o."dueAt",o."id" LIMIT 1 FOR UPDATE OF o SKIP LOCKED`;
      if (row) await tx.$executeRaw`UPDATE "SstRestrictionEmailOutbox" SET "status"='SENDING' WHERE "id"=${row.id}`;
      return row;
    });
    if (!message) break;
    try {
      const result = await send({ to: message.recipient, subject: "SST: restrição próxima do término", text: `Revise a restrição ${message.restrictionId} na área SST autorizada.`, idempotencyKey: message.id });
      if (!result.receipt) throw new Error("Provedor não retornou comprovante de entrega/aceite.");
      await context.prisma.$executeRaw`UPDATE "SstRestrictionEmailOutbox" SET "status"='SENT',"providerReceipt"=${result.receipt},"sentAt"=${now},"lastError"=NULL WHERE "id"=${message.id}`;
      sent++;
    } catch {
      await context.prisma.$executeRaw`UPDATE "SstRestrictionEmailOutbox" SET "status"='FAILED',"lastError"='Falha do provedor; verificar antes de reenviar' WHERE "id"=${message.id}`;
    }
  }
  return sent;
}
