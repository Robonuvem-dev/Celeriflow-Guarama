import { sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { reportCompleteHistoryPredicate, reportContractPredicate, reportEmployeePredicate, reportPayrollAllocationSource, reportPayrollPredicate, reportRubricPredicate } from "./report-filters";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";

export const personalHistoryReportKinds = ["FICHA_CADASTRAL_COMPLETA", "FICHA_CADASTRAL_VALIDACAO", "CADASTRO_BASICO_COMPLETO", "ALTERACOES_CADASTRAIS", "COMPARACAO_CADASTRAL", "COMPARACAO_CADASTRAL_FINANCEIRA", "HISTORICO_SALARIAL_COMPLETO", "HISTORICO_CARGOS_COMPLETO", "HISTORICO_LOCAIS_COMPLETO", "HISTORICO_RATEIOS_COMPLETO"] as const;
const display = (value: unknown): string => value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
const fieldLabels: Record<string, string> = { employee: "Dados funcionais", person: "Identificação pessoal", addresses: "Endereços", documents: "Documentos", dependents: "Dependentes", functionalIdentification: "Identificação trabalhista", fullName: "Nome completo", name: "Nome", socialName: "Nome social", cpf: "CPF", rg: "RG", rgIssuer: "Órgão expedidor", birthDate: "Nascimento", gender: "Sexo", raceColor: "Cor/raça", nationality: "Nacionalidade", birthPlace: "Naturalidade", maritalStatus: "Estado civil", profession: "Profissão", educationLevel: "Escolaridade", motherName: "Nome da mãe", fatherName: "Nome do pai", phonePrimary: "Telefone principal", phoneSecondary: "Telefone secundário", email: "E-mail", emailSecondary: "E-mail secundário", registration: "Matrícula", salaryBase: "Referência salarial", contractedHours: "Jornada mensal", phone: "Telefone", streetName: "Logradouro", number: "Número", zipCode: "CEP", complement: "Complemento", neighborhoodId: "Bairro ID", documentType: "Tipo de documento", title: "Documento", relationship: "Parentesco", irrfDependent: "Dependente de IRRF", familyWage: "Salário-família", pisPasep: "PIS/PASEP/NIT", ctps: "CTPS", ctpsSeries: "Série CTPS", ctpsState: "UF CTPS", data: "Informações", legalReference: "Fundamento", status: "Situação", createdAt: "Registrado em", updatedAt: "Atualizado em", startsAt: "Vigência inicial", endsAt: "Vigência final", roleId: "Cargo ID", departmentId: "Lotação ID", unitId: "Unidade ID", personId: "Pessoa ID", employeeId: "Servidor ID", id: "Identificador" };
Object.assign(fieldLabels, { historicalOpening: "Abertura histórica", source: "Fonte documental", reason: "Fundamento", recordedAt: "Registrado em", actorId: "Responsável ID", sectionsNotDocumented: "Seções não documentadas", blankFields: "Campos não documentados", neighborhood: "Bairro", city: "Município", state: "UF" });
const label = (path: string) => path.split(".").map(part => /^\d+$/.test(part) ? String(Number(part) + 1) : fieldLabels[part] ?? part).join(" / ");
function flatten(value: unknown, prefix = ""): Map<string, string> {
  if (value === null || typeof value !== "object") return new Map([[prefix, display(value)]]);
  return new Map(Object.entries(value).flatMap(([key, child]) => [...flatten(child, prefix ? `${prefix}.${key}` : key)]));
}
export async function buildPersonalHistoryReport(db: DatabaseExecutor, input: OperationalReportInput, budgetUnitIds?: readonly string[], payrollScope?: SQL): Promise<PersonnelReport> {
  const reference = input.referenceDate ?? new Date().toISOString().slice(0, 10), from = input.from ?? `${reference.slice(0, 4)}-01-01`, until = input.until ?? reference;
  if (from > until) throw new Error("Período inválido.");
  const holders = await db.execute<{ id: string; name: string; registration: string | null; personId: string | null }>(sql`SELECT e.id,e.name,e.registration,e."personId" FROM "Employee" e WHERE (${input.q}='' OR strpos(lower(e.name),lower(${input.q}))>0 OR strpos(coalesce(e.registration,''),${input.q})>0)
    AND ${reportEmployeePredicate(input, sql`e.id`, sql`${reference}`)} ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``}
    AND ${reportCompleteHistoryPredicate(input, sql`e.id`, sql`${[until, reference, input.compareDate ?? reference].sort().at(-1)!}`)}
    AND ${personnelBudgetEmployeeWhere(sql`e.id`, budgetUnitIds)} ORDER BY e.name,e.id`);
  const ids = holders.rows.map(row => row.id);
  if (input.kind.startsWith("HISTORICO_")) {
    if (input.kind === "HISTORICO_RATEIOS_COMPLETO") {
      const rates = await db.execute<{ employeeId: string; date: string; operation: string; beforeValue: unknown; afterValue: unknown; actorId: string }>(sql`SELECT c."employeeId",h."createdAt"::text date,h.operation,h."beforeValue",h."afterValue",h."actorId" FROM "HrReferenceRevision" h JOIN "HrEmploymentContract" c ON c.id=coalesce(h."afterValue"->'details'->>'contractId',h."beforeValue"->'details'->>'contractId') WHERE h.kind='RATEIO_FOLHA' AND c."employeeId"=ANY(${sql.param(ids)}::text[]) AND h."createdAt"::date BETWEEN ${from}::date AND ${until}::date ORDER BY c."employeeId",h."createdAt",h.sequence`);
      return { title: "Histórico imutável de alterações de rateio — versões observadas", headers: ["Servidor", "Matrícula", "Registro", "Operação", "Campo", "Anterior", "Novo", "Autor"], rows: rates.rows.flatMap(row => { const holder = holders.rows.find(holder => holder.id === row.employeeId)!, before = flatten(row.beforeValue), after = flatten(row.afterValue); return [...new Set([...before.keys(), ...after.keys()])].filter(key => before.get(key) !== after.get(key)).map(key => [holder.name, holder.registration ?? "", row.date, row.operation, label(key), before.get(key) ?? "", after.get(key) ?? "", row.actorId]); }) };
    }
    const revisions = await db.execute<{ employeeId: string; registration: string; date: string; until: string | null; previous: Record<string, unknown> | null; snapshot: Record<string, unknown>; reason: string; actor: string }>(sql`
      WITH revisions AS (SELECT c."employeeId",c.registration,r."effectiveFrom",r.version,r.snapshot,r.reason,r."actorId" actor,
        lag(r.snapshot) OVER (PARTITION BY c.id ORDER BY r."effectiveFrom",r.version) previous,
        lead(r."effectiveFrom") OVER (PARTITION BY c.id ORDER BY r."effectiveFrom",r.version) next
        FROM "HrEmploymentContract" c JOIN "HrEmploymentRevision" r ON r."contractId"=c.id WHERE c."employeeId"=ANY(${sql.param(ids)}::text[]))
      SELECT "employeeId",snapshot->>'registration' registration,to_char("effectiveFrom",'YYYY-MM-DD') date,to_char(next-interval '1 day','YYYY-MM-DD') until,previous,snapshot,reason,actor FROM revisions WHERE "effectiveFrom"::date<=${until}::date AND (next IS NULL OR next::date>=${from}::date) AND ${reportContractPredicate(input, sql`snapshot`, sql`"effectiveFrom"`)} ORDER BY "employeeId","effectiveFrom",version`);
    const field = input.kind === "HISTORICO_SALARIAL_COMPLETO" ? "salary" : input.kind === "HISTORICO_CARGOS_COMPLETO" ? "roleId" : "workLocation";
    const historyRows = revisions.rows.filter(row => !row.previous || display(row.previous[field]) !== display(row.snapshot[field])).map(row => {
      const old = row.previous?.[field], value = row.snapshot[field], holder = holders.rows.find(holder => holder.id === row.employeeId)!;
      const percentage = field === "salary" && Number(old) !== 0 && old != null ? ((Number(value) - Number(old)) / Number(old) * 100).toFixed(4) : "";
      return [holder.name, row.registration, row.date, row.until ?? "", field, display(old), display(value), percentage, row.reason, row.actor];
    });
    if (input.kind === "HISTORICO_CARGOS_COMPLETO") {
      const appointments = await db.execute<{ employeeId: string; registration: string; start: string; end: string | null; returnDate: string | null; sourceRole: string | null; returnRole: string | null; data: Record<string, string>; actor: string }>(sql`
        SELECT c."employeeId",opening.snapshot->>'registration' registration,f."startsAt"::date::text start,f."endsAt"::date::text "end",(f."endsAt"::date+1)::text "returnDate",opening.snapshot->>'roleId' "sourceRole",restored.snapshot->>'roleId' "returnRole",f.data,f."actorId" actor
        FROM "HrFunctionalRecord" f JOIN "HrEmploymentContract" c ON c.id=f."contractId"
        JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=c.id AND "effectiveFrom"::date<=f."startsAt"::date ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) opening ON true
        LEFT JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=c.id AND "effectiveFrom"::date<=f."endsAt"::date+1 ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) restored ON true
        WHERE f.kind='COMISSAO' AND f.status<>'CANCELADO' AND c."employeeId"=ANY(${sql.param(ids)}::text[])
          AND f."startsAt"::date<=${until}::date AND (f."endsAt" IS NULL OR f."endsAt"::date+1>=${from}::date)
          AND ${reportContractPredicate(input, sql`opening.snapshot`, sql`f."startsAt"::date`)} ORDER BY f."startsAt",f.id`);
      for (const appointment of appointments.rows) {
        const holder = holders.rows.find(holder => holder.id === appointment.employeeId)!;
        if (appointment.start >= from) historyRows.push([holder.name, appointment.registration, appointment.start, appointment.end ?? "", appointment.data.appointment === "ELETIVO" ? "Exercício eletivo" : "Nomeação comissionada", appointment.sourceRole ?? "", appointment.data.roleId, "", `${appointment.data.legalReference}; opção ${appointment.data.payOption}; remuneração de exercício ${appointment.data.salary}`, appointment.actor]);
        if (appointment.returnDate && appointment.returnDate >= from && appointment.returnDate <= until) historyRows.push([holder.name, appointment.registration, appointment.returnDate, "", "Retorno por encerramento da comissão / exercício eletivo", appointment.data.roleId, appointment.returnRole ?? "Origem sem revisão documentada", "", appointment.data.legalReference, appointment.actor]);
      }
    }
    historyRows.sort((a, b) => a[0].localeCompare(b[0], "pt-BR") || a[1].localeCompare(b[1], "pt-BR", { numeric: true }) || a[2].localeCompare(b[2]) || a[4].localeCompare(b[4]));
    return { title: input.kind === "HISTORICO_SALARIAL_COMPLETO" ? "Histórico salarial por vigência" : input.kind === "HISTORICO_CARGOS_COMPLETO" ? "Histórico de cargos, nomeações, exercício eletivo e retornos" : "Histórico dos locais de trabalho", headers: ["Servidor", "Matrícula contratual", "Início", "Fim", "Campo / movimento", "Anterior", "Novo", "Variação %", "Ato / motivo", "Autor"], rows: historyRows };
  }
  if (input.kind === "ALTERACOES_CADASTRAIS") {
    const revisions = await db.execute<{ employeeId: string; date: string; previous: unknown; snapshot: unknown; actorId: string; reason: string }>(sql`
      WITH history AS (SELECT *,lag(snapshot) OVER (PARTITION BY "employeeId" ORDER BY "effectiveFrom",id) previous FROM "HrPersonalRevision" WHERE "employeeId"=ANY(${sql.param(ids)}::text[]))
      SELECT "employeeId","effectiveFrom"::text date,previous,snapshot,"actorId",reason FROM history WHERE "effectiveFrom"::date BETWEEN ${from}::date AND ${until}::date ORDER BY "employeeId","effectiveFrom",id`);
    return { title: "Alterações cadastrais — dados observados desde a abertura do histórico", headers: ["Servidor", "Matrícula", "Registro", "Campo", "Anterior", "Novo", "Autor", "Motivo"], rows: revisions.rows.flatMap(revision => {
      const holder = holders.rows.find(row => row.id === revision.employeeId)!, before = flatten(revision.previous), after = flatten(revision.snapshot);
      return [...new Set([...before.keys(), ...after.keys()])].filter(key => before.get(key) !== after.get(key) && !key.endsWith(".updatedAt")).map(key => [holder.name, holder.registration ?? "", revision.date, label(key), revision.previous == null ? "Sem fotografia anterior" : before.get(key) ?? "", after.get(key) ?? "", revision.actorId, revision.reason]);
    }) };
  }
  if (input.kind === "COMPARACAO_CADASTRAL" || input.kind === "COMPARACAO_CADASTRAL_FINANCEIRA") {
    if (!input.compareDate) throw new Error("Informe a segunda referência para comparação.");
    const states = await db.execute<{ employeeId: string; reference: string; snapshot: unknown | null }>(sql`SELECT e.id "employeeId",dates.reference::text reference,r.snapshot FROM "Employee" e CROSS JOIN (VALUES (${reference}::date),(${input.compareDate}::date)) dates(reference)
      LEFT JOIN LATERAL (SELECT snapshot FROM "HrPersonalRevision" WHERE "employeeId"=e.id AND "effectiveFrom"<dates.reference+interval '1 day' ORDER BY "effectiveFrom" DESC,id DESC LIMIT 1) r ON true WHERE e.id=ANY(${sql.param(ids)}::text[])`);
    const personalRows = holders.rows.flatMap(holder => {
      const a = states.rows.find(row => row.employeeId === holder.id && row.reference.slice(0, 10) === reference)?.snapshot;
      const b = states.rows.find(row => row.employeeId === holder.id && row.reference.slice(0, 10) === input.compareDate)?.snapshot;
      if (!a || !b) return [[holder.name, holder.registration ?? "", "Disponibilidade histórica", a ? "Fotografia disponível" : "Sem fotografia na referência", b ? "Fotografia disponível" : "Sem fotografia na referência"]];
      const before = flatten(a), after = flatten(b);
      return [...new Set([...before.keys(), ...after.keys()])].filter(key => before.get(key) !== after.get(key)).map(key => [holder.name, holder.registration ?? "", label(key), before.get(key) ?? "", after.get(key) ?? ""]);
    });
    const financialRows: string[][] = [];
    if (input.kind === "COMPARACAO_CADASTRAL_FINANCEIRA") {
      const values = await db.execute<{ employeeId: string; registration: string; type: string; competence: string; code: string; amount: string }>(sql`SELECT c."employeeId",s.snapshot->'contract'->>'registration' registration,"Payroll".type,"Payroll".competence,item->>'code' code,sum((item->>'value')::numeric)::text amount FROM "HrPayrollStatement" s JOIN "HrEmploymentContract" c ON c.id=s."contractId" JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" ON "Payroll".id=r."payrollId" CROSS JOIN LATERAL jsonb_array_elements(s.snapshot->'items') item WHERE c."employeeId"=ANY(${sql.param(ids)}::text[]) AND r.mode='OFICIAL' AND r.status='FECHADA' AND ${payrollScope ?? sql`true`} AND ${reportContractPredicate(input, sql`s.snapshot->'contract'`, sql`to_date("Payroll".competence,'MM/YYYY')`, reportPayrollAllocationSource(sql`r.id`, sql`r.snapshot`))} AND ${reportPayrollPredicate(input, sql`"Payroll".competence`, sql`"Payroll".type`)} AND ${reportRubricPredicate(input, sql`item->>'code'`)} AND "Payroll".competence IN (to_char(${reference}::date,'MM/YYYY'),to_char(${input.compareDate}::date,'MM/YYYY')) GROUP BY c."employeeId",s.snapshot->'contract'->>'registration',"Payroll".type,"Payroll".competence,item->>'code' ORDER BY c."employeeId",registration,"Payroll".type,code`);
      const first = `${reference.slice(5, 7)}/${reference.slice(0, 4)}`, second = `${input.compareDate.slice(5, 7)}/${input.compareDate.slice(0, 4)}`;
      const keys = [...new Set(values.rows.map(row => `${row.employeeId}|${row.registration}|${row.type}|${row.code}`))];
      for (const key of keys) {
        const group = values.rows.filter(row => `${row.employeeId}|${row.registration}|${row.type}|${row.code}` === key), source = group[0];
        const before = group.find(row => row.competence === first), after = group.find(row => row.competence === second);
        const holder = holders.rows.find(row => row.id === source.employeeId)!;
        if (before?.amount !== after?.amount) financialRows.push([holder.name, source.registration, `Financeiro / ${source.type} / ${source.code}`, before?.amount ?? "Sem demonstrativo / rubrica", after?.amount ?? "Sem demonstrativo / rubrica"]);
      }
      for (const holder of holders.rows) if (!values.rows.some(row => row.employeeId === holder.id)) financialRows.push([holder.name, holder.registration ?? "", "Disponibilidade financeira", "Sem demonstrativo fechado na referência", "Sem demonstrativo fechado na referência"]);
    }
    return { title: input.kind === "COMPARACAO_CADASTRAL_FINANCEIRA" ? "Comparação cadastral e financeira mensal entre referências" : "Comparação cadastral entre referências", headers: ["Servidor", "Matrícula", "Seção / campo", reference, input.compareDate], rows: [...personalRows, ...financialRows] };
  }
  const snapshots = await db.execute<{ employeeId: string; snapshot: Record<string, unknown> | null; observed: string | null }>(sql`
    SELECT e.id "employeeId",r.snapshot,r."effectiveFrom"::text observed FROM "Employee" e LEFT JOIN LATERAL
      (SELECT snapshot,"effectiveFrom" FROM "HrPersonalRevision" WHERE "employeeId"=e.id AND "effectiveFrom"<${reference}::date+interval '1 day' ORDER BY "effectiveFrom" DESC,id DESC LIMIT 1) r ON true WHERE e.id=ANY(${sql.param(ids)}::text[])`);
  const complete = input.kind === "FICHA_CADASTRAL_COMPLETA" || input.kind === "FICHA_CADASTRAL_VALIDACAO";
  const contracts = complete ? await db.execute<{ employeeId: string; snapshot: Record<string, unknown> }>(sql`SELECT c."employeeId",v.snapshot FROM "HrEmploymentContract" c JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=c.id AND "effectiveFrom"::date<=${reference}::date ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) v ON true WHERE c."employeeId"=ANY(${sql.param(ids)}::text[]) AND ${reportContractPredicate(input, sql`v.snapshot`, sql`${reference}`)} ORDER BY c."employeeId",c.registration,c.id`) : { rows: [] };
  const education = complete ? await db.execute<{ employeeId: string; record: Record<string, unknown>; observed: string }>(sql`WITH versions AS (SELECT DISTINCT ON ("referenceId") "referenceId","afterValue" record,"createdAt" FROM "HrReferenceRevision" WHERE kind='GRADUACAO_SERVIDOR' AND "createdAt"<${reference}::date+interval '1 day' ORDER BY "referenceId","createdAt" DESC,sequence DESC) SELECT record->'details'->>'employeeId' "employeeId",record,"createdAt"::text observed FROM versions WHERE record->'details'->>'employeeId'=ANY(${sql.param(ids)}::text[]) AND record->'details'->>'from'<=${reference} ORDER BY "employeeId","referenceId"`) : { rows: [] };
  return { title: input.kind === "FICHA_CADASTRAL_VALIDACAO" ? `Ficha cadastral para conferência — ${reference}; responsável: ____________________; assinatura: ____________________` : `Ficha cadastral completa — ${reference}`, ...(complete ? { print: { kind: "personnel-card" as const } } : {}), headers: ["Servidor", "Matrícula", "Seção / campo", "Conteúdo", "Referência", "Data de observação"], rows: holders.rows.flatMap(holder => {
    const row = snapshots.rows.find(row => row.employeeId === holder.id);
    if (!row?.snapshot) return [[holder.name, holder.registration ?? "", "Histórico cadastral", "Sem fotografia na referência. Registre uma abertura histórica por fonte documental em Operações → Contratos ou salve o cadastro para observar a posição atual.", reference, ""]];
    const personal = [...flatten(row.snapshot)].map(([key, value]) => [holder.name, holder.registration ?? "", label(key), value, reference, row.observed ?? ""]);
    const employment = contracts.rows.filter(contract => contract.employeeId === holder.id).flatMap(contract => [...flatten(contract.snapshot)].map(([key, value]) => [holder.name, holder.registration ?? "", `Vínculo ${display(contract.snapshot.registration)} / ${label(key)}`, value, reference, "Revisão contratual na referência"]));
    const qualification = education.rows.filter(record => record.employeeId === holder.id).flatMap(record => [...flatten(record.record)].map(([key, value]) => [holder.name, holder.registration ?? "", `Formação / ${label(key)}`, value, reference, record.observed]));
    if (complete && !qualification.length) qualification.push([holder.name, holder.registration ?? "", "Formação / Disponibilidade documental", "Sem formação observada na referência", reference, ""]);
    return [...personal, ...employment, ...qualification];
  }) };
}
