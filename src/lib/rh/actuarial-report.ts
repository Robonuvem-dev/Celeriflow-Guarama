import { sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { reportContractPredicate, reportPayrollPredicate } from "./report-filters";
import { Decimal } from "@/db/decimal";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";
import { functionalRecordsObservedAt } from "./functional-timeline-query";

/** Internal columnar dataset. Provider adapters consume this source under their own versioned layouts. */
export async function buildActuarialDataset(db: DatabaseExecutor, input: OperationalReportInput, budgetUnitIds?: readonly string[], payrollScope?: SQL): Promise<PersonnelReport> {
  const reference = input.referenceDate ?? new Date().toISOString().slice(0, 10);
  const result = await db.execute<{ id: string; employeeId: string; registration: string; state: Record<string, unknown>; person: Record<string, unknown> | null; observed: string | null; regime: string; scheme: string | null; category: string | null; benefit: string | null; statement: string | null; competence: string | null; base: string | null; personal: string | null; employer: string | null; dependents: Array<Record<string, unknown>> | null }>(sql`
    SELECT c.id,e.id "employeeId",v.snapshot->>'registration' registration,v.snapshot state,personal.snapshot->'person' person,personal."effectiveFrom"::text observed,
      coalesce(payment."regimeName",v.snapshot->>'regimeId') regime,payment.scheme,category.data->>'category' category,category.data->>'amount' benefit,
      payment.id statement,payment.competence,payment.base,payment.personal,payment.employer,personal.snapshot->'dependents' dependents
    FROM "HrEmploymentContract" c JOIN "Employee" e ON e.id=c."employeeId"
    JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=c.id AND "effectiveFrom"<${reference}::date+interval '1 day' ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) v ON true
    LEFT JOIN LATERAL (SELECT snapshot,"effectiveFrom" FROM "HrPersonalRevision" WHERE "employeeId"=e.id AND "effectiveFrom"<${reference}::date+interval '1 day' ORDER BY "effectiveFrom" DESC,id DESC LIMIT 1) personal ON true
    LEFT JOIN LATERAL (SELECT data FROM ${functionalRecordsObservedAt(sql`${reference}`)} observed_category WHERE "contractId"=c.id AND kind='CATEGORIA_FOLHA' AND status<>'CANCELADO' AND "startsAt"::date<=${reference}::date AND ("endsAt" IS NULL OR "endsAt"::date>=${reference}::date) ORDER BY "startsAt" DESC,id DESC LIMIT 1) category ON true
    LEFT JOIN LATERAL (SELECT s.id,"Payroll".competence,s.snapshot->'regime'->>'name' "regimeName",s.snapshot->'regime'->'socialSecurityScheme'->>'regime' scheme,coalesce(s.snapshot->'beneficiaryContribution'->>'allocatedTaxableBase',s.snapshot->'optionalPension'->>'employeeBase',s.snapshot->'bases'->>(s.snapshot->'regime'->'socialSecurityScheme'->>'regime')) base,
      (SELECT sum((item->>'value')::numeric)::text FROM jsonb_array_elements(s.snapshot->'items') item WHERE item->>'code' LIKE 'PREVIDENCIA_%') personal,
      coalesce((s.snapshot->'employerComponents'->>'PREVIDENCIA_PATRONAL')::numeric+(s.snapshot->'employerComponents'->>'CONTRIBUICAO_ATUARIAL')::numeric,
        s.employer-coalesce((SELECT sum((item->>'value')::numeric) FROM jsonb_array_elements(s.snapshot->'items') item WHERE item->>'code' IN ('FGTS','PIS_PASEP')),0))::text employer
      FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" ON "Payroll".id=r."payrollId"
       WHERE s."contractId"=c.id AND r.mode='OFICIAL' AND r.status='FECHADA' AND "Payroll".type='Mensal' AND to_date("Payroll".competence,'MM/YYYY')<=${reference}::date AND ${payrollScope ?? sql`true`}
       AND s.snapshot->'regime'->>'id'=v.snapshot->>'regimeId'
      AND ${reportPayrollPredicate(input, sql`"Payroll".competence`, sql`"Payroll".type`)}
      ORDER BY to_date("Payroll".competence,'MM/YYYY') DESC,s.id DESC LIMIT 1) payment ON true
    WHERE (v.snapshot->>'admittedAt')::date<=${reference}::date AND (v.snapshot->>'endsAt' IS NULL OR (v.snapshot->>'endsAt')::date>=${reference}::date)
      AND ${reportContractPredicate(input, sql`v.snapshot`, sql`${reference}`)}
      AND (v.snapshot->>'status'='ATIVO' OR category.data->>'category' IN ('APOSENTADO','PENSIONISTA'))
      AND (${input.q}='' OR strpos(lower(e.name),lower(${input.q}))>0 OR strpos(coalesce(e.registration,''),${input.q})>0)
      ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``} ${input.departmentId ? sql`AND v.snapshot->>'departmentId'=${input.departmentId}` : sql``}
      AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)}
    ORDER BY e.name,c.id`);
  const text = (value: unknown) => value == null ? "" : String(value);
   const metadata = await db.execute<{ id: string; employeeId: string; contractId: string | null; kind: string; data: Record<string, string> }>(sql`SELECT id,"employeeId","contractId",kind,data FROM ${functionalRecordsObservedAt(sql`${reference}`)} observed_metadata
    WHERE kind IN ('DADOS_ATUARIAIS','DEPENDENTE_ATUARIAL') AND status<>'CANCELADO' AND "startsAt"::date<=${reference}::date AND ("endsAt" IS NULL OR "endsAt"::date>=${reference}::date)
      AND "employeeId"=ANY(${sql.param([...new Set(result.rows.map(row => row.employeeId))])}::text[]) ORDER BY id`);
  const headers = ["Tipo de registro", "Referência", "Servidor ID", "Contrato ID", "Matrícula", "Categoria", "Nome", "CPF", "Nascimento", "Sexo", "Estado civil", "Admissão", "Regime", "Sistema previdenciário", "Cargo ID", "Lotação ID", "Salário / benefício BRL", "Competência contributiva", "Base contributiva BRL", "Contribuição pessoal BRL", "Contribuição patronal previdenciária BRL", "Dependente ID", "Pessoa dependente ID", "Parentesco", "Observação cadastral", "Demonstrativo-fonte"];
  headers.push("Ingresso contributivo", "Ingresso no serviço público", "Ingresso na carreira", "Invalidez reconhecida", "Início do benefício", "Espécie do benefício", "Pessoa instituidora ID", "Ato de concessão", "Elegível à pensão", "Fim da elegibilidade", "Comprovação / fundamento", "Registro complementar ID");
  const rows = result.rows.flatMap(row => {
    const identity = [reference, row.employeeId, row.id, row.registration];
    const principal = ["SERVIDOR", ...identity, row.category ?? "ATIVO", text(row.person?.fullName), text(row.person?.cpf), text(row.person?.birthDate), text(row.person?.gender), text(row.person?.maritalStatus), text(row.state.admittedAt), row.regime, row.scheme ?? "", text(row.state.roleId), text(row.state.departmentId), row.benefit ?? text(row.state.salary), row.competence ?? "", row.base ?? "", row.personal ?? "", row.employer ?? "", "", "", "", row.observed ?? "Sem fotografia pessoal na referência", row.statement ?? "Sem demonstrativo mensal fechado"];
    const observations = metadata.rows.filter(record => record.kind === "DADOS_ATUARIAIS" && record.contractId === row.id);
    if (observations.length > 1) throw new Error("Informações atuariais sobrepostas no vínculo; concilie as vigências.");
    const observation = observations[0];
    principal.push(...["contributionStartedAt", "publicServiceStartedAt", "careerStartedAt", "disability", "benefitStartedAt", "benefitType", "institutorPersonId", "actNumber"].map(key => observation?.data[key] ?? ""), "", "", observation ? `${observation.data.source}; ${observation.data.legalReference}` : "Sem informação complementar comprovada na referência", observation?.id ?? "");
    const dependents = (row.dependents ?? []).map(dependent => {
      const person = dependent.person as Record<string, unknown> | null | undefined;
      const observations = metadata.rows.filter(record => record.kind === "DEPENDENTE_ATUARIAL" && record.employeeId === row.employeeId && record.data.dependentId === dependent.id);
      if (observations.length > 1) throw new Error("Condição previdenciária do dependente sobreposta; concilie as vigências.");
      const observation = observations[0];
      return ["DEPENDENTE", ...identity, row.category ?? "ATIVO", text(person?.fullName ?? dependent.name), text(person?.cpf ?? dependent.cpf), text(person?.birthDate ?? dependent.birthDate), text(person?.gender), text(person?.maritalStatus), "", row.regime, row.scheme ?? "", "", "", "", "", "", "", "", text(dependent.id), text(dependent.personId), text(dependent.relationship), row.observed ?? "", "", "", "", "", observation?.data.disability ?? "", "", "", "", "", observation?.data.pensionEligible ?? "", observation?.data.eligibilityUntil ?? "", observation ? `${observation.data.source}; ${observation.data.legalReference}` : "Sem condição previdenciária comprovada na referência", observation?.id ?? ""];
    });
    return [principal, ...dependents];
  });
  const groups = new Map<string, typeof result.rows>();
  for (const row of result.rows) { const key = `${row.category ?? "ATIVO"}:${row.scheme ?? "SEM_SISTEMA"}:${row.competence ?? "SEM_COMPETENCIA"}`; groups.set(key, [...(groups.get(key) ?? []), row]); }
  for (const [group, entries] of groups) {
    const total = headers.map(() => "");
    total[0] = "TOTAL_CATEGORIA_SISTEMA"; total[1] = reference; total[5] = group;
    total[17] = entries[0].competence ?? "";
    total[6] = `${entries.length} vínculos; ${new Set(entries.map(row => row.employeeId)).size} titulares; ${entries.reduce((sum, row) => sum + (row.dependents?.length ?? 0), 0)} vínculos de dependência`;
    for (const [column, value] of [[16, (row: typeof entries[number]) => row.benefit ?? text(row.state.salary)], [18, (row: typeof entries[number]) => row.base], [19, (row: typeof entries[number]) => row.personal], [20, (row: typeof entries[number]) => row.employer]] as const) {
      total[column] = entries.reduce((sum, row) => sum.add(value(row) || 0), new Decimal(0)).toFixed(2);
    }
    total[24] = `${entries.filter(row => !row.person).length} vínculos sem fotografia pessoal; ${entries.filter(row => !row.statement).length} sem demonstrativo contributivo`;
    rows.push(total);
  }
  return { title: `Base atuarial interna — posição ${reference}; formato colunar de servidores e dependentes`, headers, rows };
}
