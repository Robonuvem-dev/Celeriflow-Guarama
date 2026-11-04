import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { hrFunctionalRecords, hrRetirementAssessments } from "@/db/schema/personnel-functional-management";
import { personnelActs } from "@/db/schema/personnel-records";
import { requireEmploymentContract, requireEmploymentRegime } from "@/db/repositories/personnel/workforce";
import { enqueueHrIntegration, findHrIntegrationEvent, lockPersonnel, stablePersonnelJson } from "@/db/repositories/personnel/integration";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertFunctionalHolderAccess } from "./functional-record-service";
import { assertPersonnelDepartment, personnelScope } from "./personnel-scope";
import { reportCompleteHistoryPredicate } from "./report-filters";

const concessionInput = z.object({ assessmentId: z.string().min(1), benefitContractId: z.string().min(1), startsAt: z.iso.date(), actNumber: z.string().trim().min(3).max(200), legalReference: z.string().trim().min(10).max(4000) }).strict();

/** A dated act links a sealed calculation to its own benefit contract atomically. */
export async function concedeRetirement(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  const input = concessionInput.parse(raw), start = new Date(`${input.startsAt}T00:00:00Z`);
  return withDatabaseTransaction(connection, async tx => {
    await lockPersonnel(tx, "functional-configuration");
    await lockPersonnel(tx, `retirement-concession:${input.assessmentId}`);
    const [assessment] = await tx.select().from(hrRetirementAssessments).where(eq(hrRetirementAssessments.id, input.assessmentId));
    if (!assessment) throw new Error("Memória de concessão emitida não encontrada.");
    if (createHash("sha256").update(stablePersonnelJson(assessment.snapshot)).digest("hex") !== assessment.snapshotHash) throw new Error("Memória de concessão com integridade divergente.");
    await assertFunctionalHolderAccess(tx, context, assessment.employeeId);
    const scope = personnelScope(context.user);
    if (!(await tx.execute(sql`SELECT 1 WHERE ${reportCompleteHistoryPredicate({ authorizedDepartmentIds: scope.departments === "TODOS" ? undefined : scope.departments }, sql`${assessment.employeeId}`, sql`${assessment.referenceDate}`)}`)).rows.length) throw new Error("A concessão exige acesso às lotações históricas incluídas na memória.");
    await lockPersonnel(tx, `employee:${assessment.employeeId}`);
    for (const id of [assessment.contractId, input.benefitContractId].sort()) await lockPersonnel(tx, `contract:${id}`);
    const sourceKey = `CONCESSAO_APOSENTADORIA:${assessment.id}`, fingerprint = stablePersonnelJson(input);
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      const original = z.object({ fingerprint: z.string(), benefitContractId: z.string(), actId: z.string() }).parse(previous.payload);
      if (original.fingerprint !== fingerprint) throw new Error("Esta memória já fundamentou concessão com outros termos.");
      return { id: original.benefitContractId, actId: original.actId };
    }
    const former = await requireEmploymentContract(tx, assessment.contractId), benefit = await requireEmploymentContract(tx, input.benefitContractId);
    assertPersonnelDepartment(context.user, former.departmentId); assertPersonnelDepartment(context.user, benefit.departmentId);
    if (benefit.id === former.id || benefit.employeeId !== former.employeeId || benefit.status !== "ATIVO") throw new Error("Selecione um vínculo previdenciário próprio e ativo do mesmo titular, distinto do contrato de serviço.");
    if (former.status !== "INATIVO" || !former.endsAt || former.endsAt >= start) throw new Error("A concessão exige o vínculo de serviço encerrado antes do início do benefício, com o respectivo ato funcional.");
    if (assessment.referenceDate > start || benefit.admittedAt.getTime() !== start.getTime()) throw new Error("Início do benefício deve corresponder à admissão do vínculo próprio e não pode preceder a memória emitida.");
    const regime = await requireEmploymentRegime(tx, benefit.regimeId);
    if (!regime.isActive || regime.ruleSet.status !== "ATIVA" || regime.ruleSet.effectiveFrom > start || regime.ruleSet.effectiveUntil && regime.ruleSet.effectiveUntil < start) throw new Error("Regime previdenciário e parâmetros devem estar ativos na concessão.");
    if ((await tx.select({ id: hrFunctionalRecords.id }).from(hrFunctionalRecords).where(and(eq(hrFunctionalRecords.contractId, benefit.id), eq(hrFunctionalRecords.kind, "CATEGORIA_FOLHA"), sql`${hrFunctionalRecords.status}<>'CANCELADO'`))).length) throw new Error("Vínculo já possui enquadramento de categoria; concilie antes de conceder.");
    if ((await tx.execute(sql`SELECT 1 FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" WHERE s."contractId"=${benefit.id} AND r.status='FECHADA' LIMIT 1`)).rows.length) throw new Error("Vínculo de benefício já possui folha encerrada. A concessão não altera fotografias fechadas.");
    if ((await tx.execute(sql`SELECT 1 FROM "HrIntegrationEvent" WHERE "eventType"='APOSENTADORIA_CONCEDIDA' AND payload->>'sourceContractId'=${former.id} LIMIT 1`)).rows.length) throw new Error("O vínculo de serviço já possui concessão de aposentadoria vinculada.");
    await tx.execute(sql`SELECT set_config('celeriflow.actor_id',${context.user.id},true)`);
    const [act] = await tx.insert(personnelActs).values({ employeeId: assessment.employeeId, type: "Concessão de aposentadoria", actNumber: input.actNumber, date: start }).returning();
    const [category] = await tx.insert(hrFunctionalRecords).values({ key: sourceKey, kind: "CATEGORIA_FOLHA", name: `Aposentadoria · ${input.actNumber}`, employeeId: assessment.employeeId, contractId: benefit.id, startsAt: start, endsAt: benefit.endsAt, actorId: context.user.id, data: { category: "APOSENTADO", amount: assessment.amount, beneficiaryPersonId: "", legalReference: input.legalReference } }).returning();
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: "INTERNO", eventType: "APOSENTADORIA_CONCEDIDA", payload: { fingerprint, input, employeeId: assessment.employeeId, sourceContractId: former.id, benefitContractId: benefit.id, contractId: benefit.id, assessmentId: assessment.id, assessmentHash: assessment.snapshotHash, amount: assessment.amount, actId: act.id, categoryRecordId: category.id, actorId: context.user.id, financialPaymentConfirmed: false, sourceHistoryPreserved: true } });
    return { id: benefit.id, actId: act.id };
  });
}
