import { sql } from "drizzle-orm";
import { z } from "zod";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { assertBudgetUnitAccess, type AppContext } from "@/lib/platform/tenant-context";

const resultSchema = z.object({ cycleId: z.string(), cycleName: z.string(), releaseAt: z.iso.datetime(), publishedAt: z.iso.datetime(), policy: z.object({ budgetUnitId: z.string(), kind: z.enum(["DESEMPENHO", "ESTAGIO_PROBATORIO"]), questions: z.array(z.object({ code: z.string(), min: z.number(), max: z.number(), weight: z.number().positive() })).min(1) }), scores: z.array(z.object({ score: z.string(), answers: z.record(z.string(), z.number()) })).min(1) });

/** Compare cycles on an explicit scale; commission size does not give a cycle extra weight. */
export async function assessProgressionEvaluation(db: DatabaseExecutor, context: AppContext, employeeId: string, beginning: Date, through: Date, policy: Record<string, string>) {
  const kind = policy.evaluationKind || "TODAS", method = policy.evaluationMethod || "NOTA_ORIGINAL";
  const events = await db.execute<{ id: string; payload: unknown }>(sql`SELECT id,payload FROM "HrIntegrationEvent" WHERE "eventType"='RESULTADO_AVALIACAO_PUBLICADO' AND status='PROCESSADO' AND payload->>'employeeId'=${employeeId}
    AND (payload->>'releaseAt')::timestamp<${through}::date+interval '1 day' AND (payload->>'releaseAt')::timestamp<=now()
    AND (payload->>'publishedAt')::timestamp>=${beginning} AND (payload->>'publishedAt')::timestamp<${through}::date+interval '1 day'
    ${kind === "TODAS" ? sql`` : sql`AND payload->'policy'->>'kind'=${kind}`} ORDER BY "createdAt",id`);
  const scales = new Set<string>();
  const cycles = events.rows.map(event => {
    const result = resultSchema.parse(event.payload), weight = result.policy.questions.reduce((sum, question) => sum.add(question.weight), new Decimal(0));
    assertBudgetUnitAccess(context.user, result.policy.budgetUnitId);
    const minimum = result.policy.questions.reduce((sum, question) => sum.add(new Decimal(question.min).mul(question.weight)), new Decimal(0)).div(weight);
    const maximum = result.policy.questions.reduce((sum, question) => sum.add(new Decimal(question.max).mul(question.weight)), new Decimal(0)).div(weight);
    scales.add(`${minimum.toString()}/${maximum.toString()}`);
    const scores = result.scores.map(evaluator => {
      if (method === "NOTA_ORIGINAL") return new Decimal(evaluator.score);
      return result.policy.questions.reduce((sum, question) => {
        const answer = evaluator.answers[question.code];
        if (question.max <= question.min || answer === undefined || answer < question.min || answer > question.max) throw new Error("Resultado publicado sem escala/resposta normalizável para a progressão.");
        return sum.add(new Decimal(answer).sub(question.min).div(new Decimal(question.max).sub(question.min)).mul(100).mul(question.weight));
      }, new Decimal(0)).div(weight);
    });
    const score = scores.reduce((sum, value) => sum.add(value), new Decimal(0)).div(scores.length);
    const availableOn = new Date(Math.max(new Date(result.releaseAt).getTime(), new Date(result.publishedAt).getTime())).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    return { eventId: event.id, cycleId: result.cycleId, name: result.cycleName, kind: result.policy.kind, scale: { minimum: minimum.toString(), maximum: maximum.toString() }, score: score.toFixed(8), commissionSize: scores.length, availableOn };
  });
  if (method === "NOTA_ORIGINAL" && scales.size > 1) throw new Error("Avaliações com escalas distintas exigem critério percentual normalizado na regra de progressão.");
  const score = cycles.length ? cycles.reduce((sum, cycle) => sum.add(cycle.score), new Decimal(0)).div(cycles.length).toFixed(8) : null;
  return { score, kind, method, availableOn: cycles.map(cycle => cycle.availableOn).sort().at(-1) ?? null, aggregation: "MEDIA_DOS_CICLOS_COM_IGUAL_PESO", cycles };
}
