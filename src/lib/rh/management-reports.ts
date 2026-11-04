import { sql, type SQL } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { buildAccountingEvolutionReport } from "./accounting-evolution-report";
import type { DatabaseExecutor } from "@/db/transaction";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { positionPlanSchema } from "./position-plan";
import { reportContractPredicate, reportPayrollAllocationSource, reportPayrollPredicate, reportEmployeePredicate, reportRubricPredicate, reportFunctionalRulePredicate } from "./report-filters";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";
import { referenceRecordsObservedAt } from "./reference-timeline-query";
import { buildConsignmentEntityReport } from "./consignment-entity-report";
import { payrollConfigurationObservedAt } from "./configuration-timeline-query";
import { functionalRecordsObservedAt } from "./functional-timeline-query";

export const managementReportCatalog = [
  [113, "Auditoria de RH", "AUDITORIA_RH"], [114, "Parâmetros de FGTS", "PARAMETROS_FGTS"],
  [115, "Parâmetros de 13º", "PARAMETROS_DECIMO"], [116, "Parâmetros de contabilização", "PARAMETROS_CONTABILIZACAO"],
  [117, "Parâmetros de contagem de tempo", "PARAMETROS_CONTAGEM"], [118, "Plano de cargos e referências", "PLANO_CARGOS_RESUMO"],
  [119, "Provisões analíticas", "PROVISOES_ANALITICAS"], [120, "Evolução entre referências", "EVOLUCAO_REFERENCIAS"],
  [121, "Saldos negativos da folha", "SALDOS_NEGATIVOS"], [122, "Consignações por entidade e verbas", "CONSIGNACOES_ENTIDADE_VERBAS"],
  [123, "Avaliações de treinamento — resumo", "TREINAMENTO_RESULTADO_AGREGADO"],
] as const;
export const managementReportKinds = managementReportCatalog.map(row => row[2]);
const cell = (value: unknown): string => value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
export async function buildManagementReport(db: DatabaseExecutor, input: OperationalReportInput, payrollScope?: SQL, budgetUnitIds?: readonly string[]): Promise<PersonnelReport> {
  const reference = input.referenceDate ?? new Date().toISOString().slice(0, 10);
  const from = input.from ?? `${input.year ?? reference.slice(0, 4)}-01-01`, until = input.until ?? reference;
  if (from > until) throw new Error("Período inválido.");
  const title = managementReportCatalog.find(row => row[2] === input.kind)?.[1] ?? input.kind;
  if (input.kind === "EVOLUCAO_REFERENCIAS") return buildAccountingEvolutionReport(db, input, payrollScope, budgetUnitIds);
  if (input.kind === "CONSIGNACOES_ENTIDADE_VERBAS") return buildConsignmentEntityReport(db, input, payrollScope, budgetUnitIds);
  async function query(headers: Array<[string, string]>, statement: SQL): Promise<PersonnelReport> { const result = await db.execute<Record<string, unknown>>(statement); return { title, headers: headers.map(([, label]) => label), rows: result.rows.map(row => headers.map(([key]) => cell(row[key]))) }; }
  if (input.kind === "AUDITORIA_RH") {
    if (budgetUnitIds !== undefined) throw new Error("A auditoria integral exige acesso administrativo.");
    return query([["date", "Registro"], ["name", "Usuário"], ["actor", "Usuário ID"], ["action", "Ação"], ["entity", "Entidade"], ["target", "Objeto"], ["origin", "Origem"], ["id", "Evento ID"]], sql`
      WITH audit AS (
        SELECT a."createdAt" date,a."actorUsuarioId" actor,a."eventType" action,a."targetType" entity,a."targetId" target,'AuditEvent' origin,a.id
          FROM "AuditEvent" a WHERE upper(a."targetType") ~ '(EMPLOYEE|PAYROLL|PERSONNEL|HR_|RH_)'
        UNION ALL SELECT a."createdAt",coalesce(a.payload->>'actorId',a.payload->'input'->>'actorId',a.payload->>'userId',''),a."eventType",a.domain,
          coalesce(a.payload->>'contractId',a.payload->'input'->>'contractId',a.payload->>'employeeId',a.payload->>'runId',a."sourceKey"),'HrIntegrationEvent',a.id FROM "HrIntegrationEvent" a
        UNION ALL SELECT "createdAt","actorId",'REVISAO_CONTRATUAL','HrEmploymentContract',"contractId",'HrEmploymentRevision',id FROM "HrEmploymentRevision"
        UNION ALL SELECT "createdAt","actorId",'REVISAO_CADASTRAL','Employee',"employeeId",'HrPersonalRevision',id FROM "HrPersonalRevision"
        UNION ALL SELECT "createdAt","actorId",operation,kind,"referenceId",'HrReferenceRevision',id FROM "HrReferenceRevision"
        UNION ALL SELECT "createdAt","actorUsuarioId",operation,"entityType","entityId",'HrPayrollConfigurationChange',id FROM "HrPayrollConfigurationChange"
        UNION ALL SELECT "createdAt","actorId",'CERTIDAO_EMITIDA','HrTimeCertificate',number,'HrTimeCertificate',id FROM "HrTimeCertificate"
      ) SELECT a.date::text,coalesce(u.nome,nullif(a.actor,''),'Autoria não informada na origem') name,a.actor,a.action,a.entity,a.target,a.origin,a.id
      FROM audit a LEFT JOIN "Usuario" u ON u.id=a.actor
      WHERE a.date::date BETWEEN ${from}::date AND ${until}::date
        AND (${input.q}='' OR strpos(lower(concat_ws(' ',u.nome,a.actor,a.action,a.entity,a.target,a.origin)),lower(${input.q}))>0)
        ${input.auditActor ? sql`AND (a.actor=${input.auditActor} OR strpos(lower(coalesce(u.nome,'')),lower(${input.auditActor}))>0)` : sql``}
        ${input.auditAction ? sql`AND strpos(lower(a.action),lower(${input.auditAction}))>0` : sql``}
        ${input.auditEntity ? sql`AND strpos(lower(a.entity),lower(${input.auditEntity}))>0` : sql``}
        ${input.auditTarget ? sql`AND strpos(lower(a.target),lower(${input.auditTarget}))>0` : sql``}
      ORDER BY a.date,a.origin,a.id`);
  }
  if (input.kind === "PARAMETROS_DECIMO") return query([["package", "Pacote"], ["scope", "Escopo"], ["from", "Vigência inicial"], ["until", "Vigência final"], ["id", "Identificação"], ["version", "Atualização / versão"], ["code", "Parâmetro / rubrica"], ["name", "Descrição"], ["value", "Configuração efetiva"], ["legal", "Fundamento"]], sql`
    WITH packages AS (SELECT * FROM ${payrollConfigurationObservedAt("HR_PAYROLL_RULE_SET", sql`${reference}`)} observed_packages WHERE "effectiveFrom"::date<=${reference}::date AND ("effectiveUntil" IS NULL OR "effectiveUntil"::date>=${reference}::date)),
    parameters AS (
      SELECT p.code package,p.scope,p."effectiveFrom"::date "from",p."effectiveUntil"::date until,r.id,r."updatedAt"::text version,r.code,r.name,r.value,coalesce(r."legalReference",p."legalReference") legal
      FROM packages p JOIN ${payrollConfigurationObservedAt("HR_PAYROLL_RULE", sql`${reference}`)} r ON r."ruleSetId"=p.id WHERE r."isActive" AND (r.code LIKE '%13%' OR r.code IN ('FOLHAS_ESPECIAIS_POC','IRRF_FAIXAS','IRRF_DEDUCAO_DEPENDENTE','IRRF_DEDUCAO_SIMPLIFICADA','DEPENDENTES_IRRF','COMPENSACAO_TRIBUTARIA_FOLHA') OR r.value->>'origin'='MEDIA_REMUNERACOES')
      UNION ALL SELECT p.code,p.scope,p."effectiveFrom"::date,p."effectiveUntil"::date,b.id,b."updatedAt"::text,b.code,b.name,
        jsonb_build_object('tipo',b.type,'metodo',b."calculationMethod",'formula',b."formulaExpression",'base',b."calculationBaseCode",'valor',b."fixedValue",'percentual',b."percentageRate",'incidencias',b.state->'incidences'),coalesce(b."legalReference",p."legalReference")
      FROM packages p JOIN ${payrollConfigurationObservedAt("HR_PAYROLL_RUBRIC", sql`${reference}`)} b ON b."ruleSetId"=p.id WHERE b."isActive" AND b.code IN ('POC_ADIANTAMENTO_13','POC_DECIMO_13','POC_ABATIMENTO') AND ${reportRubricPredicate(input, sql`b.code`)}
      UNION ALL SELECT p.code,p.scope,p."effectiveFrom"::date,p."effectiveUntil"::date,p.id,'implementação atual; sem atestar versão histórica do motor','CRITERIOS_MOTOR_13','Avos, parcelas e conciliação — referência técnica atual',
        jsonb_build_object('dias_minimos_no_mes',15,'avos_ano',12,'base','salário da referência + média apurada','primeira_parcela','base × avos / 12 / 2','quitacao','base × avos / 12 menos adiantamento','diferenca','total recalculado menos bruto da execução de origem','origem','execução oficial fechada do mesmo ano, escopo, conjunto e seleção','rescisao','avos com exclusões por finalidade; parcelas anteriores conciliadas nas folhas fechadas','arredondamento','HALF_UP / 2 casas'),p."legalReference" FROM packages p
    ) SELECT * FROM parameters ORDER BY package,code,id`);
  if (input.kind === "PARAMETROS_FGTS") return query([["package", "Pacote"], ["from", "Vigência inicial"], ["until", "Vigência final"], ["code", "Parâmetro"], ["name", "Descrição"], ["value", "Regra efetiva"], ["legal", "Fundamento"], ["incidences", "Rubricas e incidências"]], sql`SELECT p.code package,p."effectiveFrom"::date "from",p."effectiveUntil"::date until,r.code,r.name,r.value,coalesce(r."legalReference",p."legalReference") legal,
    (SELECT jsonb_agg(jsonb_build_object('rubrica',b.code,'nome',b.name,'incidencias',b.state->'incidences') ORDER BY b.code) FROM ${payrollConfigurationObservedAt("HR_PAYROLL_RUBRIC", sql`${reference}`)} b WHERE b."ruleSetId"=p.id AND b."isActive" AND ${reportRubricPredicate(input, sql`b.code`)}) incidences
    FROM ${payrollConfigurationObservedAt("HR_PAYROLL_RULE", sql`${reference}`)} r JOIN ${payrollConfigurationObservedAt("HR_PAYROLL_RULE_SET", sql`${reference}`)} p ON p.id=r."ruleSetId" WHERE r."isActive" AND p."effectiveFrom"::date<=${reference}::date AND (p."effectiveUntil" IS NULL OR p."effectiveUntil"::date>=${reference}::date) AND r.code LIKE 'FGTS%' ORDER BY p.code,r.code`);
  if (input.kind === "PARAMETROS_CONTABILIZACAO") return query([["name", "Rateio observado na referência"], ["contract", "Contrato"], ["component", "Componente"], ["appropriation", "Dotação"], ["source", "Fonte"], ["nature", "Natureza"], ["percentage", "Percentual"], ["from", "Início declarado"], ["until", "Fim declarado"], ["legal", "Fundamento"]], sql`SELECT r.name,r.details->>'contractId' contract,r.details->>'component' component,a.code appropriation,s.code source,n.code nature,r.details->>'percentage' percentage,r.details->>'from' "from",r.details->>'until' until,r.details->>'source' legal FROM ${referenceRecordsObservedAt(sql`${reference}`)} r JOIN "BudgetAppropriation" a ON a.id=r.details->>'appropriationId' JOIN "ResourceSource" s ON s.id=a."resourceSourceId" JOIN "ExpenseNature" n ON n.id=a."expenseNatureId"
    JOIN "HrEmploymentContract" c ON c.id=r.details->>'contractId' JOIN "Employee" e ON e.id=c."employeeId"
    JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=c.id AND "effectiveFrom"::date<=${reference}::date ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) v ON true
    WHERE r.kind='RATEIO_FOLHA' AND r.details->>'from'<=${reference} AND r.details->>'until'>=${reference}
      AND ${reportContractPredicate(input, sql`v.snapshot`, sql`${reference}`)} AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)}
      ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``} ${input.departmentId ? sql`AND v.snapshot->>'departmentId'=${input.departmentId}` : sql``}
      AND (${input.q}='' OR strpos(lower(concat_ws(' ',e.name,v.snapshot->>'registration',r.name,a.code)),lower(${input.q}))>0)
      ${budgetUnitIds === undefined ? sql`` : sql`AND a."budgetUnitId"=ANY(${sql.param(budgetUnitIds)}::text[])`} ORDER BY a.code,r.id`);
  if (input.kind === "PARAMETROS_CONTAGEM") return query([["name", "Regra / ocorrência"], ["kind", "Modalidade"], ["startsAt", "Início"], ["endsAt", "Fim"], ["data", "Finalidades, efeitos e fundamento"], ["version", "Versão"]], sql`SELECT f.name,f.kind,f."startsAt"::date,f."endsAt"::date,f.data,f.version FROM ${functionalRecordsObservedAt(sql`${reference}`)} f LEFT JOIN "Employee" e ON e.id=f."employeeId" WHERE f.kind IN ('CESSAO','AFASTAMENTO','REGRA_ATS','REGRA_PROGRESSAO','FERIAS_ESPECIAIS','REGRA_APOSENTADORIA') AND f.status<>'CANCELADO' AND f."startsAt"::date<=${reference}::date AND (f."endsAt" IS NULL OR f."endsAt"::date>=${reference}::date) AND (f."employeeId" IS NULL OR (${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)} AND ${reportEmployeePredicate(input, sql`e.id`, sql`${reference}`)}))
    ${input.employeeId ? sql`AND (f."employeeId"=${input.employeeId} OR f."employeeId" IS NULL)` : sql``}
    AND (f."employeeId" IS NOT NULL OR ${reportFunctionalRulePredicate(input, sql`f.data`, sql`${reference}`, budgetUnitIds)})
    AND (coalesce(f.data->>'rubricCode','')='' OR (${reportRubricPredicate(input, sql`f.data->>'rubricCode'`)}))
    AND (${input.q}='' OR strpos(lower(concat_ws(' ',f.name,f.kind,e.name)),lower(${input.q}))>0)
    UNION ALL SELECT rule.name,'POLITICA_'||rule.code,package."effectiveFrom"::date,package."effectiveUntil"::date,rule.value,1
      FROM ${payrollConfigurationObservedAt("HR_PAYROLL_RULE", sql`${reference}`)} rule JOIN ${payrollConfigurationObservedAt("HR_PAYROLL_RULE_SET", sql`${reference}`)} package ON package.id=rule."ruleSetId"
      WHERE rule."isActive" AND rule.code IN ('LICENCA_PREMIO','ATS','FALTAS_FERIAS_POC')
        AND package."effectiveFrom"::date<=${reference}::date AND (package."effectiveUntil" IS NULL OR package."effectiveUntil"::date>=${reference}::date)
        AND (coalesce(rule.value->>'rubricCode','')='' OR ${reportRubricPredicate(input, sql`rule.value->>'rubricCode'`)})
        AND (${input.q}='' OR strpos(lower(concat_ws(' ',rule.name,rule.code,package.name)),lower(${input.q}))>0)
    UNION ALL SELECT policy.name,'POLITICA_FERIAS',package."effectiveFrom"::date,package."effectiveUntil"::date,policy.state,1
      FROM ${payrollConfigurationObservedAt("HR_VACATION_POLICY", sql`${reference}`)} policy JOIN ${payrollConfigurationObservedAt("HR_PAYROLL_RULE_SET", sql`${reference}`)} package ON package.id=policy."ruleSetId"
      WHERE policy."isActive" AND package."effectiveFrom"::date<=${reference}::date AND (package."effectiveUntil" IS NULL OR package."effectiveUntil"::date>=${reference}::date)
        AND (${input.q}='' OR strpos(lower(concat_ws(' ',policy.name,policy.code,package.name)),lower(${input.q}))>0)
    ORDER BY kind,name`);
  if (input.kind === "PLANO_CARGOS_RESUMO") {
    const result = await db.execute<{ code: string; value: unknown }>(sql`SELECT p.code,r.value FROM ${payrollConfigurationObservedAt("HR_PAYROLL_RULE", sql`${reference}`)} r JOIN ${payrollConfigurationObservedAt("HR_PAYROLL_RULE_SET", sql`${reference}`)} p ON p.id=r."ruleSetId" WHERE r."isActive" AND r.value->>'origin'='QUADRO_CARGOS' ORDER BY p.code,r.id`);
    return { title, headers: ["Pacote", "Início", "Fim", "Cargo ID", "Classificação", "CBO", "Vagas", "Nível", "Posição vertical", "Posição horizontal", "Salário BRL", "Jornada mensal", "Fundamento"], rows: result.rows.flatMap(row => positionPlanSchema.parse(row.value).periods.filter(period => period.startsAt <= reference && (!period.endsAt || period.endsAt >= reference)).flatMap(period => period.roles.flatMap(role => role.levels.map(level => [row.code, period.startsAt, period.endsAt ?? "", role.roleId, role.classification, role.cbo, String(role.authorizedSeats), level.code, String(level.vertical), String(level.horizontal), level.salary, String(level.monthlyHours), role.legalReference])))) };
  }
  if (input.kind === "TREINAMENTO_RESULTADO_AGREGADO") return query([["course", "Curso / turma"], ["criterion", "Critério"], ["version", "Versão do instrumento"], ["responses", "Respostas"], ["holders", "Servidores distintos"], ["average", "Média normalizada %"], ["minimum", "Menor nota %"], ["maximum", "Maior nota %"]], sql`SELECT f.payload->>'courseName' course,q->>'label' criterion,(q->>'recordId')||'/'||(q->>'version') version,count(*) responses,count(DISTINCT f.payload->>'employeeId') holders,round(avg((q->>'normalized')::numeric),4) average,min((q->>'normalized')::numeric) minimum,max((q->>'normalized')::numeric) maximum FROM "HrIntegrationEvent" f JOIN "Employee" e ON e.id=f.payload->>'employeeId' CROSS JOIN LATERAL jsonb_array_elements(f.payload->'questions') q WHERE f."eventType"='PROGRAMA_TREINAMENTO_AVALIADO' AND f.status='PROCESSADO' AND (f.payload->>'submittedAt')::timestamp::date BETWEEN ${from}::date AND ${until}::date
    AND ${reportEmployeePredicate(input, sql`e.id`, sql`(f.payload->>'submittedAt')::timestamp::date`)} AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)}
    AND (${input.q}='' OR strpos(lower(concat_ws(' ',f.payload->>'courseName',q->>'label',e.name)),lower(${input.q}))>0)
    ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``} ${budgetUnitIds === undefined ? sql`` : sql`AND f.payload->>'budgetUnitId'=ANY(${sql.param(budgetUnitIds)}::text[])`} GROUP BY f.payload->>'courseId',f.payload->>'courseName',q->>'label',q->>'recordId',q->>'version' ORDER BY course,criterion,version`);
  if (input.kind === "PROVISOES_ANALITICAS") return query([["name", "Servidor"], ["registration", "Matrícula"], ["kind", "Provisão"], ["scope", "Escopo"], ["opening", "Saldo inicial BRL"], ["accrual", "Apropriação BRL"], ["consumed", "Baixa BRL"], ["reversal", "Estorno BRL"], ["closing", "Saldo final BRL"]], sql`SELECT e.name,c.registration,r.kind,r.details->>'scope' scope,
    coalesce(sum(r.amount) FILTER (WHERE r.effective::date<${from}::date),0) opening,
    coalesce(sum(r.amount) FILTER (WHERE r.effective::date BETWEEN ${from}::date AND ${until}::date AND r.details->>'operation'='APROPRIACAO'),0) accrual,
    coalesce(-sum(r.amount) FILTER (WHERE r.effective::date BETWEEN ${from}::date AND ${until}::date AND r.details->>'operation' NOT LIKE 'ESTORNO%' AND r.details->>'operation'<>'APROPRIACAO'),0) consumed,
    coalesce(sum(r.amount) FILTER (WHERE r.effective::date BETWEEN ${from}::date AND ${until}::date AND r.details->>'operation' LIKE 'ESTORNO%'),0) reversal,
    sum(r.amount) closing FROM (SELECT *,coalesce((details->>'effectiveAt')::timestamp,"createdAt") effective FROM "HrRightEntry") r JOIN "HrEmploymentContract" c ON c.id=r."contractId" JOIN "Employee" e ON e.id=c."employeeId" WHERE r.kind IN ('PROVISAO_FERIAS','PROVISAO_13','PROVISAO_LICENCA') AND r.effective::date<=${until}::date ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``} AND ${reportEmployeePredicate(input, sql`e.id`, sql`${until}`)} AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)} GROUP BY e.id,e.name,c.id,c.registration,r.kind,r.details->>'scope' ORDER BY e.name,c.registration,r.kind,scope`);
  if (input.kind === "SALDOS_NEGATIVOS") {
    const result = await db.execute<{ competence: string; type: string; snapshot: { contract: { registration: string; employeeId: string; departmentId: string | null; employee: { name: string } }; items: Array<{ code: string; name: string; type: string; value: string }> }; net: string }>(sql`SELECT "Payroll".competence,"Payroll".type,s.snapshot,s.net::text FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" ON "Payroll".id=r."payrollId" WHERE r.status IN ('CALCULADA','FECHADA') AND ${payrollScope ?? sql`true`}
      AND ${reportContractPredicate(input, sql`s.snapshot->'contract'`, sql`to_date("Payroll".competence,'MM/YYYY')`, reportPayrollAllocationSource(sql`r.id`, sql`r.snapshot`))} AND ${reportPayrollPredicate(input, sql`"Payroll".competence`, sql`"Payroll".type`)}
      AND to_date("Payroll".competence,'MM/YYYY') BETWEEN date_trunc('month',${from}::date) AND ${until}::date
      ${input.payrollId ? sql`AND "Payroll".id=${input.payrollId}` : sql``} ORDER BY to_date("Payroll".competence,'MM/YYYY'),s.id`);
    const selected = result.rows.filter(row => (!input.employeeId || row.snapshot.contract.employeeId === input.employeeId) && (!input.departmentId || row.snapshot.contract.departmentId === input.departmentId));
    return { title, headers: ["Servidor", "Matrícula", "Competência", "Tipo", "Líquido BRL", "Rubricas de origem"], rows: selected.filter(row => new Decimal(row.net).lt(0)).map(row => [row.snapshot.contract.employee.name, row.snapshot.contract.registration, row.competence, row.type, row.net, row.snapshot.items.map(item => `${item.code}: ${item.value}`).join("; ")]) };
  }
  throw new Error("Modalidade gerencial desconhecida.");
}
