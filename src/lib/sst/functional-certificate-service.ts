import { randomUUID } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import type { DatabaseTransaction } from "@/db/transaction";
import { withDatabaseTransaction } from "@/db/transaction";
import { sstCertificateReasons, sstCertificates } from "@/db/schema/sst-certificates";
import { leaves } from "@/db/schema/personnel-records";
import { people } from "@/db/schema/people";
import { findModuleActivation } from "@/db/repositories/platform/identity";
import { sstRows } from "@/db/repositories/sst/sql";
import { readSstFunctionalPeriods } from "@/db/repositories/sst/functional";
import type { JsonValue } from "@/db/json";
import { sstContextConnection, sstDatabase } from "./database";
import { z } from "zod";
import { assertBudgetUnitAccess, canPerformModuleOperation, AccessError, type AppContext } from "@/lib/platform/tenant-context";
import { assertSstClinicalAccess } from "./access";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { SstValidationError } from "./errors";

export async function appendReasonRegimePolicy(tx: DatabaseTransaction, reasonId: string, restrictedRegimeIds: string[], createdById: string, justification: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_REGIME_POLICY:${reasonId}`}))`);
  const ids = [...new Set(restrictedRegimeIds)];
  if ((await sstRows<{ id: string }>(tx, sql`SELECT id FROM "HrEmploymentRegime" WHERE id=ANY(${sql.param(ids)}::text[])`)).length !== ids.length) throw new SstValidationError("Regime não encontrado no RH.");
  const id = randomUUID();
  await tx.execute(sql`INSERT INTO "SstReasonRegimePolicy" (id,"reasonId",version,"restrictedRegimeIds",justification,"createdById") SELECT ${id},${reasonId},COALESCE(MAX(version),0)+1,${sql.param(ids)}::text[],${justification},${createdById} FROM "SstReasonRegimePolicy" WHERE "reasonId"=${reasonId}`);
  await writeAuditEvent(tx, { actorUsuarioId: createdById, eventType: auditEventTypes.administrativeMutation, targetType: "SST_REASON_REGIME_POLICY", targetId: id });
  return id;
}

export async function saveReasonRegimePolicy(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = z.object({ budgetUnitId: z.string().min(1), reasonId: z.string().min(1), restrictedRegimeIds: z.array(z.string().min(1)).max(100), justification: z.string().trim().min(10).max(1000) }).parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  if (!canPerformModuleOperation(context.user, "SST", "update")) throw new AccessError("Alteração SST não autorizada.", 403);
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_REGIME_POLICY:${input.reasonId}`}))`);
    if (!(await tx.select({ id: sstCertificateReasons.id }).from(sstCertificateReasons).where(and(eq(sstCertificateReasons.id, input.reasonId), eq(sstCertificateReasons.budgetUnitId, input.budgetUnitId)))).length) throw new SstValidationError("Motivo fora da UG.");
    return appendReasonRegimePolicy(tx, input.reasonId, input.restrictedRegimeIds, context.user.id, input.justification);
  });
}

export async function certificateFunctionalSource(tx: DatabaseTransaction, input: { employeeId: string; budgetUnitId: string; startsAt: Date; endsAt: Date; reasonId: string }) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_REGIME_POLICY:${input.reasonId}`}))`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`HR_FUNCTIONAL:${input.employeeId}`}))`);
  const [period] = await readSstFunctionalPeriods(tx, sql`p."employeeId"=${input.employeeId} AND p."budgetUnitId"=${input.budgetUnitId} AND NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) AND p."startsAt"<=${input.startsAt} AND p."endsAt">=${input.endsAt}`);
  if (!period) throw new SstValidationError("Cadastre um período funcional RH explícito da UG cobrindo todo o atestado. Mudança de vínculo no intervalo exige documentos separados.");
  const [policy] = await sstRows<{ id: string; restrictedRegimeIds: string[] }>(tx, sql`SELECT id,"restrictedRegimeIds" FROM "SstReasonRegimePolicy" WHERE "reasonId"=${input.reasonId} ORDER BY version DESC LIMIT 1`);
  if (policy?.restrictedRegimeIds.includes(period.employmentRegimeId)) throw new SstValidationError("Este motivo não permite atestados para o regime contratual selecionado.");
  return { period, policyId: policy?.id || null };
}

export async function confirmCertificateLeave(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = z.object({ certificateId: z.string().min(1), confirmed: z.boolean() }).parse(raw);
  const [cert] = await sstDatabase(context).select({ budgetUnitId: sstCertificates.budgetUnitId }).from(sstCertificates).where(eq(sstCertificates.id, input.certificateId));
  if (!cert) throw new SstValidationError("Atestado não encontrado.");
  await assertSstClinicalAccess(context, cert.budgetUnitId);
  if (!canPerformModuleOperation(context.user, "SST", "update") || (input.confirmed && !canPerformModuleOperation(context.user, "RH", "create"))) throw new AccessError("Confirmação exige alteração SST e inclusão RH.", 403);
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT id FROM "SstMedicalCertificate" WHERE id=${input.certificateId} FOR UPDATE`);
    const [current] = await tx.select().from(sstCertificates).where(eq(sstCertificates.id, input.certificateId));
    if (!current) throw new SstValidationError("Atestado não encontrado.");
    if (current.status !== "RECEIVED") throw new SstValidationError("Confirmação deve ocorrer antes da decisão pericial.");
    const [previous] = await sstRows<{ confirmed: boolean }>(tx, sql`SELECT confirmed FROM "SstCertificateLeaveConfirmation" WHERE "certificateId"=${current.id}`);
    if (previous) {
      if (previous.confirmed !== input.confirmed) throw new SstValidationError("Confirmação já registrada. O perito pode retificar a decisão com justificativa.");
      return current.id;
    }
    await tx.execute(sql`INSERT INTO "SstCertificateLeaveConfirmation" (id,"certificateId",confirmed,"createdById") VALUES (${randomUUID()},${current.id},${input.confirmed},${context.user.id})`);
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_LEAVE_CONFIRMATION", targetId: current.id });
    return current.id;
  });
}

export async function assertCertificateHistoricalSource(tx: DatabaseTransaction, certificate: { id: string; employeeId: string; budgetUnitId: string; startsAt: Date; endsAt: Date }) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`HR_FUNCTIONAL:${certificate.employeeId}`}))`);
  const [source] = await sstRows<{ snapshot: JsonValue }>(tx, sql`SELECT s.snapshot FROM "SstCertificateFunctionalSource" s JOIN "HrEmployeeFunctionalPeriod" p ON p.id=s."functionalPeriodId" JOIN "HrBudgetUnitEntityMapping" m ON m."budgetUnitId"=p."budgetUnitId" AND m."governmentEntityId"=p."governmentEntityId" WHERE s."certificateId"=${certificate.id} AND p."employeeId"=${certificate.employeeId} AND p."budgetUnitId"=${certificate.budgetUnitId} AND p."startsAt"<=${certificate.startsAt} AND p."endsAt">=${certificate.endsAt}`);
  if (!source) throw new SstValidationError("Atestado sem fonte funcional histórica comprovada. Regularize a origem contratual antes de gerar afastamento.");
  // Original contractual and reason policy snapshot remains authoritative for the issued document.
  return source.snapshot;
}

// Canonical posted Leave origins must be fully compensated before clinical revision.
// Unknown legacy allocations keep the conservative reconciliation block.
export async function assertCertificatePayrollReconciliation(tx: DatabaseTransaction, employeeId: string, startsAt: Date, endsAt: Date, certificateId?: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('SST_CANONICAL_PAYROLL_POSTING'))`);
  if (certificateId) {
    const origins = await sstRows<{ id: string; compensated: boolean; unlinked: boolean }>(tx, sql`SELECT o.id,EXISTS(SELECT 1 FROM "SstLeavePayrollOrigin" r WHERE r."reversesId"=o.id) AS compensated,EXISTS(SELECT 1 FROM "PayrollItem" legacy JOIN "Payroll" p ON p.id=legacy."payrollId" JOIN "PayrollItem" source ON source.id=o."payrollItemId" WHERE legacy."employeeId"=${employeeId} AND p.competence=o.competence AND legacy."eventId"=source."eventId" AND NOT EXISTS(SELECT 1 FROM "SstLeavePayrollOrigin" known WHERE known."payrollItemId"=legacy.id)) AS unlinked FROM "SstLeavePayrollOrigin" o WHERE o."certificateId"=${certificateId} AND o.kind='POST'`);
    if (origins.length) {
      if (origins.some((o) => !o.compensated)) throw new SstValidationError("Compense todas as origens monetárias do atestado por mapeamento RH aprovado antes de retificar/revogar a decisão.");
      if (origins.some((o) => o.unlinked)) throw new SstValidationError("Há reflexo legado sem origem canônica na competência. Reconcilie o evento antes de retificar/revogar.");
      const uncovered = await sstRows<{ id: string }>(tx, sql`SELECT DISTINCT p.id FROM "PayrollItem" i JOIN "Payroll" p ON p.id=i."payrollId" WHERE i."employeeId"=${employeeId} AND p.competence ~ '^(0[1-9]|1[0-2])/[2-9][0-9]{3}$' AND to_date('01/'||p.competence,'DD/MM/YYYY')<=(((${endsAt}::timestamptz-interval '1 millisecond') AT TIME ZONE 'America/Sao_Paulo')::date) AND (to_date('01/'||p.competence,'DD/MM/YYYY')+interval '1 month')>(${startsAt}::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date AND NOT EXISTS(SELECT 1 FROM "SstLeavePayrollOrigin" o WHERE o."certificateId"=${certificateId} AND o.kind='POST' AND o.competence=p.competence)`);
      if (uncovered.length) throw new SstValidationError("Há competência calculada sem origem de afastamento conciliada. Regularize todas as competências afetadas antes da decisão.");
      return { status: "RECONCILED_CANONICAL_LEAVE_COMPENSATION", source: "SST_CERTIFICATE_DECISION", originIds: origins.map((o) => o.id), financialEntriesCreated: false, paymentStatus: "NOT_VERIFIED" };
    }
  }
  const items = await sstRows<{ id: string; payroll: { id: string; competence: string; status: string } }>(tx, sql`SELECT i.id,jsonb_build_object('id',p.id,'competence',p.competence,'status',p.status) AS payroll FROM "PayrollItem" i JOIN "Payroll" p ON p.id=i."payrollId" WHERE i."employeeId"=${employeeId}`);
  const civilMonth = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(date);
    return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
  };
  const from = civilMonth(startsAt);
  const to = civilMonth(new Date(endsAt.getTime() - 1));
  for (const item of items) {
    const match = /^(\d{2})\/(\d{4})$/.exec(item.payroll.competence);
    if (!match) throw new SstValidationError("Competência da folha sem formato canônico; reconciliação RH necessária.");
    const month = `${match[2]}-${match[1]}`;
    if (month < from || month > to) continue;
    if (["Fechada", "Paga"].includes(item.payroll.status)) throw new SstValidationError("Competência fechada/paga: reabertura ou ajuste formal RH/Folha necessário antes de retificar/revogar.");
    throw new SstValidationError("Há folha calculada na competência. Falta origem canônica do reflexo para reconciliar a alteração; solicite ajuste RH/Folha.");
  }
  return { status: "PENDING_CANONICAL_PAYROLL_ORIGIN", source: "SST_CERTIFICATE_DECISION", financialEntriesCreated: false, paymentStatus: "NOT_VERIFIED" };
}

export async function reviseCertificateDecision(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = z.object({ certificateId: z.string().min(1), decision: z.enum(["APPROVED", "REJECTED", "REVOKED"]), reason: z.string().trim().min(10).max(10000), examinerPersonId: z.string().min(1), examinerCouncil: z.string().trim().min(3).max(100), expectedStatus: z.string().min(1), expectedRevisionId: z.string().default(""), confirmLeave: z.boolean().default(false) }).parse(raw);
  const [original] = await sstDatabase(context).select({ budgetUnitId: sstCertificates.budgetUnitId }).from(sstCertificates).where(eq(sstCertificates.id, input.certificateId));
  if (!original) throw new SstValidationError("Atestado não encontrado.");
  await assertSstClinicalAccess(context, original.budgetUnitId, true);
  if (!canPerformModuleOperation(context.user, "SST", "update")) throw new AccessError("Alteração SST não autorizada.", 403);
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT id FROM "SstMedicalCertificate" WHERE id=${input.certificateId} FOR UPDATE`);
    const [row] = await tx.select({ certificate: sstCertificates, reason: sstCertificateReasons }).from(sstCertificates).innerJoin(sstCertificateReasons, eq(sstCertificates.reasonId, sstCertificateReasons.id)).where(eq(sstCertificates.id, input.certificateId));
    if (!row) throw new SstValidationError("Atestado não encontrado.");
    const cert = { ...row.certificate, reason: row.reason };
    const [latest] = await sstRows<{ id: string; revision: number }>(tx, sql`SELECT id,revision FROM "SstCertificateDecisionRevision" WHERE "certificateId"=${cert.id} ORDER BY revision DESC LIMIT 1`);
    if ((latest?.id || "") !== input.expectedRevisionId) throw new SstValidationError("Decisão retificada por outra operação. Atualize a consulta.");
    if (cert.status === "RECEIVED" || cert.status !== input.expectedStatus || cert.status === input.decision) throw new SstValidationError("Decisão alterada ou sem retificação aplicável. Atualize a consulta.");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('SST_CANONICAL_PAYROLL_POSTING'))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`HR_FUNCTIONAL:${cert.employeeId}`}))`);
    if (!(await tx.select({ id: people.id }).from(people).where(eq(people.id, input.examinerPersonId))).length) throw new SstValidationError("Perito não encontrado no Cadastro Único.");
    const reconciliation = await assertCertificatePayrollReconciliation(tx, cert.employeeId, cert.startsAt, cert.endsAt, cert.id);
    const policy = z.object({ createLeaveOnApproval: z.boolean(), leaveType: z.string() }).parse(cert.reasonSnapshot ?? cert.reason);
    const generate = input.decision === "APPROVED" && (policy.createLeaveOnApproval || input.confirmLeave);
    if ((cert.leaveId || generate) && !canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Retificação do afastamento exige alteração RH.", 403);
    if (generate && !canPerformModuleOperation(context.user, "RH", "create")) throw new AccessError("Novo afastamento exige inclusão RH.", 403);
    if (cert.leaveId || generate) {
      const rh = await findModuleActivation(tx, "RH");
      if (rh?.ativo === false) throw new SstValidationError("RH desativado.");
    }
    if (cert.leaveId) {
      await tx.execute(sql`SELECT set_config('sst.certificate_revision', 'on', true)`);
      await tx.update(leaves).set({ status: "Revogada SST" }).where(eq(leaves.id, cert.leaveId));
    }
    let newLeaveId: string | null = null;
    if (generate) {
      await assertCertificateHistoricalSource(tx, cert);
      if ((await tx.select({ id: leaves.id }).from(leaves).where(and(eq(leaves.employeeId, cert.employeeId), eq(leaves.status, "Ativa"), lt(leaves.startDate, cert.endsAt), gt(leaves.endDate, cert.startsAt))).limit(1)).length) throw new SstValidationError("Já existe afastamento ativo no período.");
      const [leave] = await tx.insert(leaves).values({ employeeId: cert.employeeId, type: policy.leaveType, startDate: cert.startsAt, endDate: cert.endsAt, reason: `Retificação SST ${cert.protocolNumber}`, status: "Ativa" }).returning({ id: leaves.id });
      newLeaveId = leave.id;
    }
    const id = randomUUID();
    await tx.execute(sql`INSERT INTO "SstCertificateDecisionRevision" (id,"certificateId",revision,"previousStatus",decision,reason,"examinerPersonId","examinerCouncil","previousLeaveId","newLeaveId",reconciliation,"createdById") VALUES (${id},${cert.id},${(latest?.revision || 0) + 1},${cert.status},${input.decision},${input.reason},${input.examinerPersonId},${input.examinerCouncil},${cert.leaveId},${newLeaveId},${JSON.stringify(reconciliation)}::jsonb,${context.user.id})`);
    await tx.update(sstCertificates).set({ status: input.decision, leaveId: newLeaveId }).where(eq(sstCertificates.id, cert.id));
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_CERTIFICATE_DECISION_REVISION", targetId: id });
    return cert.id;
  });
}
