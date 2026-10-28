import { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activePortalEmployee, activePortalTotalsPolicy, portalEvents, portalFirst, portalRows } from "@/db/repositories/portal-servidor/records";
import { portalStatements } from "@/db/repositories/portal-servidor/payroll";
import { portalContracts } from "@/db/repositories/portal-servidor/contracts";
import { portalEmployeeProfile } from "@/db/repositories/portal-servidor/profile";
import { portalMovements, portalRights, type PortalLeave } from "@/db/repositories/portal-servidor/reports";
import type { AttendanceRecord } from "@/lib/contracts/personnel";
import { z } from "zod";
import { AccessError, type AppContext } from "@/lib/platform/tenant-context";
import { ownReleasedStatementIds } from "./payroll-publication";
import { attendanceTotalsPolicySchema, configuredAttendanceTotals } from "./attendance-totals";

export const personalReportKinds = ["FICHA_FINANCEIRA", "CONTRIBUICOES", "SALARIOS_CONTRIBUICAO", "PONTO", "FERIAS", "BANCO_HORAS", "LICENCA_PREMIO", "GOZOS_LICENCA_PREMIO", "HISTORICO_ATS", "AFASTAMENTOS", "CONSIGNACOES", "FICHA_REGISTRO", "ATOS", "PLANOS"] as const;
export const personalReportQuerySchema = z.object({ kind: z.enum(personalReportKinds), from: z.iso.date(), until: z.iso.date(), contractId: z.string().min(1).optional(), totalsPolicyId: z.string().optional(), format: z.enum(["PDF", "CSV", "XLSX"]).default("PDF") }).strict().refine(value => value.until >= value.from, "Período fora de ordem.").refine(value => !value.contractId || !["PONTO", "AFASTAMENTOS", "ATOS", "PLANOS"].includes(value.kind), "Este relatório usa o cadastro pessoal, sem filtro por contrato.");
type PersonalReport = { title: string; headers: string[]; rows: string[][] };
const civil = (value: Date | null | undefined) => value?.toISOString().slice(0, 10) || "";
const jsonObject = (value: JsonValue) => value && !Array.isArray(value) && typeof value === "object" ? value : {};

export async function buildOwnPersonalReport(context: AppContext, raw: unknown): Promise<PersonalReport> {
  const input = personalReportQuerySchema.parse(raw), employeeId = context.user.employeeId;
  const executor = context.database ?? db;
  if (!employeeId || !await activePortalEmployee(executor, employeeId)) throw new AccessError("Acesso funcional indisponível.", 403);
  if (input.contractId && !await portalFirst<{ id: string }>(executor, sql`SELECT id FROM "HrEmploymentContract" WHERE id=${input.contractId} AND "employeeId"=${employeeId} LIMIT 1`)) throw new AccessError("Contrato indisponível.", 404);
  const from = new Date(`${input.from}T00:00:00Z`), until = new Date(`${input.until}T23:59:59.999Z`);
  const contractWhere = sql`c."employeeId"=${employeeId} ${input.contractId ? sql`AND c.id=${input.contractId}` : sql``}`;
  if (["FICHA_FINANCEIRA", "CONTRIBUICOES", "SALARIOS_CONTRIBUICAO"].includes(input.kind)) {
    const ids = await ownReleasedStatementIds(executor, employeeId);
    const all = await portalStatements(executor, sql`s.id=ANY(${sql.param(ids)}::text[]) AND ${contractWhere} AND s."releaseAt"<=${new Date()} AND s."revokedAt" IS NULL`, sql`r."createdAt",s.id`);
    const rows = all.filter(statement => { const [month, year] = statement.run.payroll.competence.split("/").map(Number); const start = new Date(Date.UTC(year, month - 1, 1)), end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); return start <= until && end >= from; });
    const snapshotSchema = z.object({ contract: z.object({ registration: z.string() }), regime: z.object({ socialSecurityScheme: z.object({ code: z.string(), name: z.string(), regime: z.string() }).nullable() }), items: z.array(z.object({ code: z.string(), name: z.string(), type: z.string(), value: z.string() })), bases: z.record(z.string(), z.string()) });
    if (["CONTRIBUICOES", "SALARIOS_CONTRIBUICAO"].includes(input.kind)) {
      const reportRows = rows.map(statement => { const snapshot = snapshotSchema.parse(statement.snapshot), scheme = snapshot.regime.socialSecurityScheme; const employee = scheme ? snapshot.items.find(item => item.code === `PREVIDENCIA_${scheme.code}`)?.value || "0.00" : "0.00", fgts = snapshot.items.find(item => item.code === "FGTS")?.value || "0.00"; return [statement.run.payroll.competence, statement.run.payroll.type, snapshot.contract.registration, scheme?.name || "Não informado", scheme ? snapshot.bases[scheme.regime] || "0.00" : "", employee, statement.employer.sub(fgts).toFixed(2), statement.id]; });
      const annual = new Map<string, { labels: string[]; base: Decimal; employee: Decimal; employer: Decimal }>();
      for (const row of reportRows) {
        const labels = [row[0].split("/")[1], row[2], row[3]], key = JSON.stringify(labels);
        const total = annual.get(key) || { labels, base: new Decimal(0), employee: new Decimal(0), employer: new Decimal(0) };
        total.base = total.base.add(row[4] || "0"); total.employee = total.employee.add(row[5]); total.employer = total.employer.add(row[6]); annual.set(key, total);
      }
      for (const total of annual.values()) reportRows.push([`TOTAL_ANUAL/${total.labels[0]}`, "TOTAL", total.labels[1], total.labels[2], total.base.toFixed(2), total.employee.toFixed(2), total.employer.toFixed(2), ""]);
      return { title: input.kind === "SALARIOS_CONTRIBUICAO" ? "Salários de contribuição por previdência, vínculo e período — fontes publicadas" : "Contribuições previdenciárias por vínculo e competência — demonstrativos publicados", headers: ["Competência", "Tipo de folha", "Matrícula", "Previdência", "Base BRL", "Segurado BRL", "Patronal BRL", "Versão"], rows: reportRows };
    }
    const reportRows: string[][] = [];
    for (const statement of rows) {
      const snapshot = snapshotSchema.parse(statement.snapshot);
      for (const item of snapshot.items) reportRows.push([statement.run.payroll.competence, statement.run.payroll.type, snapshot.contract.registration, item.code, item.name, item.type, new Decimal(item.value).toFixed(2), statement.id]);
      reportRows.push([statement.run.payroll.competence, statement.run.payroll.type, snapshot.contract.registration, "LIQUIDO", "Total líquido do demonstrativo", "TOTAL", statement.net.toFixed(2), statement.id]);
    }
    reportRows.push(["PERIODO", "", "", "TOTAL_LIQUIDO", "Total líquido dos demonstrativos no filtro", "TOTAL", rows.reduce((sum, row) => sum.add(row.net), new Decimal(0)).toFixed(2), ""]);
    return { title: "Ficha financeira pessoal — valores publicados por período", headers: ["Competência", "Tipo de folha", "Matrícula", "Código", "Rubrica", "Natureza", "Valor BRL", "Versão"], rows: reportRows };
  }
  if (input.kind === "PONTO") {
    const rows = await portalRows<AttendanceRecord>(executor, sql`SELECT * FROM "AttendanceRecord" WHERE "employeeId"=${employeeId} AND date>=${from} AND date<=${until} ORDER BY date,id`);
    const totals = rows.reduce((sum, row) => ({ hours: sum.hours.add(String(row.hoursWorked)), extra: sum.extra.add(String(row.extraHours)), bank: sum.bank.add(String(row.bankHours)) }), { hours: new Decimal(0), extra: new Decimal(0), bank: new Decimal(0) });
    const configured: string[][] = [];
    if (input.totalsPolicyId) {
      const now = new Date(), rule = await activePortalTotalsPolicy(executor, input.totalsPolicyId, now);
      const policy = attendanceTotalsPolicySchema.parse(rule?.value);
      if (policy.employeeIds.length && !policy.employeeIds.includes(employeeId)) throw new AccessError("Totalizadores indisponíveis para o titular.", 403);
      const employee = await activePortalEmployee(executor, employeeId);
      if (!employee?.secretariatId || !await portalFirst<{ id: string }>(executor, sql`SELECT id FROM "BudgetUnit" WHERE id=${policy.budgetUnitId} AND "secretariatId"=${employee.secretariatId} LIMIT 1`)) throw new AccessError("Totalizadores fora da unidade funcional.", 403);
      configured.push(...configuredAttendanceTotals(rows, policy).map(total => ["TOTAL_CONFIGURADO", total.label, "", total.value, "", "", "", total.code]));
    }
    return { title: "Espelho de ponto pessoal — relatório integral do período", headers: ["Data", "Entrada", "Saída", "Horas trabalhadas / total configurado", "Horas extras", "Banco de horas", "Situação", "Registro"], rows: [...rows.map(row => [civil(row.date), row.entryTime?.toISOString() || "", row.exitTime?.toISOString() || "", String(row.hoursWorked), String(row.extraHours), String(row.bankHours), row.status, row.id]), ["TOTAL", "", "", totals.hours.toFixed(4), totals.extra.toFixed(4), totals.bank.toFixed(4), "", ""], ...configured] };
  }
  if (input.kind === "HISTORICO_ATS") {
    const movements = await portalMovements(executor, sql`${contractWhere} AND starts_with(e."sourceKey",'ATS:') AND e."startsAt"<=${until} AND (e."endsAt" IS NULL OR e."endsAt">=${from})`);
    const origins = await portalEvents(executor, sql`"eventType"='ATS_APURADO' AND "sourceKey"=ANY(${sql.param(movements.map(row => row.sourceKey))}::text[])`);
    const reversals = await portalEvents(executor, sql`"eventType"='ATS_ESTORNADO' AND "sourceKey"=ANY(${sql.param(movements.map(row => `ESTORNO:${row.sourceKey}`))}::text[])`);
    const memory = z.object({ assessment: z.object({ countedDays: z.number(), creditedDays: z.number(), excludedDays: z.number(), rate: z.string(), policy: z.object({ legalReference: z.string() }) }), creditIds: z.array(z.string()) });
    return { title: "Histórico pessoal do adicional por tempo de serviço — apuração e estornos de origem", headers: ["Matrícula", "Início", "Fim", "Tempo contado (dias)", "Tempo averbado (dias)", "Dias excluídos", "Percentual", "Valor apurado BRL", "Averbações de origem", "Fundamento", "Situação", "Movimento"], rows: movements.map(row => { const source = origins.find(origin => origin.sourceKey === row.sourceKey), parsed = memory.safeParse(source?.payload); if (!parsed.success) throw new Error("Apuração de ATS sem memória íntegra na origem."); const value = parsed.data; return [row.contract.registration, civil(row.startsAt), civil(row.endsAt), String(value.assessment.countedDays), String(value.assessment.creditedDays), String(value.assessment.excludedDays), value.assessment.rate, row.amount.toFixed(2), value.creditIds.join(" · "), value.assessment.policy.legalReference, reversals.some(reversal => reversal.sourceKey === `ESTORNO:${row.sourceKey}`) ? "ESTORNADA" : "APURADA", row.id]; }) };
  }
  if (input.kind === "GOZOS_LICENCA_PREMIO") {
    const entries = await portalRights(executor, sql`e.kind='LICENCA_PREMIO' AND ${contractWhere} AND e.quantity<0 AND e.details->>'kind'='GOZO'`, sql`e."periodStart",e.id`);
    const memory = z.object({ leaveId: z.string().nullable(), reason: z.string().optional() });
    const parsed = entries.map(entry => ({ entry, details: memory.parse(entry.details) }));
    const leaves = await portalRows<PortalLeave>(executor, sql`SELECT * FROM "Leave" WHERE "employeeId"=${employeeId} AND id=ANY(${sql.param(parsed.flatMap(row => row.details.leaveId ? [row.details.leaveId] : []))}::text[]) AND "startDate"<=${until} AND "endDate">=${from}`);
    return { title: "Licença-prêmio — gozos vinculados ao afastamento de origem", headers: ["Matrícula", "Aquisitivo início", "Aquisitivo fim", "Gozo início", "Gozo fim", "Dias reservados", "Situação do afastamento", "Situação temporal", "Referência RH"], rows: parsed.flatMap(({ entry, details }) => { const leave = leaves.find(row => row.id === details.leaveId); if (!leave) return []; const state = leave.status !== "Ativa" ? leave.status : leave.startDate > new Date() ? "PROGRAMADO" : leave.endDate < new Date() ? "PERIODO_DECORRIDO" : "EM_CURSO"; return [[entry.contract.registration, civil(entry.periodStart), civil(entry.periodEnd), civil(leave.startDate), civil(leave.endDate), entry.quantity.abs().toString(), leave.status, state, leave.id]]; }) };
  }
  if (["FERIAS", "BANCO_HORAS", "LICENCA_PREMIO"].includes(input.kind)) {
    const rows = await portalRights(executor, sql`e.kind=${input.kind} AND ${contractWhere} AND e."periodStart"<=${until} AND e."periodEnd">=${from}`);
    const reportRows = rows.map(row => { const details = jsonObject(row.details); return [row.contract.registration, civil(row.periodStart), civil(row.periodEnd), row.quantity.toString(), row.amount.toFixed(2), String(details.operation || details.kind || details.reason || "Registro de origem"), String(details.scope || ""), row.id]; });
    const balances = new Map<string, { labels: string[]; quantity: Decimal }>();
    for (const row of rows) { const labels = [row.contract.registration, civil(row.periodStart), civil(row.periodEnd), String(jsonObject(row.details).scope || "")]; const key = JSON.stringify([row.contractId, ...labels.slice(1)]); const balance = balances.get(key) || { labels, quantity: new Decimal(0) }; balance.quantity = balance.quantity.add(row.quantity); balances.set(key, balance); }
    for (const { labels: [registration, start, end, scope], quantity } of balances.values()) reportRows.push([registration, start, end, quantity.toString(), "", "Saldo do aquisitivo/recorte", scope, ""]);
    return { title: `${input.kind === "FERIAS" ? "Direitos e saldos de férias" : input.kind === "BANCO_HORAS" ? "Compensação e banco de horas" : "Licença-prêmio: aquisitivos e operações"} — livro de origem`, headers: ["Matrícula", "Início", "Fim", "Quantidade", "Valor BRL", "Operação / fundamento", "Escopo de origem", "Registro"], rows: reportRows };
  }
  if (input.kind === "AFASTAMENTOS") {
    const leaves = await portalRows<PortalLeave>(executor, sql`SELECT * FROM "Leave" WHERE "employeeId"=${employeeId} AND "startDate"<=${until} AND "endDate">=${from} ORDER BY "startDate",id`);
    const absences = await portalRows<AttendanceRecord>(executor, sql`SELECT * FROM "AttendanceRecord" WHERE "employeeId"=${employeeId} AND status='Falta' AND date>=${from} AND date<=${until} ORDER BY date,id`);
    return { title: "Afastamentos e faltas pessoais", headers: ["Categoria", "Início", "Fim", "Motivo / situação", "Registro"], rows: [...leaves.map(row => ["AFASTAMENTO", civil(row.startDate), civil(row.endDate), `${row.type} · ${row.status}`, row.id]), ...absences.map(row => ["FALTA", civil(row.date), civil(row.date), row.status, row.id])] };
  }
  if (input.kind === "CONSIGNACOES") {
    const rows = await portalRows<{ id: string; registration: string; number: string; supplierId: string; competenceAt: Date; sequence: number; amount: string }>(executor, sql`SELECT i.*,c.registration,a.number,a."supplierId" FROM "HrConsignmentInstallment" i JOIN "HrConsignmentAgreement" a ON a.id=i."agreementId" JOIN "HrEmploymentContract" c ON c.id=a."contractId" WHERE ${contractWhere} AND i."competenceAt">=${from} AND i."competenceAt"<=${until} ORDER BY i."competenceAt",i.id`);
    const entries = await portalRows<{ installmentId: string; kind: string }>(executor, sql`SELECT "installmentId",kind FROM "HrConsignmentEntry" WHERE "installmentId"=ANY(${sql.param(rows.map(row => row.id))}::text[])`);
    return { title: "Empréstimos e consignações pessoais — parcelas e operações de origem", headers: ["Matrícula", "Contrato", "Consignatária ID", "Competência", "Parcela", "Valor BRL", "Operações registradas", "Referência"], rows: rows.map(row => [row.registration, row.number, row.supplierId, civil(row.competenceAt), String(row.sequence), new Decimal(row.amount).toFixed(2), entries.filter(entry => entry.installmentId === row.id).map(entry => entry.kind).join(" · "), row.id]) };
  }
  if (input.kind === "PLANOS") {
    const rows = await portalRows<{ id: string; competence: string; kind: string; amount: string; planName: string; dependentName: string | null }>(executor, sql`SELECT e.id,e.competence,e.kind,e.amount,c.name AS "planName",d.name AS "dependentName" FROM "SstBenefitEntry" e JOIN "SstBenefitBeneficiary" b ON b.id=e."beneficiaryId" JOIN "PayrollBenefit" pb ON pb.id=b."payrollBenefitId" JOIN "SstHealthPlan" p ON p.id=b."planId" JOIN "BenefitConfig" c ON c.id=p."benefitConfigId" LEFT JOIN "Dependent" d ON d.id=b."dependentId" WHERE pb."employeeId"=${employeeId} ORDER BY e.competence,e.id`);
    const filtered = rows.filter(row => { const [month, year] = row.competence.split("/").map(Number); const date = new Date(Date.UTC(year, month - 1, 1)); return date <= until && new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)) >= from; });
    return { title: "Mensalidades, despesas e devoluções dos planos de saúde próprios", headers: ["Plano", "Beneficiário", "Competência", "Natureza", "Valor BRL", "Registro"], rows: filtered.map(row => [row.planName, row.dependentName || "Titular", row.competence, row.kind, new Decimal(row.amount).toFixed(2), row.id]) };
  }
  if (input.kind === "ATOS") {
    const rows = await portalRows<{ id: string; date: Date; type: string; actNumber: string | null }>(executor, sql`SELECT id,date,type,"actNumber" FROM "PersonnelAct" WHERE "employeeId"=${employeeId} AND date>=${from} AND date<=${until} ORDER BY date,id`);
    return { title: "Atos legais do servidor", headers: ["Data", "Tipo", "Número", "Registro"], rows: rows.map(row => [civil(row.date), row.type, row.actNumber || "", row.id]) };
  }
  const employee = await portalEmployeeProfile(executor, employeeId);
  if (!employee) throw new Error("Registro não encontrado.");
  const contracts = await portalContracts(executor, sql`"employeeId"=${employeeId} ${input.contractId ? sql`AND id=${input.contractId}` : sql``}`);
  const rows: string[][] = [["IDENTIFICACAO", "", "Nome", employee.name], ["IDENTIFICACAO", "", "Matrícula", employee.registration || ""], ["VINCULO_ATUAL", "", "Cargo", employee.role?.name || ""], ["VINCULO_ATUAL", "", "Lotação", employee.department?.name || employee.secretariat?.name || ""]];
  if (employee.person) for (const [field, label] of [["cpf", "CPF"], ["rg", "RG"], ["motherName", "Filiação materna"], ["fatherName", "Filiação paterna"], ["educationLevel", "Grau de instrução"], ["maritalStatus", "Estado civil"], ["email", "E-mail cadastral"], ["phonePrimary", "Telefone"]] as const) rows.push(["CADASTRO_UNICO", "", label, employee.person[field] || ""]);
  if (employee.person) for (const address of employee.person.addresses) rows.push(["ENDERECO", address.id, address.addressType || "Endereço cadastrado", [address.streetName, address.number, address.complement, address.zipCode, address.referencePoint].filter(Boolean).join(" · ")]);
  for (const dependent of employee.dependents) rows.push(["DEPENDENTE", dependent.id, dependent.relationship, `${dependent.name} · nascimento ${civil(dependent.birthDate)}`]);
  for (const contract of contracts) { rows.push(["CONTRATO_ATUAL", contract.id, "Matrícula / vigência / situação", `${contract.registration} · ${civil(contract.admittedAt)} a ${civil(contract.endsAt)} · ${contract.status}`]); rows.push(["CONTRATO_ATUAL", contract.id, "Jornada / local", `${contract.monthlyHours} horas mensais · ${contract.workLocation}`]); for (const revision of contract.revisions.filter(revision => revision.effectiveFrom <= until).sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime() || a.version - b.version)) { rows.push(["REVISAO", contract.id, `Versão ${revision.version}`, `${civil(revision.effectiveFrom)} · ${revision.reason}`]); rows.push(["REVISAO_ORIGEM", revision.id, "Dados históricos preservados (JSON)", JSON.stringify(revision.snapshot)]); } }
  const recertifications = await portalEvents(executor, sql`"eventType"='RECADASTRAMENTO_DECIDIDO' AND status='PROCESSADO' AND payload->>'employeeId'=${employeeId} AND "createdAt"<=${until}`, sql`"createdAt",id`);
  for (const event of recertifications) { const memory = z.object({ status: z.string(), appliedDetails: z.object({ previousEmployment: z.array(z.object({ employer: z.string(), role: z.string(), startsAt: z.string(), endsAt: z.string(), evidenceReference: z.string() })) }).nullable().optional() }).safeParse(event.payload); if (memory.success && memory.data.status === "DEFERIDA") for (const job of memory.data.appliedDetails?.previousEmployment || []) rows.push(["EMPREGO_ANTERIOR_DECLARADO", event.id, `${job.employer} · ${job.role}`, `${job.startsAt} a ${job.endsAt} · ${job.evidenceReference} · sem averbação automática de tempo`]); }
  return { title: "Ficha de registro funcional pessoal — cadastro e revisões de origem", headers: ["Grupo", "Referência", "Campo", "Valor"], rows };
}
