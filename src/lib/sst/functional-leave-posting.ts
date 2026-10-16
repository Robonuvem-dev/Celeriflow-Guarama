import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { assertSstClinicalAccess } from "./access";
import { leavePostingInput, leaveReversalInput } from "./functional-leave-policy";
import { SstValidationError } from "./errors";

export type LeavePostingResult = { status: "POSTED" | "ALREADY_POSTED" | "BLOCKED"; originId?: string; payrollItemId?: string; amount?: string; blockers: string[] };
const postingResult = z.object({ status: z.enum(["POSTED", "ALREADY_POSTED", "BLOCKED"]), originId: z.string().optional(), payrollItemId: z.string().optional(), amount: z.string().optional(), blockers: z.array(z.string()) });
class PostingBlocked extends Error { constructor(readonly result: LeavePostingResult) { super(result.blockers.join(" · ")); } }

export async function reconcileCertificateLeavePayroll(context: AppContext, raw: unknown): Promise<LeavePostingResult> {
  const request = z.object({ operation: z.enum(["POST", "REVERSE"]), certificateId: z.string().min(1), payrollId: z.string().min(1), ruleId: z.string().min(1), originId: z.string().default(""), reason: z.string().default(""), confirmPayrollScope: z.boolean().default(false), scopeSourceReference: z.string().trim().max(1000).default("") }).parse(raw);
  if (!canPerformModuleOperation(context.user, "SST", "update") || !canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Reconciliação exige alteração SST e RH.", 403);
  const cert = await context.prisma.sstMedicalCertificate.findUnique({ where: { id: request.certificateId }, select: { budgetUnitId: true } });
  if (!cert) throw new SstValidationError("Atestado não encontrado.");
  await assertSstClinicalAccess(context, cert.budgetUnitId);
  if (request.operation === "POST") leavePostingInput.parse({ certificateId: request.certificateId, payrollId: request.payrollId, ruleId: request.ruleId });
  else leaveReversalInput.parse({ originId: request.originId, payrollId: request.payrollId, ruleId: request.ruleId, reason: request.reason });
  if (request.confirmPayrollScope && request.scopeSourceReference.length < 10) throw new SstValidationError("Confirmação do escopo da folha exige documento de origem com pelo menos 10 caracteres.");
  try {
    return await context.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SstMedicalCertificate" WHERE id=${request.certificateId} FOR UPDATE`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('SST_CANONICAL_PAYROLL_POSTING'))`;
      const [pay] = await tx.$queryRaw<{ id: string; competence: string; status: string; type: string }[]>`SELECT id,competence,status,type FROM "Payroll" WHERE id=${request.payrollId} FOR UPDATE`;
      if (!pay) throw new PostingBlocked({ status: "BLOCKED", blockers: ["PAYROLL_NOT_FOUND"] });
      const [scope] = await tx.$queryRaw<{ budgetUnitId: string; governmentEntityId: string }[]>`SELECT "budgetUnitId","governmentEntityId" FROM "SstBenefitPayrollScope" WHERE "payrollId"=${pay.id}`;
      if (scope) {
        assertBudgetUnitAccess(context.user, scope.budgetUnitId);
        if (scope.budgetUnitId !== cert.budgetUnitId) throw new PostingBlocked({ status: "BLOCKED", blockers: ["PAYROLL_CERTIFICATE_UG_MISMATCH"] });
      } else {
        if (!request.confirmPayrollScope) throw new PostingBlocked({ status: "BLOCKED", blockers: ["EXPLICIT_PAYROLL_UG_ENTITY_SCOPE_REQUIRED"] });
        if (pay.status !== "Aberta" || pay.type !== "Mensal") throw new PostingBlocked({ status: "BLOCKED", blockers: ["OPEN_MONTHLY_PAYROLL_REQUIRED"] });
        const [mapping] = await tx.$queryRaw<{ governmentEntityId: string }[]>`SELECT "governmentEntityId" FROM "HrBudgetUnitEntityMapping" WHERE "budgetUnitId"=${cert.budgetUnitId}`;
        if (!mapping) throw new PostingBlocked({ status: "BLOCKED", blockers: ["VERIFIED_UG_ENTITY_MAPPING_REQUIRED"] });
        // Explicit operator attestation, shared canonical scope and immutable documentary evidence.
        await tx.$executeRaw`INSERT INTO "SstBenefitPayrollScope" ("payrollId","budgetUnitId","governmentEntityId",competence,"createdById") VALUES (${pay.id},${cert.budgetUnitId},${mapping.governmentEntityId},${pay.competence},${context.user.id})`;
        await tx.$executeRaw`INSERT INTO "SstLeavePayrollScopeEvidence" (id,"payrollId","certificateId","sourceReference","createdById") VALUES (${randomUUID()},${pay.id},${request.certificateId},${request.scopeSourceReference},${context.user.id})`;
      }
      const [row] = await tx.$queryRaw<{ result: unknown }[]>`SELECT sst_post_certificate_leave(${request.certificateId},${pay.id},${request.ruleId},${randomUUID()},${context.user.id},${request.operation === "REVERSE" ? request.originId : null},${request.operation === "REVERSE" ? request.reason : null}) AS result`;
      const result = postingResult.parse(row.result);
      if (result.status === "BLOCKED") throw new PostingBlocked(result); // Includes rollback of newly confirmed scope/evidence.
      return result;
    }, { timeout: 30_000 });
  } catch (error) { if (error instanceof PostingBlocked) return error.result; throw error; }
}
