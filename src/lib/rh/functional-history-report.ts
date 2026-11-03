import { sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { reportContractPredicate } from "./report-filters";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";
import { referenceRecordsObservedAt } from "./reference-timeline-query";

export async function buildFunctionalHistoryReport(db: DatabaseExecutor, input: OperationalReportInput, payrollScope?: SQL, budgetUnitIds?: readonly string[]): Promise<PersonnelReport> {
  const from = input.from ?? "1900-01-01", until = input.until ?? input.referenceDate ?? new Date().toISOString().slice(0, 10);
  if (from > until) throw new Error("Fim do histórico anterior ao início.");
  const courseScope = budgetUnitIds === undefined ? sql`true` : sql`a.payload->'policy'->>'budgetUnitId'=ANY(${sql.param(budgetUnitIds)}::text[])`;
  const result = await db.execute<Record<string, unknown>>(sql`
    WITH events AS (
      SELECT c."employeeId",r."effectiveFrom"::date date,'CONTRATO' origin,r.id,c.id contract_id,
        CASE WHEN r.version=1 THEN 'Admissão contratual' ELSE 'Revisão contratual' END type,r.reason description,
        r.snapshot->>'status' status,NULL::text document,r.snapshot->'details'->>'seedPackage' scope
      FROM "HrEmploymentRevision" r JOIN "HrEmploymentContract" c ON c.id=r."contractId"
      UNION ALL SELECT "employeeId",date::date,'ATO',id,NULL,type,coalesce("actNumber",''),'Registrado',"documentUrl",NULL FROM "PersonnelAct"
      UNION ALL SELECT "employeeId","startsAt"::date,'REGISTRO_FUNCIONAL',id,"contractId",kind,
        name||'; vigência: '||to_char("startsAt",'YYYY-MM-DD')||' a '||coalesce(to_char("endsAt",'YYYY-MM-DD'),'sem término')||'; dados: '||CASE WHEN kind='READAPTACAO' THEN (data-'cid'-'reason'-'complement')::text ELSE data::text END,status,data->>'legalReference',NULL
         FROM "HrFunctionalRecord" WHERE "employeeId" IS NOT NULL
      UNION ALL SELECT "employeeId",("endsAt"+interval '1 day')::date,'RETORNO_COMISSAO',id,"contractId",'Retorno ao vínculo de origem pela vigência',
        name||'; término da sobreposição remuneratória/cargo em '||to_char("endsAt",'YYYY-MM-DD')||'; fundamento: '||coalesce(data->>'legalReference',''),
        'Efeito temporal; não substitui ato de pessoal',data->>'legalReference',NULL FROM "HrFunctionalRecord"
        WHERE kind='COMISSAO' AND status<>'CANCELADO' AND "endsAt" IS NOT NULL
      UNION ALL SELECT coalesce(v."afterValue"->>'employeeId',v."beforeValue"->>'employeeId'),v."createdAt"::date,'REVISAO_FUNCIONAL',v.id,coalesce(v."afterValue"->>'contractId',v."beforeValue"->>'contractId'),
        'Revisão de '||coalesce(v."afterValue"->>'kind',v."beforeValue"->>'kind')||' / '||v.operation,
        'Registro: '||v."createdAt"::text||'; autor: '||v."actorId"||'; antes: '||coalesce((CASE WHEN v."beforeValue"->>'kind'='READAPTACAO' THEN jsonb_set(v."beforeValue",'{data}',(v."beforeValue"->'data')-'cid'-'reason'-'complement') ELSE v."beforeValue" END)::text,'ausente')||'; depois: '||coalesce((CASE WHEN v."afterValue"->>'kind'='READAPTACAO' THEN jsonb_set(v."afterValue",'{data}',(v."afterValue"->'data')-'cid'-'reason'-'complement') ELSE v."afterValue" END)::text,'ausente'),
        'Observação imutável',v."actorId",NULL FROM "HrReferenceRevision" v WHERE v.kind='HR_FUNCTIONAL_RECORD'
      UNION ALL SELECT "employeeId","effectiveFrom"::date,'CADASTRO_PESSOAL',id,NULL,'Revisão cadastral',reason||'; fotografia: '||snapshot::text,'Registrado',"actorId",NULL FROM "HrPersonalRevision"
      UNION ALL SELECT "employeeId","createdAt"::date,'CERTIDAO_TEMPO',id,NULL,'Certidão de tempo',number||'; finalidade: '||purpose||'; responsável: '||responsible||'; SHA-256: '||"snapshotHash",'Emitida',number,NULL FROM "HrTimeCertificate"
      UNION ALL SELECT "employeeId","createdAt"::date,'MEMORIA_APOSENTADORIA',id,"contractId",'Memória de concessão de aposentadoria',number||'; referência: '||to_char("referenceDate",'YYYY-MM-DD')||'; benefício calculado BRL: '||amount||'; responsável: '||responsible||'; SHA-256: '||"snapshotHash",'Emitida',number,NULL FROM "HrRetirementAssessment"
      UNION ALL SELECT coalesce(v."afterValue"->'details'->>'employeeId',v."beforeValue"->'details'->>'employeeId',c."employeeId"),v."createdAt"::date,'REFERENCIA_HISTORICA',v.id,c.id,
        v.kind||' / '||v.operation,'Antes: '||coalesce(v."beforeValue"::text,'ausente')||'; depois: '||coalesce(v."afterValue"::text,'ausente'),'Registrada',v."actorId",NULL
        FROM "HrReferenceRevision" v LEFT JOIN "HrEmploymentContract" c ON c.id=coalesce(v."afterValue"->'details'->>'contractId',v."beforeValue"->'details'->>'contractId')
        WHERE v.kind IN ('RATEIO_FOLHA','LOTACAO_ORCAMENTARIA','GRADUACAO_SERVIDOR','TEMPO_CONTRIBUICAO','PENSAO_VITALICIA','CONTA_CONVENIO')
      UNION ALL SELECT a.payload->>'employeeId',(a.payload->>'submittedAt')::timestamp::date,'AVALIACAO_TREINAMENTO',a.id,NULL,'Avaliação de programa de treinamento',
        (a.payload->>'courseName')||'; nota normalizada: '||(a.payload->>'score')||'; conclusão: '||(a.payload->>'comment'),a.status,a.payload->>'requestId',a.environment
        FROM "HrIntegrationEvent" a WHERE a."eventType"='PROGRAMA_TREINAMENTO_AVALIADO' AND a.status='PROCESSADO'
        ${budgetUnitIds === undefined ? sql`` : sql`AND a.payload->>'budgetUnitId'=ANY(${sql.param(budgetUnitIds)}::text[])`}
      UNION ALL SELECT a.payload->>'employeeId',(a.payload->>'publishedAt')::timestamp::date,'AVALIACAO',a.id,NULL,'Resultado de avaliação',
        (a.payload->>'cycleName')||'; conclusão: '||(a.payload->>'conclusion')||'; notas: '||(a.payload->'scores')::text,a.status,a.payload->>'evidenceReference',a.environment
        FROM "HrIntegrationEvent" a WHERE a."eventType"='RESULTADO_AVALIACAO_PUBLICADO' AND a.status='PROCESSADO'
        ${budgetUnitIds === undefined ? sql`` : sql`AND a.payload->'policy'->>'budgetUnitId'=ANY(${sql.param(budgetUnitIds)}::text[])`}
      UNION ALL SELECT "employeeId","startDate"::date,'AFASTAMENTO',id,NULL,type,
        'Período: '||to_char("startDate",'YYYY-MM-DD')||' a '||to_char("endDate",'YYYY-MM-DD'),status,NULL,NULL FROM "Leave"
      UNION ALL SELECT "employeeId","enjoymentStart"::date,'FERIAS',id,NULL,'Férias',
        'Gozo: '||to_char("enjoymentStart",'YYYY-MM-DD')||' a '||to_char("enjoymentEnd",'YYYY-MM-DD')||'; dias: '||days,status,NULL,NULL FROM "Vacation" WHERE "enjoymentStart" IS NOT NULL
      UNION ALL SELECT c."employeeId",coalesce((r.details->>'effectiveAt')::date,r."createdAt"::date),'DIREITO',r.id,c.id,r.kind,
        'Período: '||to_char(r."periodStart",'YYYY-MM-DD')||' a '||to_char(r."periodEnd",'YYYY-MM-DD')||'; quantidade: '||r.quantity::text||'; valor BRL: '||r.amount::text,
        CASE WHEN r.quantity<0 OR r.amount<0 THEN 'Compensação / estorno' ELSE 'Lançamento de direito' END,NULL,r.details->>'scope'
      FROM "HrRightEntry" r JOIN "HrEmploymentContract" c ON c.id=r."contractId"
      UNION ALL SELECT r.details->>'employeeId',(r.details->>'from')::date,'FORMACAO',r.id,NULL,'Graduação',r.name,r.details->>'status',r.details->>'evidence',NULL
        FROM ${referenceRecordsObservedAt(sql`${until}`)} r WHERE r.kind='GRADUACAO_SERVIDOR'
      UNION ALL SELECT q."employeeId",q."createdAt"::date,'CAPACITACAO',q.id,NULL,'Inscrição em capacitação',q.payload->>'courseName',q.status,q.decision,NULL
        FROM "HrPortalRequest" q WHERE q.kind='CAPACITACAO_INSCRICAO'
          ${budgetUnitIds === undefined ? sql`` : sql`AND q.payload->'policy'->>'budgetUnitId'=ANY(${sql.param(budgetUnitIds)}::text[])`}
      UNION ALL SELECT coalesce(a.payload->>'employeeId',c."employeeId"),a."createdAt"::date,'EVENTO',a.id,c.id,a."eventType",
        CASE WHEN a."eventType"='CADASTRO_LEGADO_ALTERADO' THEN concat_ws(' / ',a.payload->>'entity',a.payload->>'operation',a.payload->>'id') ELSE coalesce(a.payload->>'reason',a.payload->'input'->>'reason',a.payload->>'courseName',a.payload->'input'->>'type',a."sourceKey") END,
        CASE WHEN EXISTS(SELECT 1 FROM "HrIntegrationEvent" cancel WHERE cancel."eventType"='OCORRENCIA_FUNCIONAL_CANCELADA' AND cancel.payload->>'occurrenceId'=a.id) THEN 'CANCELADO' ELSE a.status END,
        coalesce(a.payload->>'evidenceReference',a.payload->>'certificateCode'),a.environment
        FROM "HrIntegrationEvent" a LEFT JOIN "HrEmploymentContract" c ON c.id=coalesce(a.payload->>'contractId',a.payload->'input'->>'contractId')
        WHERE a."eventType" IN ('OCORRENCIA_FUNCIONAL_REGISTRADA','TEMPO_SERVICO_AVERBADO','AVERBACAO_ESTORNADA','CERTIFICADO_CURSO_EMITIDO','READMISSAO_REGISTRADA','PROGRESSAO_AUTOMATICA','FERIAS_INDENIZADAS_RESCISAO','ATS_ADQUIRIDO_AUTOMATICAMENTE','BANCO_HORAS_ESTORNADO','BANCO_HORAS_TRANSFERIDO','RECADASTRAMENTO_DECIDIDO','APOSENTADORIA_CONCEDIDA','CADASTRO_LEGADO_ALTERADO','HISTORICO_CADASTRAL_ABERTO')
          AND (a."eventType"<>'CERTIFICADO_CURSO_EMITIDO' OR ${courseScope})
      UNION ALL SELECT c."employeeId",to_date("Payroll".competence,'MM/YYYY'),'DEMONSTRATIVO',s.id,c.id,'Demonstrativo da folha',
        "Payroll".competence||' / '||"Payroll".type||'; bruto BRL: '||s.gross::text||'; descontos: '||s.deductions::text||'; líquido: '||s.net::text,
        CASE WHEN s."revokedAt" IS NOT NULL THEN 'Revogado' WHEN s."releaseAt"<=now() THEN 'Publicado' ELSE 'Não liberado' END,NULL,r.scope
        FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" ON "Payroll".id=r."payrollId" JOIN "HrEmploymentContract" c ON c.id=s."contractId"
        WHERE r.status='FECHADA' AND r.mode='OFICIAL' AND ${payrollScope ?? sql`true`}
    )
    SELECT e.name,e.registration,to_char(a.date,'YYYY-MM-DD') date,a.origin,a.type,a.description,a.status,a.document,a.scope,a.id,
      coalesce(d.name,'Sem lotação histórica identificada') department
    FROM events a JOIN "Employee" e ON e.id=a."employeeId"
    LEFT JOIN LATERAL (SELECT v.snapshot FROM "HrEmploymentContract" c JOIN "HrEmploymentRevision" v ON v."contractId"=c.id
      WHERE c."employeeId"=e.id AND (a.contract_id IS NULL OR c.id=a.contract_id) AND v."effectiveFrom"::date<=a.date
      ORDER BY v."effectiveFrom" DESC,v.version DESC,c.id LIMIT 1) historical ON true
    LEFT JOIN "Department" d ON d.id=historical.snapshot->>'departmentId'
    WHERE a.date BETWEEN ${from}::date AND ${until}::date
      AND ${reportContractPredicate(input, sql`historical.snapshot`, sql`a.date`)}
      AND (${input.q}='' OR strpos(lower(e.name),lower(${input.q}))>0 OR strpos(coalesce(e.registration,''),${input.q})>0)
      ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``} ${input.departmentId ? sql`AND historical.snapshot->>'departmentId'=${input.departmentId}` : sql``}
      AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)}
    ORDER BY e.name,e.id,a.date,a.origin,a.id`);
  const columns = [["name", "Servidor"], ["registration", "Matrícula"], ["date", "Data de vigência / registro"], ["origin", "Origem"], ["type", "Evento"], ["department", "Lotação de referência na data"], ["description", "Descrição / memória"], ["status", "Situação"], ["document", "Referência documental"], ["scope", "Escopo / pacote"], ["id", "Identificador de origem"]];
  return { title: "Histórico funcional integrado — contratos, atos, afastamentos, direitos, formação e demonstrativos", headers: columns.map(([, label]) => label), rows: result.rows.map(row => columns.map(([key]) => row[key] == null ? "" : String(row[key]))) };
}
