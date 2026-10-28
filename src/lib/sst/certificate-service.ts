import type { AppContext } from "@/lib/platform/tenant-context";
import { assertBudgetUnitAccess, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { sstCertificateReasons, sstCertificates, sstAssessments } from "@/db/schema/sst-certificates";
import { sstBoards, sstBoardMembers } from "@/db/schema/sst-agenda";
import { roles } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { dependents, leaves } from "@/db/schema/personnel-records";
import { healthSusReferences } from "@/db/schema/health-catalogs";
import { processes } from "@/db/schema/processes";
import { findSstUnit, findSstEmployee, findSstPerson } from "@/db/repositories/sst/scope";
import { findModuleActivation } from "@/db/repositories/platform/identity";
import { sstRows } from "@/db/repositories/sst/sql";
import { sstContextConnection, sstDatabase } from "./database";
import { certificateInput, reasonInput, assertCertificateReason } from "./certificate-policy";
import { assertSstClinicalAccess } from "./access";
import { z } from "zod";
import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { SstValidationError } from "./errors";
import { certificateFunctionalSource, assertCertificateHistoricalSource, appendReasonRegimePolicy } from "./functional-certificate-service";

export async function registerCertificate(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = certificateInput.parse(raw);
  await assertSstClinicalAccess(context, input.budgetUnitId);
  if (input.processId) {
    const protocolContext = await getProtocolContext();
    const [process] = await sstDatabase(context).select({ id: processes.id }).from(processes).where(and(eq(processes.id, input.processId), protocolScopeCondition(protocolContext))).limit(1);
    if (!process) throw new SstValidationError("Processo não encontrado ou sem acesso ao seu setor.");
  }
  return withDatabaseTransaction(connection, async (tx) => {
    // Same lock/order as reason editing: reason settings and regime policy form one snapshot.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_REGIME_POLICY:${input.reasonId}`}))`);
    const [unit, employee, reason, issuer] = await Promise.all([
      findSstUnit(tx, input.budgetUnitId), findSstEmployee(tx, input.employeeId),
      tx.select().from(sstCertificateReasons).where(eq(sstCertificateReasons.id, input.reasonId)).then(rows => rows[0]),
      findSstPerson(tx, input.issuerPersonId),
    ]);
    if (!unit || !employee?.isActive) throw new SstValidationError("Servidor ou unidade gestora inválidos.");
    if (!issuer || !reason?.isActive || reason.budgetUnitId !== unit.id) throw new SstValidationError("Emitente ou motivo inválido.");
    const dependent = input.dependentId ? (await tx.select().from(dependents).where(and(eq(dependents.id, input.dependentId), eq(dependents.employeeId, employee.id))).limit(1))[0] : null;
    if (input.dependentId && !dependent) throw new SstValidationError("O dependente não pertence ao servidor.");
    const presentedAt = reason.autoPresentedAt ? new Date() : new Date(input.presentedAt);
    if (!Number.isFinite(presentedAt.getTime())) throw new SstValidationError("Informe uma data de apresentação válida.");
    const protocolNumber = reason.autoProtocol ? `SST-${input.submissionKey}` : input.protocolNumber;
    if (!protocolNumber) throw new SstValidationError("Informe o protocolo de entrega.");
    const [existing] = await tx.select().from(sstCertificates).where(and(eq(sstCertificates.budgetUnitId, unit.id), eq(sstCertificates.protocolNumber, protocolNumber))).limit(1);
    if (existing) {
      const sameRequest = reason.autoProtocol && existing.createdById === context.user.id && existing.employeeId === employee.id && existing.reasonId === reason.id && existing.issuerPersonId === issuer.id && existing.issuerCouncil === input.issuerCouncil && existing.startsAt.getTime() === input.startsAt.getTime() && existing.endsAt.getTime() === input.endsAt.getTime() && (existing.dependentId || "") === input.dependentId && (existing.processId || "") === input.processId && (reason.autoPresentedAt || existing.presentedAt.getTime() === presentedAt.getTime()) && [...(existing.cidCodes ?? [])].sort().join(",") === [...new Set(input.cidCodes)].sort().join(",");
      if (!sameRequest) throw new SstValidationError("O protocolo já foi utilizado. Confira os dados antes de registrar outro atestado.");
      const settings = z.object({ printReceipt: z.boolean().default(false), suggestLeave: z.boolean().default(false) }).parse(existing.reasonSnapshot ?? reason);
      return { id: existing.id, printReceipt: settings.printReceipt, suggestLeave: settings.suggestLeave };
    }
    const source = await certificateFunctionalSource(tx, input);
    assertCertificateReason(reason, source.period.roleId, input.dependentId);
    const codes = [...new Set(input.cidCodes.map((code) => code.replaceAll(".", "")))];
    if (codes.length) {
      const references = await tx.select({ code: healthSusReferences.code }).from(healthSusReferences).where(and(eq(healthSusReferences.kind, "CID"), eq(healthSusReferences.isActive, true), eq(healthSusReferences.isCurrent, true), inArray(healthSusReferences.code, [...new Set(input.cidCodes.flatMap((code) => [code, code.replaceAll(".", ""), code.length > 3 && !code.includes(".") ? `${code.slice(0, 3)}.${code.slice(3)}` : code]))])));
      const canonical = new Set(references.map((reference) => reference.code.replaceAll(".", "")));
      if (codes.some((code) => !canonical.has(code))) throw new SstValidationError("CID não encontrado no catálogo oficial ativo. Atualize o catálogo canônico de Saúde.");
    }
    const [record] = await tx.insert(sstCertificates).values({
      budgetUnitId: unit.id, employeeId: employee.id, reasonId: reason.id,
      issuerPersonId: issuer.id, issuerCouncil: input.issuerCouncil,
      dependentId: dependent?.id, relationship: dependent?.relationship,
      startsAt: input.startsAt, endsAt: input.endsAt, presentedAt, protocolNumber,
      processId: input.processId || null,
      cidCodes: [...new Set(input.cidCodes)], roleIdSnapshot: source.period.roleId,
      departmentIdSnapshot: source.period.departmentId, createdById: context.user.id,
      reasonSnapshot: { name: reason.name, createLeaveOnApproval: reason.createLeaveOnApproval, leaveType: reason.leaveType, suggestLeave: reason.suggestLeave, printReceipt: reason.printReceipt },
    }).returning({ id: sstCertificates.id });
    await tx.execute(sql`INSERT INTO "SstCertificateFunctionalSource" ("certificateId","functionalPeriodId","regimePolicyId",snapshot) VALUES (${record.id},${source.period.id},${source.policyId},${JSON.stringify(source.period)}::jsonb)`);
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_CERTIFICATE", targetId: record.id });
    return { id: record.id, printReceipt: reason.printReceipt, suggestLeave: reason.suggestLeave };
  });
}

export async function registerCertificateReason(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = reasonInput.parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return withDatabaseTransaction(connection, async (tx) => {
    const unit = await findSstUnit(tx, input.budgetUnitId);
    if (!unit) throw new SstValidationError("Unidade gestora não encontrada.");
    const roleIds = [...new Set(input.restrictedRoleIds)];
    if (roleIds.length && (await tx.select({ id: roles.id }).from(roles).where(inArray(roles.id, roleIds))).length !== roleIds.length) throw new SstValidationError("Um dos cargos selecionados não existe no cadastro funcional.");
    const { restrictedRegimeIds, ...reasonData } = input;
    const [record] = await tx.insert(sstCertificateReasons).values(reasonData).returning({ id: sstCertificateReasons.id });
    await appendReasonRegimePolicy(tx, record.id, restrictedRegimeIds, context.user.id, "Configuração administrativa inicial do motivo.");
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_REASON", targetId: record.id });
    return record.id;
  });
}

const assessmentInput = z.object({
  boardId: z.string().default(""),
  certificateId: z.string().min(1), examinerPersonId: z.string().min(1),
  examinerCouncil: z.string().trim().min(2).max(100),
  opinion: z.string().trim().min(10).max(10000),
  decision: z.enum(["APPROVED", "REJECTED"]), assessedAt: z.coerce.date(),
  confirmLeave: z.boolean().default(false),
});

export async function assessCertificate(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = assessmentInput.parse(raw);
  const [original] = await sstDatabase(context).select({ budgetUnitId: sstCertificates.budgetUnitId }).from(sstCertificates).where(eq(sstCertificates.id, input.certificateId));
  if (!original) throw new SstValidationError("Atestado não encontrado.");
  await assertSstClinicalAccess(context, original.budgetUnitId, true);
  return withDatabaseTransaction(connection, async (tx) => {
    // Claim the state atomically: competing requests cannot generate duplicate leaves.
    const claimed = await tx.update(sstCertificates).set({ status: input.decision }).where(and(eq(sstCertificates.id, input.certificateId), eq(sstCertificates.status, "RECEIVED"))).returning({ id: sstCertificates.id });
    if (claimed.length !== 1) throw new SstValidationError("Este atestado já possui uma decisão. Atualize a consulta.");
    const [row] = await tx.select({ certificate: sstCertificates, reason: sstCertificateReasons }).from(sstCertificates).innerJoin(sstCertificateReasons, eq(sstCertificates.reasonId, sstCertificateReasons.id)).where(eq(sstCertificates.id, input.certificateId));
    const certificate = { ...row.certificate, reason: row.reason };
    const policy = z.object({ createLeaveOnApproval: z.boolean(), leaveType: z.string() }).parse(certificate.reasonSnapshot ?? certificate.reason);
    const [examiner] = await tx.select({ id: people.id }).from(people).where(eq(people.id, input.examinerPersonId));
    if (!examiner) throw new SstValidationError("Perito não encontrado no Cadastro Único.");
    if (input.assessedAt > new Date()) throw new SstValidationError("A perícia não pode ter data futura.");
    if (input.boardId) {
      const [board] = await tx.select().from(sstBoards).where(eq(sstBoards.id, input.boardId));
      const members = await tx.select().from(sstBoardMembers).where(eq(sstBoardMembers.boardId, input.boardId));
      if (!board?.isActive || board.budgetUnitId !== certificate.budgetUnitId || input.assessedAt < board.startsAt || input.assessedAt > board.endsAt || !members.some((member) => member.personId === examiner.id)) throw new SstValidationError("Junta fora da vigência, de outra UG ou sem o perito informado.");
    }
    const [confirmation] = await sstRows<{ confirmed: boolean }>(tx, sql`SELECT confirmed FROM "SstCertificateLeaveConfirmation" WHERE "certificateId"=${certificate.id}`);
    const generateLeave = input.decision === "APPROVED" && (policy.createLeaveOnApproval || input.confirmLeave || confirmation?.confirmed);
    if (generateLeave) {
      if (!canPerformModuleOperation(context.user, "RH", "create")) throw new SstValidationError("A integração exige permissão de inclusão no RH.");
      const activeRh = await findModuleActivation(tx, "RH");
      if (activeRh?.ativo === false) throw new SstValidationError("O módulo RH está desativado.");
      await assertCertificateHistoricalSource(tx, certificate);
      const [conflict] = await tx.select({ id: leaves.id }).from(leaves).where(and(eq(leaves.employeeId, certificate.employeeId), eq(leaves.status, "Ativa"), lte(leaves.startDate, certificate.endsAt), gte(leaves.endDate, certificate.startsAt))).limit(1);
      if (conflict) throw new SstValidationError("Já existe afastamento ativo neste período. Revise o vínculo antes de deferir.");
      const [leave] = await tx.insert(leaves).values({ employeeId: certificate.employeeId, type: policy.leaveType, startDate: certificate.startsAt, endDate: certificate.endsAt, reason: `Atestado ocupacional ${certificate.protocolNumber}`, status: "Ativa" }).returning({ id: leaves.id });
      await tx.update(sstCertificates).set({ leaveId: leave.id }).where(eq(sstCertificates.id, certificate.id));
    }
    await tx.insert(sstAssessments).values({ certificateId: certificate.id, boardId: input.boardId || null, examinerPersonId: examiner.id, examinerCouncil: input.examinerCouncil, decision: input.decision, opinion: input.opinion, assessedAt: input.assessedAt, createdById: context.user.id });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_ASSESSMENT", targetId: certificate.id });
    return certificate.id;
  });
}

export async function updateCertificateReason(context: AppContext, id: string, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = reasonInput.parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_REGIME_POLICY:${id}`}))`);
    const [reason] = await tx.select().from(sstCertificateReasons).where(eq(sstCertificateReasons.id, id));
    if (!reason || reason.budgetUnitId !== input.budgetUnitId) throw new SstValidationError("Motivo não encontrado nesta unidade gestora.");
    const roles = [...new Set(input.restrictedRoleIds)];
    if ((await sstRows<{ id: string }>(tx, sql`SELECT id FROM "Role" WHERE id=ANY(${sql.param(roles)}::text[])`)).length !== roles.length) throw new SstValidationError("Cargo não encontrado.");
    const { restrictedRegimeIds, ...reasonData } = input;
    await tx.update(sstCertificateReasons).set(reasonData).where(eq(sstCertificateReasons.id, id));
    await appendReasonRegimePolicy(tx, id, restrictedRegimeIds, context.user.id, "Retificação administrativa da configuração do motivo.");
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_REASON_UPDATED", targetId: id });
    return id;
  });
}
