import { Decimal } from "@/db/decimal";
import { eq, sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { activePortalEmployee, changePortalEvent, portalEvent, portalEvents, requiredPortalRequest } from "@/db/repositories/portal-servidor/records";
import { employeePortalRequests } from "@/db/schema/employee-portal";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { evaluationPolicySchema } from "./career-service";
import { enqueueHrIntegration } from "@/lib/rh/workforce-service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";

export const assessmentPayloadSchema = z.object({ cycleId: z.string(), cycleName: z.string(), employeeName: z.string(), policy: evaluationPolicySchema });
const commissionResultSchema = z.object({ requestId: z.string(), employeeId: z.string(), actorId: z.string(), answers: z.record(z.string(), z.number()), comment: z.string(), score: z.string() });
export const publishedEvaluationSchema = z.object({
  requestId: z.string(), employeeId: z.string(), cycleName: z.string(), employeeName: z.string(),
  policy: evaluationPolicySchema, conclusion: z.string(), evidenceReference: z.string(),
  releaseAt: z.iso.datetime(), publishedAt: z.iso.datetime(), publisherId: z.string(),
  scores: z.array(z.object({ evaluatorId: z.string(), score: z.string(), answers: z.record(z.string(), z.number()) })),
});

export async function publishFunctionalEvaluationResult(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ requestId: z.string().min(1), conclusion: z.string().trim().min(10).max(4000), evidenceReference: z.string().trim().min(5).max(2000), releaseAt: z.iso.datetime({ offset: true }) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para publicar resultados funcionais.", 403);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const request = await requiredPortalRequest(tx, input.requestId);
    if (request.kind !== "AVALIACAO_FUNCIONAL") throw new AccessError("Avaliação indisponível.", 404);
    const payload = assessmentPayloadSchema.parse(request.payload);
    assertBudgetUnitAccess(context.user, payload.policy.budgetUnitId);
    if (request.employeeId === context.user.employeeId) throw new AccessError("O titular não pode publicar o próprio resultado.", 403);
    const sourceKey = `PORTAL:RESULTADO_AVALIACAO:${request.id}`;
    const previous = await portalEvent(tx, sql`"sourceKey"=${sourceKey}`);
    const releaseAt = new Date(input.releaseAt).toISOString();
    if (previous) {
      const stored = publishedEvaluationSchema.parse(previous.payload);
      if (previous.status !== "PROCESSADO" || stored.conclusion !== input.conclusion || stored.evidenceReference !== input.evidenceReference || stored.releaseAt !== releaseAt) throw new Error("Resultado já publicado com outros dados; preserve o histórico e registre um novo ciclo para revisão.");
      return previous.id;
    }
    if (request.status !== "AVALIADA") throw new Error("Conclua todas as avaliações designadas antes de publicar o resultado.");
    const events = await portalEvents(tx, sql`domain='PORTAL' AND "eventType"='AVALIACAO_COMISSAO_REGISTRADA' AND status='PROCESSADO' AND payload->>'requestId'=${request.id}`, sql`"sourceKey" ASC`);
    const scores = events.map(event => commissionResultSchema.parse(event.payload));
    if (scores.length !== payload.policy.commissionUserIds.length || new Set(scores.map(score => score.actorId)).size !== scores.length || scores.some(score => score.employeeId !== request.employeeId || !payload.policy.commissionUserIds.includes(score.actorId))) throw new Error("Comissão incompleta ou divergente do instrumento enviado.");
    const result = await enqueueHrIntegration(tx, { sourceKey, domain: "PORTAL", environment: "INTERNO", eventType: "RESULTADO_AVALIACAO_PUBLICADO", payload: { ...payload, requestId: request.id, employeeId: request.employeeId, conclusion: input.conclusion, evidenceReference: input.evidenceReference, releaseAt, publishedAt: new Date().toISOString(), publisherId: context.user.id, scores: scores.map(score => ({ evaluatorId: score.actorId, score: score.score, answers: score.answers })) } });
    await changePortalEvent(tx, result.id, { status: "PROCESSADO" });
    await tx.update(employeePortalRequests).set({ status: "RESULTADO_PUBLICADO", decision: input.conclusion, decidedBy: context.user.id, decidedAt: new Date() }).where(eq(employeePortalRequests.id, request.id));
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "EMPLOYEE_EVALUATION_RESULT", targetId: result.id });
    return result.id;
  });
}

export async function listOwnPublishedEvaluationResults(context: AppContext) {
  const employeeId = context.user.employeeId;
  const executor = context.database ?? db;
  if (!employeeId || !await activePortalEmployee(executor, employeeId)) throw new AccessError("Acesso funcional indisponível.", 403);
  const rows = await portalEvents(executor, sql`domain='PORTAL' AND "eventType"='RESULTADO_AVALIACAO_PUBLICADO' AND status='PROCESSADO' AND payload->>'employeeId'=${employeeId}`);
  return rows.flatMap(row => { const payload = publishedEvaluationSchema.safeParse(row.payload); return payload.success && payload.data.employeeId === employeeId && new Date(payload.data.releaseAt) <= new Date() ? [{ id: row.id, ...payload.data }] : []; });
}

export function evaluationResultRows(result: z.infer<typeof publishedEvaluationSchema>) {
  const rows: string[][] = [["Servidor", result.employeeName], ["Ciclo", result.cycleName], ["Tipo", result.policy.kind], ["Fundamento", result.policy.legalReference], ["Conclusão RH", result.conclusion], ["Evidência", result.evidenceReference], ["Disponibilização", result.releaseAt]];
  result.scores.forEach((score, index) => {
    rows.push([`Avaliador ${index + 1} — nota ponderada`, new Decimal(score.score).toFixed(4)]);
    result.policy.questions.forEach(question => rows.push([`Avaliador ${index + 1} — ${question.label} (peso ${question.weight})`, String(score.answers[question.code])]));
  });
  return rows;
}
