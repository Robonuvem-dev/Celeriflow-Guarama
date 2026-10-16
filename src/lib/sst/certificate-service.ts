import type { AppContext } from "@/lib/platform/tenant-context";
import { assertBudgetUnitAccess, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { certificateInput, reasonInput, assertCertificateReason } from "./certificate-policy";
import { assertSstClinicalAccess } from "./access";
import { z } from "zod";
import { getProtocolContext, protocolScope } from "@/lib/protocols/access";
import { SstValidationError } from "./errors";
import { certificateFunctionalSource, assertCertificateHistoricalSource, appendReasonRegimePolicy } from "./functional-certificate-service";

export async function registerCertificate(context: AppContext, raw: unknown) {
  const input = certificateInput.parse(raw);
  await assertSstClinicalAccess(context, input.budgetUnitId);
  if (input.processId) {
    const protocolContext = await getProtocolContext();
    const process = await protocolContext.prisma.process.findFirst({ where: { AND: [{ id: input.processId }, protocolScope(protocolContext)] }, select: { id: true } });
    if (!process) throw new SstValidationError("Processo não encontrado ou sem acesso ao seu setor.");
  }
  return context.prisma.$transaction(async (tx) => {
    // Same lock/order as reason editing: reason settings and regime policy form one snapshot.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_REGIME_POLICY:${input.reasonId}`}))`;
    const [unit, employee, reason, issuer] = await Promise.all([
      tx.budgetUnit.findUnique({ where: { id: input.budgetUnitId } }),
      tx.employee.findUnique({ where: { id: input.employeeId } }),
      tx.sstCertificateReason.findUnique({ where: { id: input.reasonId } }),
      tx.person.findUnique({ where: { id: input.issuerPersonId }, select: { id: true } }),
    ]);
    if (!unit || !employee?.isActive) throw new SstValidationError("Servidor ou unidade gestora inválidos.");
    if (!issuer || !reason?.isActive || reason.budgetUnitId !== unit.id) throw new SstValidationError("Emitente ou motivo inválido.");
    const dependent = input.dependentId ? await tx.dependent.findFirst({ where: { id: input.dependentId, employeeId: employee.id } }) : null;
    if (input.dependentId && !dependent) throw new SstValidationError("O dependente não pertence ao servidor.");
    const presentedAt = reason.autoPresentedAt ? new Date() : new Date(input.presentedAt);
    if (!Number.isFinite(presentedAt.getTime())) throw new SstValidationError("Informe uma data de apresentação válida.");
    const protocolNumber = reason.autoProtocol ? `SST-${input.submissionKey}` : input.protocolNumber;
    if (!protocolNumber) throw new SstValidationError("Informe o protocolo de entrega.");
    const existing = await tx.sstMedicalCertificate.findUnique({ where: { budgetUnitId_protocolNumber: { budgetUnitId: unit.id, protocolNumber } } });
    if (existing) {
      const sameRequest = reason.autoProtocol && existing.createdById === context.user.id && existing.employeeId === employee.id && existing.reasonId === reason.id && existing.issuerPersonId === issuer.id && existing.issuerCouncil === input.issuerCouncil && existing.startsAt.getTime() === input.startsAt.getTime() && existing.endsAt.getTime() === input.endsAt.getTime() && (existing.dependentId || "") === input.dependentId && (existing.processId || "") === input.processId && (reason.autoPresentedAt || existing.presentedAt.getTime() === presentedAt.getTime()) && [...existing.cidCodes].sort().join(",") === [...new Set(input.cidCodes)].sort().join(",");
      if (!sameRequest) throw new SstValidationError("O protocolo já foi utilizado. Confira os dados antes de registrar outro atestado.");
      const settings = z.object({ printReceipt: z.boolean().default(false), suggestLeave: z.boolean().default(false) }).parse(existing.reasonSnapshot ?? reason);
      return { id: existing.id, printReceipt: settings.printReceipt, suggestLeave: settings.suggestLeave };
    }
    const source = await certificateFunctionalSource(tx, input);
    assertCertificateReason(reason, source.period.roleId, input.dependentId);
    const codes = [...new Set(input.cidCodes.map((code) => code.replaceAll(".", "")))];
    if (codes.length) {
      const references = await tx.healthSusReference.findMany({ where: { kind: "CID", isActive: true, isCurrent: true, code: { in: [...new Set(input.cidCodes.flatMap((code) => [code, code.replaceAll(".", ""), code.length > 3 && !code.includes(".") ? `${code.slice(0, 3)}.${code.slice(3)}` : code]))] } }, select: { code: true } });
      const canonical = new Set(references.map((reference) => reference.code.replaceAll(".", "")));
      if (codes.some((code) => !canonical.has(code))) throw new SstValidationError("CID não encontrado no catálogo oficial ativo. Atualize o catálogo canônico de Saúde.");
    }
    const record = await tx.sstMedicalCertificate.create({ data: {
      budgetUnitId: unit.id, employeeId: employee.id, reasonId: reason.id,
      issuerPersonId: issuer.id, issuerCouncil: input.issuerCouncil,
      dependentId: dependent?.id, relationship: dependent?.relationship,
      startsAt: input.startsAt, endsAt: input.endsAt, presentedAt, protocolNumber,
      processId: input.processId || null,
      cidCodes: [...new Set(input.cidCodes)], roleIdSnapshot: source.period.roleId,
      departmentIdSnapshot: source.period.departmentId, createdById: context.user.id,
      reasonSnapshot: { name: reason.name, createLeaveOnApproval: reason.createLeaveOnApproval, leaveType: reason.leaveType, suggestLeave: reason.suggestLeave, printReceipt: reason.printReceipt },
    } });
    await tx.$executeRaw`INSERT INTO "SstCertificateFunctionalSource" ("certificateId","functionalPeriodId","regimePolicyId",snapshot) VALUES (${record.id},${source.period.id},${source.policyId},${JSON.stringify(source.period)}::jsonb)`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_CERTIFICATE", targetId: record.id });
    return { id: record.id, printReceipt: reason.printReceipt, suggestLeave: reason.suggestLeave };
  });
}

export async function registerCertificateReason(context: AppContext, raw: unknown) {
  const input = reasonInput.parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return context.prisma.$transaction(async (tx) => {
    const unit = await tx.budgetUnit.findUnique({ where: { id: input.budgetUnitId } });
    if (!unit) throw new SstValidationError("Unidade gestora não encontrada.");
    const roleIds = [...new Set(input.restrictedRoleIds)];
    if (roleIds.length && await tx.role.count({ where: { id: { in: roleIds } } }) !== roleIds.length) throw new SstValidationError("Um dos cargos selecionados não existe no cadastro funcional.");
    const { restrictedRegimeIds, ...reasonData } = input;
    const record = await tx.sstCertificateReason.create({ data: reasonData });
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

export async function assessCertificate(context: AppContext, raw: unknown) {
  const input = assessmentInput.parse(raw);
  const original = await context.prisma.sstMedicalCertificate.findUnique({ where: { id: input.certificateId }, select: { budgetUnitId: true } });
  if (!original) throw new SstValidationError("Atestado não encontrado.");
  await assertSstClinicalAccess(context, original.budgetUnitId, true);
  return context.prisma.$transaction(async (tx) => {
    // Claim the state atomically: competing requests cannot generate duplicate leaves.
    const claimed = await tx.sstMedicalCertificate.updateMany({ where: { id: input.certificateId, status: "RECEIVED" }, data: { status: input.decision } });
    if (claimed.count !== 1) throw new SstValidationError("Este atestado já possui uma decisão. Atualize a consulta.");
    const certificate = await tx.sstMedicalCertificate.findUniqueOrThrow({ where: { id: input.certificateId }, include: { reason: true } });
    const policy = z.object({ createLeaveOnApproval: z.boolean(), leaveType: z.string() }).parse(certificate.reasonSnapshot ?? certificate.reason);
    const examiner = await tx.person.findUnique({ where: { id: input.examinerPersonId }, select: { id: true } });
    if (!examiner) throw new SstValidationError("Perito não encontrado no Cadastro Único.");
    if (input.assessedAt > new Date()) throw new SstValidationError("A perícia não pode ter data futura.");
    if (input.boardId) {
      const board = await tx.sstMedicalBoard.findUnique({ where: { id: input.boardId }, include: { members: true } });
      if (!board?.isActive || board.budgetUnitId !== certificate.budgetUnitId || input.assessedAt < board.startsAt || input.assessedAt > board.endsAt || !board.members.some((member) => member.personId === examiner.id)) throw new SstValidationError("Junta fora da vigência, de outra UG ou sem o perito informado.");
    }
    const [confirmation] = await tx.$queryRaw<{ confirmed: boolean }[]>`SELECT confirmed FROM "SstCertificateLeaveConfirmation" WHERE "certificateId"=${certificate.id}`;
    const generateLeave = input.decision === "APPROVED" && (policy.createLeaveOnApproval || input.confirmLeave || confirmation?.confirmed);
    if (generateLeave) {
      if (!canPerformModuleOperation(context.user, "RH", "create")) throw new SstValidationError("A integração exige permissão de inclusão no RH.");
      const activeRh = await tx.configuracaoModulo.findUnique({ where: { codigo: "RH" } });
      if (activeRh?.ativo === false) throw new SstValidationError("O módulo RH está desativado.");
      await assertCertificateHistoricalSource(tx, certificate);
      const conflict = await tx.leave.findFirst({ where: { employeeId: certificate.employeeId, status: "Ativa", startDate: { lte: certificate.endsAt }, endDate: { gte: certificate.startsAt } }, select: { id: true } });
      if (conflict) throw new SstValidationError("Já existe afastamento ativo neste período. Revise o vínculo antes de deferir.");
      const leave = await tx.leave.create({ data: { employeeId: certificate.employeeId, type: policy.leaveType, startDate: certificate.startsAt, endDate: certificate.endsAt, reason: `Atestado ocupacional ${certificate.protocolNumber}`, status: "Ativa" } });
      await tx.sstMedicalCertificate.update({ where: { id: certificate.id }, data: { leaveId: leave.id } });
    }
    await tx.sstMedicalAssessment.create({ data: { certificateId: certificate.id, boardId: input.boardId || null, examinerPersonId: examiner.id, examinerCouncil: input.examinerCouncil, decision: input.decision, opinion: input.opinion, assessedAt: input.assessedAt, createdById: context.user.id } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_ASSESSMENT", targetId: certificate.id });
    return certificate.id;
  });
}

export async function updateCertificateReason(context: AppContext, id: string, raw: unknown) {
  const input = reasonInput.parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_REGIME_POLICY:${id}`}))`;
    const reason = await tx.sstCertificateReason.findUnique({ where: { id } });
    if (!reason || reason.budgetUnitId !== input.budgetUnitId) throw new SstValidationError("Motivo não encontrado nesta unidade gestora.");
    const roles = [...new Set(input.restrictedRoleIds)];
    if (await tx.role.count({ where: { id: { in: roles } } }) !== roles.length) throw new SstValidationError("Cargo não encontrado.");
    const { restrictedRegimeIds, ...reasonData } = input;
    await tx.sstCertificateReason.update({ where: { id }, data: reasonData });
    await appendReasonRegimePolicy(tx, id, restrictedRegimeIds, context.user.id, "Retificação administrativa da configuração do motivo.");
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_REASON_UPDATED", targetId: id });
    return id;
  });
}
