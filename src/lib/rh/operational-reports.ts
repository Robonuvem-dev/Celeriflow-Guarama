import { sql, type SQL } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { payrolls } from "@/db/schema/personnel-workforce";
import { z } from "zod";
import { buildSupplementaryHrReport, supplementaryReportKinds } from "./supplementary-reports";
import { accountingReportKinds, buildAccountingHrReport } from "./accounting-reports";
import { buildSpecialHrReport, specialReportKinds } from "./special-report-layouts";
import { buildRetirementHrReport } from "./retirement-reports";
import { buildFunctionalHistoryReport } from "./functional-history-report";
import { bankPreparationReportKinds, buildBankPreparationReport } from "./bank-preparation-report";
import { buildPersonnelRecordsReport } from "./personnel-record-reports";
import { buildExtendedHrReport, extendedReportKinds } from "./extended-reports";
import { buildPersonalHistoryReport, personalHistoryReportKinds } from "./personal-history-reports";
import { buildEvaluationHistoryReport } from "./evaluation-history-report";
import { buildRetirementAssessmentReport } from "./retirement-assessment";
import { buildAttendanceCalendarReport } from "./attendance-calendar-report";
import { buildManagementReport, managementReportKinds } from "./management-reports";
import { buildIssuedTimeCertificates } from "./time-certificates";
import { buildActuarialDataset } from "./actuarial-report";
import { reportContractPredicate, reportEmployeePredicate, reportPayrollAllocationSource, reportPayrollPredicate, reportRubricPredicate, type AdvancedHrReportFilters } from "./report-filters";
import { buildRightsPlanningReport } from "./rights-planning-report";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";
import { buildIssuedRetirementAssessments } from "./retirement-assessment-issuance";
import { buildUnionContributionReport } from "./union-contribution";
import { payrollConfigurationObservedAt } from "./configuration-timeline-query";
import { referenceRecordsObservedAt } from "./reference-timeline-query";
import { buildAbsenceDaysReport } from "./absence-days-report";

export const operationalReportKinds = [
  "RETORNO_FERIAS", "FIM_COMISSAO", "FIM_CONTRATOS", "ANIVERSARIANTES_RH", "DIAS_AFASTADOS", "CAUSAS_AFASTAMENTO",
  "CLASSIFICACOES_FUNCIONAIS", "MENSAGENS_FOLHA", "VERBAS_INCIDENCIAS", "CARGOS_SALARIOS", "BANCOS_RH", "AGENCIAS_RH", "CBO_RH",
  "HORARIOS_TRABALHO", "PARAMETROS_PREVIDENCIA", "EVOLUCAO_GLOBAL", "EVOLUCAO_SERVIDOR", "EVOLUCAO_UNIDADE", "FICHA_RESUMIDA_VERBA",
  "DEPENDENTES_RH", "FREQUENCIA_COLETIVA", "PONTO_COLETIVO", "OCORRENCIAS_FUNCIONAIS", "MOVIMENTACAO_PESSOAL", "ATS_COLETIVO",
  "VERBAS_FIXAS_VARIAVEIS", "ASSINATURA_ATIVOS", "HISTORICO_FUNCIONAL", "ADMISSOES_CEDENCIAS", "MAPA_OCUPACAO", "DIMENSIONAMENTO",
  ...supplementaryReportKinds,
  ...accountingReportKinds,
  ...specialReportKinds,
  "EXPECTATIVA_APOSENTADORIA", "CONTAGEM_TEMPO_RH",
  ...bankPreparationReportKinds,
  "EVENTOS_VARIAVEIS_PLANILHA",
  ...extendedReportKinds,
  ...personalHistoryReportKinds,
  "HISTORICO_AVALIACOES_FUNCIONAIS",
  "MEMORIA_TEMPO_PREVIDENCIARIO", "APURACAO_APOSENTADORIA",
  "MEMORIAS_CONCESSAO_EMITIDAS",
  "CALENDARIO_PONTO_PERSONALIZADO",
  ...managementReportKinds,
  "CERTIDOES_TEMPO_EMITIDAS",
  "BASE_ATUARIAL_COLUNAR",
  "PLANEJAMENTO_FERIAS_LICENCAS",
  "CONTRIBUICAO_SINDICAL_NT202",
] as const;
export type OperationalReportKind = typeof operationalReportKinds[number];
export type OperationalReportInput = AdvancedHrReportFilters & {
  kind: string; q: string; competence?: string; payrollId?: string; referenceDate?: string;
  from?: string; until?: string; employeeId?: string; departmentId?: string; year?: number; month?: number;
  totalizers?: string; compareDate?: string; rubricCodes?: string;
  auditActor?: string; auditAction?: string; auditEntity?: string; auditTarget?: string;
  clinicalAuthorized?: boolean;
  labelColumns?: number; labelHeight?: number; labelMargin?: number; labelFields?: string;
};
export type PersonnelReport = { title: string; headers: string[]; rows: string[][]; print?: { kind: "labels" | "matrix132" | "personnel-card" | "pension-receipt"; columns?: number; height?: number; margin?: number } };
const value = (entry: unknown): string => entry === null || entry === undefined ? "" : entry instanceof Date ? entry.toISOString() : typeof entry === "object" ? JSON.stringify(entry) : String(entry);
const snapshotSchema = z.object({ contract: z.object({ employeeId: z.string(), registration: z.string(), departmentId: z.string().nullable(), workLocation: z.string(), employee: z.object({ name: z.string(), unitId: z.string().nullable().optional() }) }), items: z.array(z.object({ code: z.string(), name: z.string(), type: z.string(), value: z.string() })) });

export async function buildOperationalHrReport(db: DatabaseExecutor, input: OperationalReportInput, payrollScope?: SQL, budgetUnitIds?: readonly string[]): Promise<PersonnelReport> {
  if (input.kind === "CONTRIBUICAO_SINDICAL_NT202") return buildUnionContributionReport(db, input, payrollScope, budgetUnitIds);
  if (["DIAS_AFASTADOS", "CAUSAS_AFASTAMENTO"].includes(input.kind)) return buildAbsenceDaysReport(db, input, budgetUnitIds);
  if (input.kind === "MEMORIAS_CONCESSAO_EMITIDAS") return buildIssuedRetirementAssessments(db, input, budgetUnitIds);
  if (input.kind === "PLANEJAMENTO_FERIAS_LICENCAS") return buildRightsPlanningReport(db, input, budgetUnitIds);
  if (input.kind === "BASE_ATUARIAL_COLUNAR") return buildActuarialDataset(db, input, budgetUnitIds, payrollScope);
  if (input.kind === "CERTIDOES_TEMPO_EMITIDAS") return buildIssuedTimeCertificates(db, input, budgetUnitIds);
  if ((managementReportKinds as readonly string[]).includes(input.kind)) return buildManagementReport(db, input, payrollScope, budgetUnitIds);
  if (input.kind === "CALENDARIO_PONTO_PERSONALIZADO") return buildAttendanceCalendarReport(db, input, budgetUnitIds);
  if (["MEMORIA_TEMPO_PREVIDENCIARIO", "APURACAO_APOSENTADORIA"].includes(input.kind)) return buildRetirementAssessmentReport(db, input, budgetUnitIds, payrollScope);
  if (input.kind === "HISTORICO_AVALIACOES_FUNCIONAIS") return buildEvaluationHistoryReport(db, input, budgetUnitIds);
  if ((personalHistoryReportKinds as readonly string[]).includes(input.kind)) return buildPersonalHistoryReport(db, input, budgetUnitIds, payrollScope);
  if ((extendedReportKinds as readonly string[]).includes(input.kind)) return buildExtendedHrReport(db, input, payrollScope, budgetUnitIds);
  if ((supplementaryReportKinds as readonly string[]).includes(input.kind)) return buildSupplementaryHrReport(db, input, budgetUnitIds);
  if ((accountingReportKinds as readonly string[]).includes(input.kind)) return buildAccountingHrReport(db, input, payrollScope, budgetUnitIds);
  if ((specialReportKinds as readonly string[]).includes(input.kind)) return buildSpecialHrReport(db, input, budgetUnitIds);
  if (["EXPECTATIVA_APOSENTADORIA", "CONTAGEM_TEMPO_RH"].includes(input.kind)) return buildRetirementHrReport(db, input, budgetUnitIds);
  if (input.kind === "HISTORICO_FUNCIONAL") return buildFunctionalHistoryReport(db, input, payrollScope, budgetUnitIds);
  if ((bankPreparationReportKinds as readonly string[]).includes(input.kind)) return buildBankPreparationReport(db, input, payrollScope);
  if (["OCORRENCIAS_FUNCIONAIS", "VERBAS_FIXAS_VARIAVEIS", "EVENTOS_VARIAVEIS_PLANILHA"].includes(input.kind)) return buildPersonnelRecordsReport(db, input, payrollScope, budgetUnitIds);
  const reference = input.referenceDate ?? new Date().toISOString().slice(0, 10);
  const from = input.from ?? (input.competence ? `${input.competence.slice(3)}-${input.competence.slice(0, 2)}-01` : `${input.year ?? reference.slice(0, 4)}-01-01`);
  const until = input.until ?? (input.competence ? new Date(Date.UTC(Number(input.competence.slice(3)), Number(input.competence.slice(0, 2)), 0)).toISOString().slice(0, 10) : `${input.year ?? reference.slice(0, 4)}-12-31`);
  if (from > until) throw new Error("Fim do período anterior ao início.");
  const personFilter = sql`(${input.q}='' OR strpos(lower(e.name),lower(${input.q}))>0 OR strpos(coalesce(e.registration,''),${input.q})>0) AND ${reportEmployeePredicate(input, sql`e.id`, sql`${reference}`)} AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)} ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``}`;
  const currentFilter = personFilter;
  // Resolve the canonical revision at a civil date; never substitute today's salary for history.
  const historical = sql`WITH historical AS (
    SELECT c.id,c."employeeId",r.snapshot AS state FROM "HrEmploymentContract" c
    JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=c.id AND "effectiveFrom"<=${reference}::date ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) r ON true
  ), holders AS (
    SELECT h.*,e.name,e.cpf,e.registration AS "employeeRegistration",p."birthDate",ro.name AS role,d.name AS department,
      g.name AS regime,g."employmentNature" AS nature,g."ruleSetId" FROM historical h
    JOIN "Employee" e ON e.id=h."employeeId" LEFT JOIN "Person" p ON p.id=e."personId"
    LEFT JOIN "Role" ro ON ro.id=h.state->>'roleId' LEFT JOIN "Department" d ON d.id=h.state->>'departmentId'
    JOIN "HrEmploymentRegime" g ON g.id=h.state->>'regimeId'
    WHERE ${personFilter} AND ${reportContractPredicate(input, sql`h.state`, sql`${reference}`)} ${input.departmentId ? sql`AND h.state->>'departmentId'=${input.departmentId}` : sql``}
  )`;
  async function query(title: string, columns: Array<[string, string]>, statement: SQL): Promise<PersonnelReport> {
    const result = await db.execute<Record<string, unknown>>(statement);
    return { title, headers: columns.map(([, label]) => label), rows: result.rows.map(row => columns.map(([key]) => value(row[key]))) };
  }
  const identity: Array<[string, string]> = [["name", "Servidor"], ["registration", "Matrícula"], ["department", "Lotação"]];
  const active = sql`state->>'status'='ATIVO' AND (state->>'admittedAt')::timestamp::date<=${reference}::date AND (state->>'endsAt' IS NULL OR (state->>'endsAt')::timestamp::date>=${reference}::date)`;
  if (input.kind === "RETORNO_FERIAS") return query("Previsão de retorno de férias", [...identity, ["start", "Início"], ["end", "Último dia de gozo"], ["return", "Retorno previsto (dia civil)"], ["days", "Dias"], ["status", "Situação"]], sql`
    SELECT e.name,e.registration,d.name department,to_char(v."enjoymentStart",'YYYY-MM-DD') start,to_char(v."enjoymentEnd",'YYYY-MM-DD') "end",to_char(v."enjoymentEnd"+interval '1 day','YYYY-MM-DD') return,v.days,v.status FROM "Vacation" v JOIN "Employee" e ON e.id=v."employeeId" LEFT JOIN "Department" d ON d.id=e."departmentId" WHERE ${currentFilter} AND v."enjoymentEnd"+interval '1 day'>=${from}::date AND v."enjoymentEnd"+interval '1 day'<${until}::date+interval '1 day' AND v.status NOT IN ('Cancelada','Cancelado') ORDER BY v."enjoymentEnd",e.name,v.id`);
  if (input.kind === "FIM_CONTRATOS" || input.kind === "FIM_COMISSAO") return query(input.kind === "FIM_COMISSAO" ? "Previsão de término de vínculos comissionados" : "Previsão de término dos contratos", [...identity, ["role", "Cargo"], ["regime", "Regime"], ["end", "Término"], ["remaining", "Dias desde a referência"], ["status", "Situação"], ["version", "Versão"]], sql`${historical} SELECT name,state->>'registration' registration,department,role,regime,to_char((state->>'endsAt')::timestamp,'YYYY-MM-DD') "end",((state->>'endsAt')::timestamp::date-${reference}::date) remaining,state->>'status' status,state->>'version' version FROM holders WHERE (state->>'endsAt')::timestamp::date BETWEEN ${from}::date AND ${until}::date ${input.kind === "FIM_COMISSAO" ? sql`AND nature='COMISSIONADO'` : sql``} ORDER BY (state->>'endsAt')::timestamp,name,id`);
  if (input.kind === "ANIVERSARIANTES_RH") return query("Aniversariantes — consulta interna de RH", [...identity, ["birthday", "Dia/mês"]], sql`SELECT e.name,e.registration,d.name department,to_char(p."birthDate",'DD/MM') birthday FROM "Employee" e JOIN "Person" p ON p.id=e."personId" LEFT JOIN "Department" d ON d.id=e."departmentId" WHERE ${currentFilter} AND e."isActive" AND extract(month FROM p."birthDate")=${input.month ?? Number(reference.slice(5, 7))} ORDER BY extract(day FROM p."birthDate"),e.name,e.id`);
  if (input.kind === "CLASSIFICACOES_FUNCIONAIS" || input.kind === "CARGOS_SALARIOS" || input.kind === "ASSINATURA_ATIVOS") {
    const columns = [...identity, ["role", "Cargo"], ["regime", "Regime"], ["nature", "Natureza"], ["salary", "Salário-base BRL"], ["weekly", "Jornada semanal estimada"], ["monthly", "Divisor mensal"], ["estimate", "Origem da remuneração"], ...(input.kind === "ASSINATURA_ATIVOS" ? [["signature", "Assinatura"]] : [])] as Array<[string, string]>;
    return query(input.kind === "ASSINATURA_ATIVOS" ? "Folha de assinatura do pessoal ativo" : input.kind === "CARGOS_SALARIOS" ? "Cargos e salários na referência" : "Classificações funcionais na referência", columns, sql`${historical} SELECT name,state->>'registration' registration,department,role,regime,nature,state->>'salary' salary,state->'details'->>'weeklyHours' weekly,state->>'monthlyHours' monthly,CASE WHEN state->'details'->>'salaryEstimated'='true' THEN 'DEMONSTRAÇÃO — estimado' ELSE coalesce(state->'details'->>'salarySource','Cadastro contratual') END estimate,'________________________________' signature FROM holders WHERE ${active} ORDER BY department,role,name,id`);
  }
  if (input.kind === "BANCOS_RH") return query("Bancos — cadastro compartilhado", [["code", "COMPE"], ["ispb", "ISPB"], ["name", "Banco"], ["status", "Situação"]], sql`SELECT compe code,ispb,name,status FROM "Bank" WHERE ${input.q}='' OR strpos(lower(name),lower(${input.q}))>0 OR compe=${input.q} ORDER BY compe,id`);
  if (input.kind === "AGENCIAS_RH") return query("Agências bancárias — cadastro compartilhado", [["bank", "Banco"], ["code", "Agência"], ["name", "Nome"], ["cnpj", "CNPJ"], ["status", "Situação"]], sql`SELECT b.name bank,a.code,a.name,a.cnpj,a.status FROM "BankBranch" a JOIN "Bank" b ON b.id=a."bankId" WHERE ${input.q}='' OR strpos(lower(a.name||' '||b.name||' '||a.code),lower(${input.q}))>0 ORDER BY b.compe,a.code,a.id`);
  if (input.kind === "CBO_RH") return query("Cargos e CBO — quadro vigente e catálogo compartilhado", [["role", "Cargo"], ["package", "Pacote"], ["scope", "Escopo"], ["code", "CBO"], ["description", "Descrição central"], ["classification", "Classificação"], ["from", "Início da vigência"], ["until", "Fim da vigência"], ["status", "Situação do mapeamento"]], sql`
    WITH mappings AS (SELECT p.code package,p.scope,period->>'startsAt' "from",period->>'endsAt' until,item
      FROM ${payrollConfigurationObservedAt("HR_PAYROLL_RULE", sql`${reference}`)} r JOIN ${payrollConfigurationObservedAt("HR_PAYROLL_RULE_SET", sql`${reference}`)} p ON p.id=r."ruleSetId"
      CROSS JOIN LATERAL jsonb_array_elements(r.value->'periods') period CROSS JOIN LATERAL jsonb_array_elements(period->'roles') item
      WHERE r."isActive" AND p.status='ATIVA' AND r.value->>'origin'='QUADRO_CARGOS' AND period->>'startsAt'<=${reference} AND (period->>'endsAt' IS NULL OR period->>'endsAt'>=${reference}))
    SELECT r.name role,m.package,m.scope,m.item->>'cbo' code,c.description,m.item->>'classification' classification,m."from",m.until,
      CASE WHEN m.item IS NULL THEN 'PENDENTE — cargo sem mapeamento no quadro vigente' WHEN c.id IS NULL THEN 'PENDENTE — CBO não localizado no catálogo central' ELSE 'Mapeado no quadro de cargos' END status
    FROM "Role" r LEFT JOIN mappings m ON m.item->>'roleId'=r.id LEFT JOIN "HealthCbo" c ON regexp_replace(c.code,'[^0-9]','','g')=m.item->>'cbo'
    WHERE ${input.q}='' OR strpos(lower(r.name||' '||coalesce(c.description,'')||' '||coalesce(m.item->>'cbo','')),lower(${input.q}))>0 ORDER BY r.name,m.package,r.id`);
  if (input.kind === "VERBAS_INCIDENCIAS") return query("Verbas e incidências por pacote e vigência", [["package", "Pacote"], ["scope", "Escopo"], ["code", "Verba"], ["name", "Descrição"], ["type", "Tipo"], ["method", "Método"], ["formula", "Fórmula"], ["incidences", "Incidências"], ["from", "Vigência inicial"], ["until", "Vigência final"], ["legal", "Fundamento"]], sql`
    SELECT p.code package,p.scope,r.code,r.name,r.type,r."calculationMethod" method,r."formulaExpression" formula,
      string_agg(CASE WHEN (i->>'isIncluded')::boolean THEN i->>'incidenceType' ELSE 'EXCLUÍDA: '||(i->>'incidenceType') END,', ' ORDER BY i->>'incidenceType') incidences,
      to_char(p."effectiveFrom",'YYYY-MM-DD') "from",to_char(p."effectiveUntil",'YYYY-MM-DD') until,r."legalReference" legal
    FROM ${payrollConfigurationObservedAt("HR_PAYROLL_RUBRIC", sql`${reference}`)} r JOIN ${payrollConfigurationObservedAt("HR_PAYROLL_RULE_SET", sql`${reference}`)} p ON p.id=r."ruleSetId" LEFT JOIN LATERAL jsonb_array_elements(r.state->'incidences') i ON true
    WHERE (${input.q}='' OR strpos(lower(r.code||' '||r.name),lower(${input.q}))>0)
      AND ${reportRubricPredicate(input, sql`r.code`)} AND p."effectiveFrom"::date<=${reference}::date AND (p."effectiveUntil" IS NULL OR p."effectiveUntil"::date>=${reference}::date)
    GROUP BY p.id,p.code,p.scope,p."effectiveFrom",p."effectiveUntil",r.id,r.code,r.name,r.type,r."calculationMethod",r."formulaExpression",r."legalReference" ORDER BY p.code,r.code`);
  if (input.kind === "MENSAGENS_FOLHA") return query("Mensagens dos recibos — configuração observada na referência", [["package", "Pacote"], ["scope", "Escopo"], ["id", "Código"], ["text", "Mensagem"], ["start", "Início"], ["end", "Fim"], ["contracts", "Contratos"], ["regimes", "Regimes"], ["types", "Tipos de folha"]], sql`SELECT p.code package,p.scope,m->>'id' id,m->>'text' text,m->>'startsAt' start,m->>'endsAt' "end",m->>'contractIds' contracts,m->>'regimeIds' regimes,m->>'payrollTypes' types FROM ${payrollConfigurationObservedAt("HR_PAYROLL_RULE", sql`${reference}`)} r JOIN ${payrollConfigurationObservedAt("HR_PAYROLL_RULE_SET", sql`${reference}`)} p ON p.id=r."ruleSetId" CROSS JOIN LATERAL jsonb_array_elements(r.value->'messages') m WHERE r."isActive" AND r.code='MENSAGENS_RECIBO' AND p."effectiveFrom"::date<=${reference}::date AND (p."effectiveUntil" IS NULL OR p."effectiveUntil"::date>=${reference}::date) AND (${input.q}='' OR strpos(lower(m->>'text'),lower(${input.q}))>0) ORDER BY p.code,m->>'startsAt',m->>'id'`);
  if (input.kind === "PARAMETROS_PREVIDENCIA") return query("Parâmetros previdenciários — configuração, não recolhimento", [["package", "Pacote"], ["scope", "Escopo"], ["name", "Regime"], ["method", "Método"], ["ceiling", "Teto BRL"], ["employer", "Patronal %"], ["sequence", "Faixa"], ["lower", "De BRL"], ["upper", "Até BRL"], ["rate", "Segurado %"], ["from", "Vigência"], ["legal", "Fundamento"]], sql`
    SELECT p.code package,p.scope,s.name,s.state->>'employeeCalculationMethod' method,s.state->>'ceilingValue' ceiling,s.state->>'employerContributionRate' employer,
      b.state->>'sequence' sequence,b.state->>'lowerLimit' lower,b.state->>'upperLimit' upper,b.state->>'employeeRate' rate,to_char(p."effectiveFrom",'YYYY-MM-DD') "from",s."legalReference" legal
    FROM ${payrollConfigurationObservedAt("HR_SOCIAL_SECURITY_SCHEME", sql`${reference}`)} s JOIN ${payrollConfigurationObservedAt("HR_PAYROLL_RULE_SET", sql`${reference}`)} p ON p.id=s."ruleSetId" LEFT JOIN ${payrollConfigurationObservedAt("HR_SOCIAL_SECURITY_BAND", sql`${reference}`)} b ON b.state->>'socialSecuritySchemeId'=s.id
    WHERE p."effectiveFrom"::date<=${reference}::date AND (p."effectiveUntil" IS NULL OR p."effectiveUntil"::date>=${reference}::date) AND (${input.q}='' OR strpos(lower(s.name||' '||p.code),lower(${input.q}))>0) ORDER BY p.code,s.code,(b.state->>'sequence')::integer`);
  if (input.kind === "HORARIOS_TRABALHO") return query("Horários e jornadas contratuais — escalas explicitamente configuradas", [...identity, ["weekly", "Jornada semanal estimada"], ["monthly", "Divisor mensal"], ["scale", "Escala"], ["weekdays", "Dias da semana"], ["entry", "Entrada"], ["exit", "Saída"], ["break", "Intervalo não remunerado (min)"], ["daily", "Horas líquidas da faixa"], ["from", "Início escala"], ["until", "Fim escala"]], sql`${historical}
    SELECT h.name,h.state->>'registration' registration,h.department,h.state->'details'->>'weeklyHours' weekly,h.state->>'monthlyHours' monthly,s.name scale,s.details->>'weekdays' weekdays,
      f.details->>'start' entry,f.details->>'end' exit,f.details->>'breakMinutes' break,
      CASE WHEN f.details->>'breakMinutes' IS NOT NULL THEN round((extract(epoch FROM ((f.details->>'end')::time-(f.details->>'start')::time
        +CASE WHEN f.details->>'end'<f.details->>'start' THEN interval '1 day' ELSE interval '0 day' END))/3600-(f.details->>'breakMinutes')::numeric/60)::numeric,4) END daily,
      s.details->>'from' "from",s.details->>'until' until
    FROM holders h LEFT JOIN ${referenceRecordsObservedAt(sql`${reference}`)} s ON s.kind='ESCALA' AND s.details->>'employeeId'=h."employeeId" AND s.details->>'from'<=${reference} AND s.details->>'until'>=${reference}
    LEFT JOIN ${referenceRecordsObservedAt(sql`${reference}`)} f ON f.id=s.details->>'rangeId' AND f.kind='FAIXA' WHERE ${active} ORDER BY h.name,h.id,s.id`);
  if (input.kind === "DEPENDENTES_RH") return query("Dependentes — relação interna com elegibilidade cadastral", [...identity, ["dependent", "Dependente"], ["relationship", "Parentesco"], ["birth", "Nascimento"], ["irrf", "IRRF cadastral"], ["family", "Salário-família cadastral"]], sql`SELECT e.name,e.registration,d.name department,p.name dependent,p.relationship,to_char(p."birthDate",'YYYY-MM-DD') birth,p."irrfDependent" irrf,p."familyWage" family FROM "Dependent" p JOIN "Employee" e ON e.id=p."employeeId" LEFT JOIN "Department" d ON d.id=e."departmentId" WHERE ${currentFilter} ORDER BY e.name,p.name,p.id`);
  if (input.kind === "PONTO_COLETIVO" || input.kind === "FREQUENCIA_COLETIVA") {
    const detailed = input.kind === "PONTO_COLETIVO";
    return query(detailed ? "Folha de ponto coletiva — registros da origem RH/Portal" : "Folha de frequência coletiva por período", [...identity, ...(detailed ? [["date", "Data"], ["entry", "Entrada local"], ["exit", "Saída local"], ["status", "Situação"]] : [["records", "Dias registrados"], ["absences", "Faltas registradas"]]), ["contracted", "Horas previstas nos registros"], ["worked", "Horas trabalhadas"], ["extra", "Horas extras"], ["bank", "Banco de horas"], ["source", "Origem"]] as Array<[string, string]>, detailed ? sql`SELECT e.name,e.registration,d.name department,to_char(a.date,'YYYY-MM-DD') date,to_char(a."entryTime" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo','HH24:MI') entry,to_char(a."exitTime" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo','HH24:MI') exit,a.status,a."contractedHours" contracted,a."hoursWorked" worked,a."extraHours" extra,a."bankHours" bank,CASE WHEN starts_with(a.id,'RH_PORTAL_2026_V1:') THEN 'DEMONSTRAÇÃO — marcações sintéticas' ELSE 'Registro operacional' END source FROM "AttendanceRecord" a JOIN "Employee" e ON e.id=a."employeeId" LEFT JOIN "Department" d ON d.id=e."departmentId" WHERE ${currentFilter} AND a.date::date BETWEEN ${from}::date AND ${until}::date ORDER BY d.name,e.name,a.date,a.id` : sql`SELECT e.name,e.registration,d.name department,count(DISTINCT a.date::date)::int records,count(DISTINCT a.date::date) FILTER(WHERE a.status='Falta')::int absences,sum(a."contractedHours"::numeric) contracted,sum(a."hoursWorked"::numeric) worked,sum(a."extraHours"::numeric) extra,sum(a."bankHours"::numeric) bank,CASE WHEN bool_and(starts_with(a.id,'RH_PORTAL_2026_V1:')) THEN 'DEMONSTRAÇÃO — registros sintéticos' ELSE 'Conferir origem dos registros' END source FROM "AttendanceRecord" a JOIN "Employee" e ON e.id=a."employeeId" LEFT JOIN "Department" d ON d.id=e."departmentId" WHERE ${currentFilter} AND a.date::date BETWEEN ${from}::date AND ${until}::date GROUP BY e.id,e.name,e.registration,d.name ORDER BY d.name,e.name,e.id`);
  }
  if (input.kind === "ATS_COLETIVO") return query("Adicionais por tempo de serviço — memória canônica e situação da apuração", [...identity, ["competence", "Competência"], ["scope", "Escopo"], ["salary", "Base temporal BRL"], ["calendar", "Dias corridos"], ["excluded", "Dias excluídos"], ["credited", "Dias averbados"], ["counted", "Dias computados"], ["rate", "Percentual"], ["amount", "Valor apurado BRL"], ["legal", "Fundamento"], ["source", "Origem"], ["status", "Situação"]], sql`
    SELECT e.name,e.registration,d.name department,"Payroll".competence,a.environment scope,a.payload->>'salary' salary,
      a.payload->'assessment'->>'calendarDays' calendar,a.payload->'assessment'->>'excludedDays' excluded,a.payload->'assessment'->>'creditedDays' credited,
      a.payload->'assessment'->>'countedDays' counted,a.payload->'assessment'->>'rate' rate,a.payload->'assessment'->>'amount' amount,
      a.payload->'assessment'->'policy'->>'legalReference' legal,a."sourceKey" source,
      CASE WHEN EXISTS(SELECT 1 FROM "HrIntegrationEvent" reversal WHERE reversal."sourceKey"='ESTORNO:'||a."sourceKey") THEN 'ESTORNADO' ELSE 'Apuração registrada' END status
    FROM "HrIntegrationEvent" a JOIN "HrEmploymentContract" c ON c.id=a.payload->'input'->>'contractId'
    JOIN "Employee" e ON e.id=c."employeeId" LEFT JOIN "Department" d ON d.id=c."departmentId"
    JOIN "Payroll" ON "Payroll".id=a.payload->'input'->>'payrollId'
    WHERE a."eventType"='ATS_APURADO' AND ${currentFilter} AND ${payrollScope ?? sql`true`}
      AND ${reportPayrollPredicate(input, sql`"Payroll".competence`, sql`"Payroll".type`)}
      AND to_date("Payroll".competence,'MM/YYYY') BETWEEN date_trunc('month',${from}::date) AND ${until}::date
      ${input.payrollId ? sql`AND "Payroll".id=${input.payrollId}` : sql``} ORDER BY to_date("Payroll".competence,'MM/YYYY'),e.name,a.id`);
  if (["EVOLUCAO_GLOBAL", "EVOLUCAO_SERVIDOR", "EVOLUCAO_UNIDADE", "FICHA_RESUMIDA_VERBA"].includes(input.kind)) {
    const preservedHolder = sql`(${input.q}='' OR strpos(lower(s.snapshot->'contract'->'employee'->>'name'),lower(${input.q}))>0 OR strpos(s.snapshot->'contract'->>'registration',${input.q})>0)
      AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)} ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``}`;
    const selected = await db.select({ id: sql<string>`s.id`, snapshot: sql<unknown>`s.snapshot`, competence: payrolls.competence, type: payrolls.type, scope: sql<string>`r.scope`, gross: sql<string>`s.gross::text`, deductions: sql<string>`s.deductions::text`, net: sql<string>`s.net::text`, employer: sql<string>`s.employer::text` }).from(payrolls).innerJoin(sql`"HrPayrollRun" r`, sql`r."payrollId"=${payrolls.id}`).innerJoin(sql`"HrPayrollStatement" s`, sql`s."runId"=r.id`).innerJoin(sql`"HrEmploymentContract" c`, sql`c.id=s."contractId"`).innerJoin(sql`"Employee" e`, sql`e.id=c."employeeId"`).where(sql`r.status='FECHADA' AND r.mode='OFICIAL' AND ${payrollScope ?? sql`true`} AND ${preservedHolder} AND ${reportContractPredicate(input, sql`s.snapshot->'contract'`, sql`to_date(${payrolls.competence},'MM/YYYY')`, reportPayrollAllocationSource(sql`r.id`, sql`r.snapshot`))} AND ${reportPayrollPredicate(input, payrolls.competence, payrolls.type)} AND to_date(${payrolls.competence},'MM/YYYY') BETWEEN date_trunc('month',${from}::date) AND ${until}::date ${input.payrollId ? sql`AND ${payrolls.id}=${input.payrollId}` : sql``}`).orderBy(sql`to_date(${payrolls.competence},'MM/YYYY')`, payrolls.type, sql`s.id`);
    const grouped = new Map<string, { labels: string[]; totals: Decimal[]; series: string; date: string }>();
    for (const row of selected) {
      const snapshot = snapshotSchema.parse(row.snapshot), c = snapshot.contract;
      if (input.departmentId && c.departmentId !== input.departmentId) continue;
      const periodLabel = input.kind === "FICHA_RESUMIDA_VERBA" ? `${from} a ${until}` : row.competence;
      const labels = input.kind === "EVOLUCAO_GLOBAL" ? [periodLabel, row.type, row.scope] : input.kind === "EVOLUCAO_UNIDADE" ? [periodLabel, row.type, row.scope, c.employee.unitId ?? "SEM_UNIDADE", c.workLocation] : [periodLabel, row.type, row.scope, c.employeeId, c.employee.name];
      const selectedCodes = new Set((input.rubricCodes ?? "").split(",").filter(Boolean));
      const items = input.kind === "FICHA_RESUMIDA_VERBA" ? snapshot.items.filter(item => !selectedCodes.size || selectedCodes.has(item.code)) : null;
      for (const item of items ?? [null]) {
        const fields = item ? [...labels, item.code, item.name, item.type] : labels;
        const key = JSON.stringify(fields), totals = item ? [new Decimal(item.value)] : [row.gross, row.deductions, row.net, row.employer].map(amount => new Decimal(amount));
        const group = grouped.get(key) ?? { labels: fields, totals: totals.map(() => new Decimal(0)), series: JSON.stringify(fields.slice(1)), date: `${row.competence.slice(3)}-${row.competence.slice(0, 2)}` };
        group.totals = group.totals.map((total, i) => total.plus(totals[i])); grouped.set(key, group);
      }
    }
    const baseHeaders = [input.kind === "FICHA_RESUMIDA_VERBA" ? "Período" : "Competência", "Tipo de folha", "Escopo", ...(input.kind === "EVOLUCAO_GLOBAL" ? [] : input.kind === "EVOLUCAO_UNIDADE" ? ["Unidade histórica ID", "Local histórico"] : ["Servidor ID", "Servidor"]), ...(["FICHA_RESUMIDA_VERBA", "ATS_COLETIVO"].includes(input.kind) ? ["Verba", "Descrição", "Natureza", "Valor BRL"] : ["Bruto BRL", "Descontos BRL", "Líquido BRL", "Encargos BRL", "Variação do bruto BRL", "Variação do bruto %"])];
    const previous = new Map<string, Decimal>();
    const rows = [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date) || a.series.localeCompare(b.series)).map(group => {
      const before = previous.get(group.series), gross = group.totals[0]; previous.set(group.series, gross);
      return [...group.labels, ...group.totals.map(total => total.toFixed(2)), ...(group.totals.length === 1 ? [] : [before ? gross.minus(before).toFixed(2) : "", before && !before.isZero() ? gross.minus(before).div(before).mul(100).toFixed(2) : ""])];
    });
    return { title: `${input.kind === "ATS_COLETIVO" ? "Relação coletiva de adicionais por tempo de serviço" : input.kind === "FICHA_RESUMIDA_VERBA" ? "Ficha financeira resumida por verba e competência" : "Evolução da folha — diferença em relação ao cálculo anterior da série"} — cálculos fechados; não comprova pagamento`, headers: baseHeaders, rows };
  }
  if (input.kind === "VERBAS_FIXAS_VARIAVEIS") return query("Verbas e movimentos por vigência — classificação e origem registradas", [...identity, ["contract", "Contrato"], ["rubric", "Verba"], ["amount", "Valor BRL"], ["from", "Início"], ["until", "Fim"], ["reference", "Referência"], ["source", "Origem"], ["notes", "Observação"]], sql`SELECT e.name,e.registration,d.name department,c.registration contract,m."rubricCode" rubric,m.amount,to_char(m."startsAt",'YYYY-MM-DD') "from",to_char(m."endsAt",'YYYY-MM-DD') until,m.reference,m."sourceKey" source,m.notes FROM "HrMovement" m JOIN "HrEmploymentContract" c ON c.id=m."contractId" JOIN "Employee" e ON e.id=c."employeeId" LEFT JOIN "Department" d ON d.id=e."departmentId" WHERE ${currentFilter} AND m."startsAt"::date<=${until}::date AND (m."endsAt" IS NULL OR m."endsAt"::date>=${from}::date) ORDER BY e.name,m."startsAt",m.id`);
  if (input.kind === "HISTORICO_FUNCIONAL" || input.kind === "MOVIMENTACAO_PESSOAL" || input.kind === "ADMISSOES_CEDENCIAS") return query("Movimentação funcional — revisões contratuais e atos de pessoal", [...identity, ["date", "Data"], ["type", "Tipo"], ["description", "Descrição"], ["source", "Origem"]], sql`SELECT * FROM (SELECT e.name,e.registration,d.name department,to_char(r."effectiveFrom",'YYYY-MM-DD') date,CASE WHEN r.version=1 THEN 'Admissão contratual' ELSE 'Revisão contratual' END type,r.reason description,r.id source FROM "HrEmploymentRevision" r JOIN "HrEmploymentContract" c ON c.id=r."contractId" JOIN "Employee" e ON e.id=c."employeeId" LEFT JOIN "Department" d ON d.id=e."departmentId" WHERE ${currentFilter} AND r."effectiveFrom"::date BETWEEN ${from}::date AND ${until}::date UNION ALL SELECT e.name,e.registration,d.name department,to_char(a.date,'YYYY-MM-DD') date,a.type,coalesce(a."actNumber",'') description,a.id source FROM "PersonnelAct" a JOIN "Employee" e ON e.id=a."employeeId" LEFT JOIN "Department" d ON d.id=e."departmentId" WHERE ${currentFilter} AND a.date::date BETWEEN ${from}::date AND ${until}::date) events ORDER BY date,name,source`);
  if (input.kind === "OCORRENCIAS_FUNCIONAIS") return query("Ocorrências funcionais registradas", [...identity, ["date", "Data"], ["type", "Tipo"], ["number", "Ato"], ["document", "Documento"]], sql`SELECT e.name,e.registration,d.name department,to_char(a.date,'YYYY-MM-DD') date,a.type,a."actNumber" number,a."documentUrl" document FROM "PersonnelAct" a JOIN "Employee" e ON e.id=a."employeeId" LEFT JOIN "Department" d ON d.id=e."departmentId" WHERE ${currentFilter} AND a.date::date BETWEEN ${from}::date AND ${until}::date ORDER BY a.date,e.name,a.id`);
  if (input.kind === "MAPA_OCUPACAO") return query("Mapa de ocupação — vagas legais por cargo na referência", [["role", "Cargo"], ["holders", "Pessoas distintas no filtro"], ["contracts", "Vínculos ativos no filtro"], ["authorized", "Vagas legais (todo o cargo)"], ["vacant", "Vagas menos vínculos (todo o cargo)"], ["hours", "Soma dos divisores mensais no filtro"], ["legal", "Ato / fundamento"], ["status", "Situação"]], sql`${historical},
    occupation AS (SELECT state->>'roleId' role_id,count(DISTINCT "employeeId")::int holders,count(*)::int contracts,sum((state->>'monthlyHours')::numeric) hours FROM holders WHERE ${active} GROUP BY state->>'roleId'),
    full_occupation AS (SELECT state->>'roleId' role_id,count(*)::int contracts FROM historical WHERE ${active} GROUP BY state->>'roleId'),
    legal AS (SELECT DISTINCT ON ("roleId") "roleId",state,"authorizedSeats","legalReference" FROM "HrRoleLegalHistory" WHERE "effectiveFrom"<=${reference}::date ORDER BY "roleId","effectiveFrom" DESC,version DESC)
    SELECT r.name role,coalesce(o.holders,0) holders,coalesce(o.contracts,0) contracts,
      CASE WHEN l.state='EXISTING' THEN l."authorizedSeats" END authorized,
      CASE WHEN l.state='EXISTING' THEN l."authorizedSeats"-coalesce(f.contracts,0) END vacant,
      coalesce(o.hours,0) hours,l."legalReference" legal,
      CASE WHEN l.state='EXISTING' THEN 'Quadro legal na referência; vagas comparadas à ocupação integral do cargo' WHEN l.state='EXTINGUISHED' THEN 'Cargo extinto na referência' ELSE 'PENDENTE — quadro legal vigente não localizado' END status
    FROM "Role" r LEFT JOIN occupation o ON o.role_id=r.id LEFT JOIN full_occupation f ON f.role_id=r.id LEFT JOIN legal l ON l."roleId"=r.id
    WHERE o.role_id IS NOT NULL ${!input.q && !input.employeeId && !input.departmentId ? sql`OR l."roleId" IS NOT NULL` : sql``} ORDER BY r.name,r.id`);
  if (input.kind === "DIMENSIONAMENTO") return query("Dimensionamento — ocupação e demanda explicitamente parametrizada", [["role", "Cargo"], ["department", "Lotação"], ["holders", "Pessoas distintas"], ["contracts", "Vínculos"], ["hours", "Divisores mensais somados"], ["positions", "Postos demandados"], ["weekly", "Jornada semanal por posto"], ["gap", "Déficit de postos (demanda menos vínculos)"], ["method", "Premissa / origem"]], sql`${historical},
    occupation AS (SELECT state->>'roleId' role_id,state->>'departmentId' department_id,count(DISTINCT "employeeId")::int holders,count(*)::int contracts,sum((state->>'monthlyHours')::numeric) hours FROM holders WHERE ${active} GROUP BY state->>'roleId',state->>'departmentId'),
    demand AS (SELECT details FROM "HrReferenceRecord" WHERE kind='DEMANDA_PESSOAL' AND details->>'from'<=${reference} AND details->>'until'>=${reference}
      ${input.departmentId ? sql`AND details->>'departmentId'=${input.departmentId}` : sql``} ${input.q || input.employeeId ? sql`AND false` : sql``})
    SELECT r.name role,d.name department,coalesce(o.holders,0) holders,coalesce(o.contracts,0) contracts,coalesce(o.hours,0) hours,
      a.details->>'positions' positions,a.details->>'weeklyHours' weekly,(a.details->>'positions')::int-coalesce(o.contracts,0) gap,
      coalesce(a.details->>'method','PENDENTE — demanda não cadastrada para a referência') method
    FROM occupation o FULL JOIN demand a ON a.details->>'roleId'=o.role_id AND a.details->>'departmentId'=o.department_id
    LEFT JOIN "Role" r ON r.id=coalesce(o.role_id,a.details->>'roleId') LEFT JOIN "Department" d ON d.id=coalesce(o.department_id,a.details->>'departmentId')
    ORDER BY d.name,r.name`);
  throw new Error("Modalidade operacional sem implementação.");
}
