import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { publishedEvaluationSchema } from "@/lib/portal-servidor/evaluation-results";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { reportEmployeePredicate } from "./report-filters";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";

export async function buildEvaluationHistoryReport(db: DatabaseExecutor, input: OperationalReportInput, budgetUnitIds?: readonly string[]): Promise<PersonnelReport> {
  const from = input.from ?? "1900-01-01", until = input.until ?? input.referenceDate ?? new Date().toISOString().slice(0, 10);
  if (from > until) throw new Error("Período inválido.");
  const result = await db.execute<{ id: string; payload: unknown; registration: string | null }>(sql`
    SELECT a.id,a.payload,historical_position.snapshot->>'registration' registration FROM "HrIntegrationEvent" a JOIN "Employee" e ON e.id=a.payload->>'employeeId'
    LEFT JOIN LATERAL (SELECT revision.snapshot FROM "HrEmploymentContract" contract JOIN "HrEmploymentRevision" revision ON revision."contractId"=contract.id WHERE contract."employeeId"=e.id AND revision."effectiveFrom"::date<=(a.payload->>'publishedAt')::timestamp::date ORDER BY revision."effectiveFrom" DESC,revision.version DESC,contract.id LIMIT 1) historical_position ON true
    WHERE a."eventType"='RESULTADO_AVALIACAO_PUBLICADO' AND a.status='PROCESSADO'
      AND (a.payload->>'publishedAt')::timestamp::date BETWEEN ${from}::date AND ${until}::date
      AND ${reportEmployeePredicate(input, sql`e.id`, sql`(a.payload->>'publishedAt')::timestamp::date`)}
      AND (${input.q}='' OR strpos(lower(e.name),lower(${input.q}))>0)
      ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``}
      AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)}
      ${budgetUnitIds === undefined ? sql`` : sql`AND a.payload->'policy'->>'budgetUnitId'=ANY(${sql.param(budgetUnitIds)}::text[])`}
    ORDER BY e.name,a.payload->>'publishedAt',a.id`);
  return { title: "Histórico de avaliações funcionais — instrumentos e resultados publicados", headers: ["Servidor", "Matrícula", "Ciclo", "Tipo", "Data de publicação", "Disponibilização", "Avaliador", "Critério", "Peso", "Resposta", "Nota ponderada do avaliador", "Conclusão RH", "Evidência", "Fundamento", "Resultado ID"], rows: result.rows.flatMap(row => {
    const assessment = publishedEvaluationSchema.parse(row.payload);
    return assessment.scores.flatMap(score => assessment.policy.questions.map(question => [assessment.employeeName, row.registration ?? "", assessment.cycleName, assessment.policy.kind, assessment.publishedAt, assessment.releaseAt, score.evaluatorId, question.label, String(question.weight), String(score.answers[question.code] ?? ""), score.score, assessment.conclusion, assessment.evidenceReference, assessment.policy.legalReference, row.id]));
  }) };
}
