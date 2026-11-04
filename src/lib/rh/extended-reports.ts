import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { buildAbsenceReturnReport } from "./absence-return-report";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { payrolls } from "@/db/schema/personnel-workforce";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { functionalDefinition, type FunctionalKind } from "./functional-records";
import { reportContractPredicate, reportEmployeePredicate, reportFunctionalRulePredicate, reportPayrollAllocationSource, reportPayrollPredicate, reportRubricPredicate } from "./report-filters";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";
import { functionalRecordsObservedAt } from "./functional-timeline-query";
import { payrollConfigurationObservedAt } from "./configuration-timeline-query";

export const extendedReportCatalog = [
  [75, "Contracheques em texto", "CONTRACHEQUES_TEXTO"], [76, "Dados cadastrais e financeiros", "CADASTRAL_FINANCEIRO_TEXTO"],
  [77, "Comparação salarial por cargo", "MEDIA_SALARIAL_CARGO"], [78, "Comparação salarial por lotação", "MEDIA_SALARIAL_LOTACAO"],
  [79, "Pensões — totais por beneficiário e processo", "PENSAO_SINTETICA"], [80, "Recibos de pensão judicial", "PENSAO_RECIBO"],
  [81, "Previsão de retorno de afastamentos", "RETORNO_AFASTAMENTOS"], [82, "Cessões e recebimentos", "CESSOES_ESTRUTURADAS"],
  [83, "Estágios e vencimentos", "ESTAGIOS_COMPLETOS"], [84, "Readaptações e reabilitações", "READAPTACOES_COMPLETAS"],
  [85, "Comissões e exercício eletivo", "COMISSOES_ESTRUTURADAS"], [86, "Exonerações e demissões", "DESLIGAMENTOS_TIPADOS"],
  [87, "Parâmetros de adicionais por tempo", "PARAMETROS_ATS"], [88, "Parâmetros de progressão", "PARAMETROS_PROGRESSAO"],
  [89, "Parâmetros de férias especiais", "PARAMETROS_FERIAS_ESPECIAIS"], [90, "Parâmetros de piso e teto", "PARAMETROS_LIMITES"],
  [91, "Parâmetros de abono-família", "PARAMETROS_ABONO"], [92, "Exclusão de dependentes por vigência", "PARAMETROS_DEPENDENTES"],
  [93, "Serviços bancários por convênio", "SERVICOS_BANCARIOS_RH"], [94, "Valores de horas-aula", "VALORES_HORA_AULA"],
  [95, "Avaliação de programas de treinamento", "AVALIACAO_TREINAMENTO_RH"], [96, "Parâmetros de aposentadoria e transição", "PARAMETROS_APOSENTADORIA"],
] as const;
export const extendedReportKinds = extendedReportCatalog.map(item => item[2]);
const recordKind: Partial<Record<typeof extendedReportCatalog[number][2], FunctionalKind>> = {
  CESSOES_ESTRUTURADAS: "CESSAO", ESTAGIOS_COMPLETOS: "ESTAGIO", READAPTACOES_COMPLETAS: "READAPTACAO", COMISSOES_ESTRUTURADAS: "COMISSAO", DESLIGAMENTOS_TIPADOS: "DESLIGAMENTO",
  PARAMETROS_ATS: "REGRA_ATS", PARAMETROS_PROGRESSAO: "REGRA_PROGRESSAO", PARAMETROS_FERIAS_ESPECIAIS: "FERIAS_ESPECIAIS", PARAMETROS_LIMITES: "REGRA_LIMITE", PARAMETROS_ABONO: "REGRA_ABONO",
  PARAMETROS_DEPENDENTES: "DEPENDENTE_VIGENCIA", SERVICOS_BANCARIOS_RH: "SERVICO_BANCARIO", VALORES_HORA_AULA: "HORA_AULA", AVALIACAO_TREINAMENTO_RH: "AVALIACAO_TREINAMENTO", PARAMETROS_APOSENTADORIA: "REGRA_APOSENTADORIA",
};
const stateSchema = z.object({ contract: z.object({ registration: z.string(), employeeId: z.string(), roleId: z.string().optional(), departmentId: z.string().nullable(), workLocation: z.string(), employee: z.object({ name: z.string(), person: z.object({ cpf: z.string().nullable().optional() }).passthrough().nullable().optional() }) }), items: z.array(z.object({ code: z.string(), name: z.string(), type: z.string(), value: z.string() })), bases: z.record(z.string(), z.string()).optional().default({}), pensions: z.array(z.object({ courtReference: z.string(), amount: z.string(), beneficiary: z.object({ id: z.string(), fullName: z.string(), cpf: z.string() }) })).optional().default([]) });

export async function buildExtendedHrReport(db: DatabaseExecutor, input: OperationalReportInput, payrollScope?: SQL, budgetUnitIds?: readonly string[]): Promise<PersonnelReport> {
  const title = extendedReportCatalog.find(item => item[2] === input.kind)?.[1] ?? input.kind;
  const reference = input.referenceDate ?? new Date().toISOString().slice(0, 10);
  const from = input.from ?? (input.competence ? `${input.competence.slice(3)}-${input.competence.slice(0, 2)}-01` : `${input.year ?? reference.slice(0, 4)}-01-01`);
  const until = input.until ?? (input.competence ? new Date(Date.UTC(Number(input.competence.slice(3)), Number(input.competence.slice(0, 2)), 0)).toISOString().slice(0, 10) : `${input.year ?? reference.slice(0, 4)}-12-31`);
  if (from > until) throw new Error("Fim do período anterior ao início.");
  if (input.kind === "PARAMETROS_DEPENDENTES") {
    const selected = await db.execute<{ name: string; employee: string | null; benefit: string; startsAt: string; endsAt: string | null; policy: unknown; version: string }>(sql`
      SELECT f.name,coalesce(personal.snapshot->'person'->>'fullName','Identidade sem fonte documental na referência') employee,f.data->>'benefit' benefit,to_char(f."startsAt",'YYYY-MM-DD') "startsAt",to_char(f."endsAt",'YYYY-MM-DD') "endsAt",f.data policy,f.version::text version
       FROM ${functionalRecordsObservedAt(sql`${reference}`)} f JOIN "Employee" e ON e.id=f."employeeId"
       LEFT JOIN LATERAL (SELECT snapshot FROM "HrPersonalRevision" WHERE "employeeId"=e.id AND "effectiveFrom"<${reference}::date+interval '1 day' ORDER BY "effectiveFrom" DESC,id DESC LIMIT 1) personal ON true
      WHERE f.kind='DEPENDENTE_VIGENCIA' AND f.status<>'CANCELADO' AND f."startsAt"::date<=${reference}::date AND (f."endsAt" IS NULL OR f."endsAt"::date>=${reference}::date)
        AND ${reportEmployeePredicate(input, sql`e.id`, sql`${reference}`)} AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)}
        ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``}
        AND (${input.q}='' OR strpos(lower(concat_ws(' ',f.name,personal.snapshot->'person'->>'fullName',f.data->>'benefit')),lower(${input.q}))>0)
      UNION ALL SELECT r.name,NULL,CASE WHEN r.value->>'origin'='SALARIO_FAMILIA' THEN 'SALARIO_FAMILIA' ELSE 'IRRF' END,to_char(p."effectiveFrom",'YYYY-MM-DD'),to_char(p."effectiveUntil",'YYYY-MM-DD'),r.value,r."updatedAt"
      FROM ${payrollConfigurationObservedAt("HR_PAYROLL_RULE", sql`${reference}`)} r JOIN ${payrollConfigurationObservedAt("HR_PAYROLL_RULE_SET", sql`${reference}`)} p ON p.id=r."ruleSetId"
      WHERE r."isActive" AND (r.code='DEPENDENTES_IRRF' OR r.value->>'origin'='SALARIO_FAMILIA') AND p."effectiveFrom"::date<=${reference}::date AND (p."effectiveUntil" IS NULL OR p."effectiveUntil"::date>=${reference}::date)
        AND (coalesce(r.value->>'rubricCode','')='' OR ${reportRubricPredicate(input, sql`r.value->>'rubricCode'`)})
        AND (${input.q}='' OR strpos(lower(concat_ws(' ',r.name,r.code,p.name)),lower(${input.q}))>0)
      UNION ALL SELECT f.name,NULL,'ABONO_FAMILIA',to_char(f."startsAt",'YYYY-MM-DD'),to_char(f."endsAt",'YYYY-MM-DD'),f.data,f.version::text
      FROM ${functionalRecordsObservedAt(sql`${reference}`)} f WHERE f.kind='REGRA_ABONO' AND f.status<>'CANCELADO' AND f."startsAt"::date<=${reference}::date AND (f."endsAt" IS NULL OR f."endsAt"::date>=${reference}::date)
        AND ${reportFunctionalRulePredicate(input, sql`f.data`, sql`${reference}`, budgetUnitIds)}
        AND ${reportRubricPredicate(input, sql`f.data->>'rubricCode'`)} AND (${input.q}='' OR strpos(lower(f.name),lower(${input.q}))>0)
      ORDER BY benefit,name,employee`);
    return { title: `${title} — regras observadas até ${reference}`, headers: ["Regra / enquadramento", "Servidor / alcance", "Benefício", "Início", "Fim", "Limites, exceções, documentos e fundamento", "Versão / atualização"], rows: selected.rows.map(row => [row.name, row.employee ?? "Política geral; aplicar ao enquadramento configurado", row.benefit, row.startsAt, row.endsAt ?? "", JSON.stringify(row.policy), row.version]) };
  }
  const kind = recordKind[input.kind as keyof typeof recordKind];
  if (kind) {
    if (kind === "READAPTACAO" && !input.clinicalAuthorized) throw new Error("Seu perfil não possui autorização clínica de RH.");
    const definition = functionalDefinition(kind);
    const selected = await db.execute<{ id: string; name: string; employee: string | null; registration: string | null; startsAt: string; endsAt: string | null; status: string; data: Record<string, string>; version: number; actorId: string }>(sql`
      SELECT f.id,f.name,CASE WHEN f."employeeId" IS NULL THEN NULL ELSE coalesce(personal.snapshot->'person'->>'fullName',v.snapshot->'employee'->>'name','Identidade sem fonte documental na referência') END employee,v.snapshot->>'registration' registration,to_char(f."startsAt",'YYYY-MM-DD') "startsAt",to_char(f."endsAt",'YYYY-MM-DD') "endsAt",f.status,f.data,f.version,f."actorId"
       FROM ${input.kind.startsWith("PARAMETROS_") || ["VALORES_HORA_AULA", "SERVICOS_BANCARIOS_RH"].includes(input.kind) ? functionalRecordsObservedAt(sql`${reference}`) : sql`"HrFunctionalRecord"`} f LEFT JOIN "Employee" e ON e.id=f."employeeId" LEFT JOIN "HrEmploymentContract" c ON c.id=f."contractId"
       LEFT JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=c.id AND "effectiveFrom"::date<=least(${until}::date,coalesce(f."endsAt"::date,${until}::date)) ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) v ON true
       LEFT JOIN LATERAL (SELECT snapshot FROM "HrPersonalRevision" WHERE "employeeId"=e.id AND "effectiveFrom"<least(${until}::date,coalesce(f."endsAt"::date,${until}::date))+interval '1 day' ORDER BY "effectiveFrom" DESC,id DESC LIMIT 1) personal ON true
      WHERE f.kind=${kind} AND f."startsAt"::date<=${until}::date AND (f."endsAt" IS NULL OR f."endsAt"::date>=${from}::date)
        AND (${input.q}='' OR strpos(lower(concat_ws(' ',f.name,personal.snapshot->'person'->>'fullName',v.snapshot->'employee'->>'name',v.snapshot->>'registration')),lower(${input.q}))>0)
        ${input.employeeId ? sql`AND (f."employeeId"=${input.employeeId} OR f."employeeId" IS NULL)` : sql``}
        AND (f."employeeId" IS NOT NULL OR ${reportFunctionalRulePredicate(input, sql`f.data`, sql`${reference}`, budgetUnitIds)})
        AND (f."contractId" IS NULL OR ${reportContractPredicate(input, sql`v.snapshot`, sql`${reference}`)})
        AND (f."employeeId" IS NULL OR ${reportEmployeePredicate(input, sql`e.id`, sql`${reference}`)})
        AND (coalesce(f.data->>'rubricCode','')='' OR ${reportRubricPredicate(input, sql`f.data->>'rubricCode'`)})
        ${input.departmentId ? sql`AND (v.snapshot->>'departmentId'=${input.departmentId} OR f."employeeId" IS NULL AND coalesce(f.data->>'departmentId','') IN ('',${input.departmentId}))` : sql``}
        AND (f."employeeId" IS NULL OR ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)})
       ORDER BY employee,f."startsAt",f.id`);
    return { title, headers: ["Registro", "Servidor", "Matrícula", "Início", "Fim", "Situação", ...definition.fields.map(field => field.label), "Versão", "Autor"], rows: selected.rows.map(row => [row.name, row.employee ?? "Regra geral", row.registration ?? "", row.startsAt, row.endsAt ?? "", row.status, ...definition.fields.map(field => row.data[field.name] ?? ""), String(row.version), row.actorId]) };
  }
  if (input.kind === "RETORNO_AFASTAMENTOS") return buildAbsenceReturnReport(db, input, budgetUnitIds);
  const selected = await db.select({ id: sql<string>`s.id`, competence: payrolls.competence, type: payrolls.type, snapshot: sql<unknown>`s.snapshot`, gross: sql<string>`s.gross::text`, deductions: sql<string>`s.deductions::text`, net: sql<string>`s.net::text` }).from(payrolls)
    .innerJoin(sql`"HrPayrollRun" r`, sql`r."payrollId"=${payrolls.id}`).innerJoin(sql`"HrPayrollStatement" s`, sql`s."runId"=r.id`)
    .where(sql`r.status='FECHADA' AND r.mode='OFICIAL' AND ${payrollScope ?? sql`true`} AND ${reportContractPredicate(input, sql`s.snapshot->'contract'`, sql`to_date(${payrolls.competence},'MM/YYYY')`, reportPayrollAllocationSource(sql`r.id`, sql`r.snapshot`))} AND ${reportPayrollPredicate(input, payrolls.competence, payrolls.type)} AND to_date(${payrolls.competence},'MM/YYYY') BETWEEN date_trunc('month',${from}::date) AND ${until}::date ${input.payrollId ? sql`AND ${payrolls.id}=${input.payrollId}` : sql``}`)
    .orderBy(sql`to_date(${payrolls.competence},'MM/YYYY')`, sql`s.id`);
  const rows = selected.map(row => ({ ...row, state: stateSchema.parse(row.snapshot) })).filter(row => {
    const c = row.state.contract;
    return (!input.employeeId || c.employeeId === input.employeeId) && (!input.departmentId || c.departmentId === input.departmentId) && (!input.q || `${c.employee.name} ${c.registration}`.toLocaleLowerCase("pt-BR").includes(input.q.toLocaleLowerCase("pt-BR")));
  });
  if (input.kind === "CONTRACHEQUES_TEXTO") return { title: `${title} — formato RH-CONTRACHEQUE-1; UTF-8; campos entre aspas, separados por ponto e vírgula`, headers: ["Competência", "Tipo folha", "Matrícula", "Servidor", "Linha", "Código", "Descrição", "Natureza", "Valor BRL", "Demonstrativo"], rows: rows.flatMap(row => {
    const prefix = [row.competence, row.type, row.state.contract.registration, row.state.contract.employee.name];
    return [...row.state.items.map(item => [...prefix, "RUBRICA", item.code, item.name, item.type, item.value, row.id]), ...Object.entries(row.state.bases).map(([code, value]) => [...prefix, "BASE", code, code, "BASE", value, row.id]), ...[["BRUTO", row.gross], ["DESCONTOS", row.deductions], ["LIQUIDO", row.net]].map(([code, value]) => [...prefix, "TOTAL", code, code, "TOTAL", value, row.id])];
  }) };
  if (input.kind === "CADASTRAL_FINANCEIRO_TEXTO") return { title: `${title} — formato RH-CADASTRAL-FINANCEIRO-1; UTF-8; ponto e vírgula`, headers: ["Competência", "Tipo folha", "Matrícula", "Servidor", "CPF", "Lotação histórica ID", "Local histórico", "Bruto BRL", "Descontos BRL", "Líquido BRL", "Demonstrativo"], rows: rows.map(row => [row.competence, row.type, row.state.contract.registration, row.state.contract.employee.name, row.state.contract.employee.person?.cpf ?? "", row.state.contract.departmentId ?? "", row.state.contract.workLocation, row.gross, row.deductions, row.net, row.id]) };
  if (input.kind === "MEDIA_SALARIAL_CARGO" || input.kind === "MEDIA_SALARIAL_LOTACAO") {
    // One row per statement and payroll type; distinct competences never share a mean.
    const groups = new Map<string, typeof rows>();
    for (const row of rows) { const key = JSON.stringify([row.competence, row.type, input.kind === "MEDIA_SALARIAL_CARGO" ? row.state.contract.roleId ?? "SEM_CARGO" : row.state.contract.departmentId ?? "SEM_LOTACAO"]); groups.set(key, [...(groups.get(key) ?? []), row]); }
    return { title: `${title} — média da remuneração bruta dos vínculos calculados no filtro`, headers: ["Competência", "Tipo folha", "Grupo ID", "Matrícula", "Servidor", "Quantidade do grupo", "Bruto BRL", "Média BRL", "Diferença BRL", "Diferença %", "Posição"], rows: [...groups.entries()].flatMap(([key, group]) => {
      const [competence, type, id] = JSON.parse(key) as string[];
      const average = group.reduce((sum, row) => sum.add(row.gross), new Decimal(0)).div(group.length);
      return group.map(row => { const delta = new Decimal(row.gross).sub(average); return [competence, type, id, row.state.contract.registration, row.state.contract.employee.name, String(group.length), row.gross, average.toFixed(2), delta.toFixed(2), average.isZero() ? "" : delta.div(average).mul(100).toFixed(4), delta.isZero() ? "NA_MEDIA" : delta.gt(0) ? "ACIMA" : "ABAIXO"]; });
    }) };
  }
  if (input.kind === "PENSAO_RECIBO") return { title: "Comprovante de desconto de pensão judicial", headers: ["Competência", "Tipo folha", "Titular", "Matrícula", "Beneficiário", "CPF beneficiário", "Processo", "Valor descontado BRL", "Demonstrativo", "Situação do repasse"], rows: rows.flatMap(row => row.state.pensions.map(pension => [row.competence, row.type, row.state.contract.employee.name, row.state.contract.registration, pension.beneficiary.fullName, pension.beneficiary.cpf, pension.courtReference, pension.amount, row.id, "Desconto em folha; consultar registro financeiro para comprovação do repasse"])), print: { kind: "pension-receipt", margin: 42 } };
  if (input.kind === "PENSAO_SINTETICA") {
    const groups = new Map<string, { labels: string[]; value: Decimal }>();
    for (const row of rows) for (const pension of row.state.pensions) { const labels = [row.competence, pension.beneficiary.id, pension.beneficiary.fullName, pension.beneficiary.cpf, pension.courtReference], key = JSON.stringify(labels), group = groups.get(key) ?? { labels, value: new Decimal(0) }; group.value = group.value.add(pension.amount); groups.set(key, group); }
    return { title, headers: ["Competência", "Beneficiário ID", "Beneficiário", "CPF", "Processo", "Total descontado BRL"], rows: [...groups.values()].map(group => [...group.labels, group.value.toFixed(2)]) };
  }
  throw new Error("Modalidade de relatório indisponível.");
}
