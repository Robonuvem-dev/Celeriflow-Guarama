import { and, eq, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { z } from "zod";
import { db, databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { hrFunctionalRecords } from "@/db/schema/personnel-functional-management";
import { activePortalEmployee, requiredPortalRequest, portalEvent, changePortalEvent } from "@/db/repositories/portal-servidor/records";
import { enqueueHrIntegration, lockPersonnel, stablePersonnelJson } from "@/db/repositories/personnel/integration";
import type { AppContext } from "@/lib/platform/tenant-context";
import { coursePolicySchema } from "./career-service";

async function assessmentContext(database: DatabaseExecutor, context: AppContext, requestId: string) {
  const employee = await activePortalEmployee(database, context.user.employeeId ?? "__SEM_VINCULO__");
  if (!employee) throw new Error("Acesso funcional indisponível.");
  const enrollment = await requiredPortalRequest(database, requestId);
  if (enrollment.employeeId !== employee.id || enrollment.kind !== "CAPACITACAO_INSCRICAO" || enrollment.status !== "CONCLUIDA") throw new Error("A avaliação exige participação própria concluída no curso.");
  const payload = z.object({ courseId: z.string(), courseName: z.string(), policy: coursePolicySchema }).parse(enrollment.payload);
  if (new Date() < new Date(payload.policy.endsAt)) throw new Error("A avaliação do programa é disponibilizada após o encerramento do curso.");
  const previous = await portalEvent(database, sql`"sourceKey"=${`PORTAL:AVALIACAO_TREINAMENTO:${enrollment.id}`}`);
  const now = new Date();
  const instrument = await database.select().from(hrFunctionalRecords).where(and(eq(hrFunctionalRecords.kind, "TREINAMENTO_INSTRUMENTO"), sql`${hrFunctionalRecords.data}->>'courseId'=${payload.courseId}`, sql`${hrFunctionalRecords.status}<>'CANCELADO'`, sql`${hrFunctionalRecords.startsAt}<=${now}`, sql`(${hrFunctionalRecords.endsAt} IS NULL OR ${hrFunctionalRecords.endsAt}>=${now})`)).orderBy(hrFunctionalRecords.key);
  return { employee, enrollment, payload, previous, instrument };
}

export async function readOwnTrainingEvaluation(context: AppContext, requestId: string) {
  const result = await assessmentContext(context.database ?? db, context, requestId);
  return { courseName: result.payload.courseName, submitted: Boolean(result.previous), questions: result.instrument.map(row => ({ code: row.data.code, label: row.data.question, min: Number(row.data.minimumScore), max: Number(row.data.maximumScore), weight: Number(row.data.weight) })) };
}

export async function submitOwnTrainingEvaluation(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ requestId: z.string().min(1), answers: z.record(z.string(), z.number().finite()), comment: z.string().trim().max(4000) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await lockPersonnel(tx, "functional-configuration");
    await lockPersonnel(tx, `training-evaluation:${input.requestId}`);
    const { employee, enrollment, payload, previous, instrument } = await assessmentContext(tx, context, input.requestId);
    if (previous) {
      const old = z.object({ answers: z.record(z.string(), z.number()), comment: z.string() }).parse(previous.payload);
      if (stablePersonnelJson(old) !== stablePersonnelJson({ answers: input.answers, comment: input.comment })) throw new Error("Avaliação já enviada com outras respostas; o registro original foi preservado.");
      return { id: previous.id };
    }
    if (!instrument.length || new Set(instrument.map(row => row.data.code)).size !== instrument.length || Object.keys(input.answers).length !== instrument.length) throw new Error("Responda todos e somente os critérios do instrumento vigente.");
    let weighted = new Decimal(0), weights = new Decimal(0);
    const questions = instrument.map(row => {
      const answer = input.answers[row.data.code], min = Number(row.data.minimumScore), max = Number(row.data.maximumScore), weight = Number(row.data.weight);
      if (answer === undefined || answer < min || answer > max) throw new Error(`Resposta fora da escala: ${row.data.question}.`);
      const normalized = new Decimal(answer).sub(min).div(max - min).mul(100);
      weighted = weighted.add(normalized.mul(weight)); weights = weights.add(weight);
      return { recordId: row.id, version: row.version, code: row.data.code, label: row.data.question, min, max, weight, answer, normalized: normalized.toFixed(4), legalReference: row.data.legalReference };
    });
    const event = await enqueueHrIntegration(tx, { sourceKey: `PORTAL:AVALIACAO_TREINAMENTO:${enrollment.id}`, domain: "PORTAL", environment: "INTERNO", eventType: "PROGRAMA_TREINAMENTO_AVALIADO", payload: { ...input, employeeId: employee.id, courseId: payload.courseId, courseName: payload.courseName, budgetUnitId: payload.policy.budgetUnitId, submittedAt: new Date().toISOString(), actorId: context.user.id, questions, score: weighted.div(weights).toFixed(4) } });
    await changePortalEvent(tx, event.id, { status: "PROCESSADO" });
    return { id: event.id };
  });
}
