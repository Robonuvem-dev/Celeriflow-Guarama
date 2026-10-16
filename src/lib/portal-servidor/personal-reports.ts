import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AccessError, type AppContext } from "@/lib/platform/tenant-context";
import { ownReleasedStatementIds } from "./payroll-publication";
import { attendanceTotalsPolicySchema, configuredAttendanceTotals } from "./attendance-totals";

export const personalReportKinds = ["FICHA_FINANCEIRA", "CONTRIBUICOES", "SALARIOS_CONTRIBUICAO", "PONTO", "FERIAS", "BANCO_HORAS", "LICENCA_PREMIO", "GOZOS_LICENCA_PREMIO", "HISTORICO_ATS", "AFASTAMENTOS", "CONSIGNACOES", "FICHA_REGISTRO", "ATOS", "PLANOS"] as const;
export const personalReportQuerySchema = z.object({ kind: z.enum(personalReportKinds), from: z.iso.date(), until: z.iso.date(), contractId: z.string().min(1).optional(), totalsPolicyId: z.string().optional(), format: z.enum(["PDF", "CSV", "XLSX"]).default("PDF") }).strict().refine(value => value.until >= value.from, "Período fora de ordem.").refine(value => !value.contractId || !["PONTO", "AFASTAMENTOS", "ATOS", "PLANOS"].includes(value.kind), "Este relatório usa o cadastro pessoal, sem filtro por contrato.");
type PersonalReport = { title: string; headers: string[]; rows: string[][] };
const civil = (value: Date | null | undefined) => value?.toISOString().slice(0, 10) || "";
const jsonObject = (value: Prisma.JsonValue) => value && !Array.isArray(value) && typeof value === "object" ? value : {};

export async function buildOwnPersonalReport(context: AppContext, raw: unknown): Promise<PersonalReport> {
  const input = personalReportQuerySchema.parse(raw), employeeId = context.user.employeeId;
  if (!employeeId || !await context.prisma.employee.findFirst({ where: { id: employeeId, isActive: true }, select: { id: true } })) throw new AccessError("Acesso funcional indisponível.", 403);
  if (input.contractId && !await context.prisma.hrEmploymentContract.findFirst({ where: { id: input.contractId, employeeId } })) throw new AccessError("Contrato indisponível.", 404);
  const from = new Date(`${input.from}T00:00:00Z`), until = new Date(`${input.until}T23:59:59.999Z`);
  const contractWhere = { employeeId, ...(input.contractId ? { id: input.contractId } : {}) };
  if (["FICHA_FINANCEIRA", "CONTRIBUICOES", "SALARIOS_CONTRIBUICAO"].includes(input.kind)) {
    const ids = await ownReleasedStatementIds(context.prisma, employeeId);
    const all = await context.prisma.hrPayrollStatement.findMany({ where: { id: { in: ids }, contract: contractWhere, releaseAt: { lte: new Date() }, revokedAt: null }, include: { run: { include: { payroll: true } } }, orderBy: [{ run: { createdAt: "asc" } }, { id: "asc" }] });
    const rows = all.filter(statement => { const [month, year] = statement.run.payroll.competence.split("/").map(Number); const start = new Date(Date.UTC(year, month - 1, 1)), end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); return start <= until && end >= from; });
    const snapshotSchema = z.object({ contract: z.object({ registration: z.string() }), regime: z.object({ socialSecurityScheme: z.object({ code: z.string(), name: z.string(), regime: z.string() }).nullable() }), items: z.array(z.object({ code: z.string(), name: z.string(), type: z.string(), value: z.string() })), bases: z.record(z.string(), z.string()) });
    if (["CONTRIBUICOES", "SALARIOS_CONTRIBUICAO"].includes(input.kind)) {
      const reportRows = rows.map(statement => { const snapshot = snapshotSchema.parse(statement.snapshot), scheme = snapshot.regime.socialSecurityScheme; const employee = scheme ? snapshot.items.find(item => item.code === `PREVIDENCIA_${scheme.code}`)?.value || "0.00" : "0.00", fgts = snapshot.items.find(item => item.code === "FGTS")?.value || "0.00"; return [statement.run.payroll.competence, statement.run.payroll.type, snapshot.contract.registration, scheme?.name || "Não informado", scheme ? snapshot.bases[scheme.regime] || "0.00" : "", employee, statement.employer.sub(fgts).toFixed(2), statement.id]; });
      const annual = new Map<string, { labels: string[]; base: Prisma.Decimal; employee: Prisma.Decimal; employer: Prisma.Decimal }>();
      for (const row of reportRows) {
        const labels = [row[0].split("/")[1], row[2], row[3]], key = JSON.stringify(labels);
        const total = annual.get(key) || { labels, base: new Prisma.Decimal(0), employee: new Prisma.Decimal(0), employer: new Prisma.Decimal(0) };
        total.base = total.base.add(row[4] || "0"); total.employee = total.employee.add(row[5]); total.employer = total.employer.add(row[6]); annual.set(key, total);
      }
      for (const total of annual.values()) reportRows.push([`TOTAL_ANUAL/${total.labels[0]}`, "TOTAL", total.labels[1], total.labels[2], total.base.toFixed(2), total.employee.toFixed(2), total.employer.toFixed(2), ""]);
      return { title: input.kind === "SALARIOS_CONTRIBUICAO" ? "Salários de contribuição por previdência, vínculo e período — fontes publicadas" : "Contribuições previdenciárias por vínculo e competência — demonstrativos publicados", headers: ["Competência", "Tipo de folha", "Matrícula", "Previdência", "Base BRL", "Segurado BRL", "Patronal BRL", "Versão"], rows: reportRows };
    }
    const reportRows: string[][] = [];
    for (const statement of rows) {
      const snapshot = snapshotSchema.parse(statement.snapshot);
      for (const item of snapshot.items) reportRows.push([statement.run.payroll.competence, statement.run.payroll.type, snapshot.contract.registration, item.code, item.name, item.type, new Prisma.Decimal(item.value).toFixed(2), statement.id]);
      reportRows.push([statement.run.payroll.competence, statement.run.payroll.type, snapshot.contract.registration, "LIQUIDO", "Total líquido do demonstrativo", "TOTAL", statement.net.toFixed(2), statement.id]);
    }
    reportRows.push(["PERIODO", "", "", "TOTAL_LIQUIDO", "Total líquido dos demonstrativos no filtro", "TOTAL", rows.reduce((sum, row) => sum.add(row.net), new Prisma.Decimal(0)).toFixed(2), ""]);
    return { title: "Ficha financeira pessoal — valores publicados por período", headers: ["Competência", "Tipo de folha", "Matrícula", "Código", "Rubrica", "Natureza", "Valor BRL", "Versão"], rows: reportRows };
  }
  if (input.kind === "PONTO") {
    const rows = await context.prisma.attendanceRecord.findMany({ where: { employeeId, date: { gte: from, lte: until } }, orderBy: [{ date: "asc" }, { id: "asc" }] });
    const totals = rows.reduce((sum, row) => ({ hours: sum.hours.add(String(row.hoursWorked)), extra: sum.extra.add(String(row.extraHours)), bank: sum.bank.add(String(row.bankHours)) }), { hours: new Prisma.Decimal(0), extra: new Prisma.Decimal(0), bank: new Prisma.Decimal(0) });
    const configured: string[][] = [];
    if (input.totalsPolicyId) {
      const now = new Date(), rule = await context.prisma.hrPayrollRule.findFirst({ where: { id: input.totalsPolicyId, category: "PORTAL", isActive: true, ruleSet: { status: "ATIVA", effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }] } } });
      const policy = attendanceTotalsPolicySchema.parse(rule?.value);
      if (policy.employeeIds.length && !policy.employeeIds.includes(employeeId)) throw new AccessError("Totalizadores indisponíveis para o titular.", 403);
      const employee = await context.prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { secretariatId: true } });
      if (!employee.secretariatId || !await context.prisma.budgetUnit.findFirst({ where: { id: policy.budgetUnitId, secretariatId: employee.secretariatId }, select: { id: true } })) throw new AccessError("Totalizadores fora da unidade funcional.", 403);
      configured.push(...configuredAttendanceTotals(rows, policy).map(total => ["TOTAL_CONFIGURADO", total.label, "", total.value, "", "", "", total.code]));
    }
    return { title: "Espelho de ponto pessoal — relatório integral do período", headers: ["Data", "Entrada", "Saída", "Horas trabalhadas / total configurado", "Horas extras", "Banco de horas", "Situação", "Registro"], rows: [...rows.map(row => [civil(row.date), row.entryTime?.toISOString() || "", row.exitTime?.toISOString() || "", String(row.hoursWorked), String(row.extraHours), String(row.bankHours), row.status, row.id]), ["TOTAL", "", "", totals.hours.toFixed(4), totals.extra.toFixed(4), totals.bank.toFixed(4), "", ""], ...configured] };
  }
  if (input.kind === "HISTORICO_ATS") {
    const movements = await context.prisma.hrMovement.findMany({ where: { contract: contractWhere, sourceKey: { startsWith: "ATS:" }, startsAt: { lte: until }, OR: [{ endsAt: null }, { endsAt: { gte: from } }] }, include: { contract: { select: { registration: true } } }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] });
    const origins = await context.prisma.hrIntegrationEvent.findMany({ where: { eventType: "ATS_APURADO", sourceKey: { in: movements.map(row => row.sourceKey) } } });
    const reversals = await context.prisma.hrIntegrationEvent.findMany({ where: { eventType: "ATS_ESTORNADO", sourceKey: { in: movements.map(row => `ESTORNO:${row.sourceKey}`) } } });
    const memory = z.object({ assessment: z.object({ countedDays: z.number(), creditedDays: z.number(), excludedDays: z.number(), rate: z.string(), policy: z.object({ legalReference: z.string() }) }), creditIds: z.array(z.string()) });
    return { title: "Histórico pessoal do adicional por tempo de serviço — apuração e estornos de origem", headers: ["Matrícula", "Início", "Fim", "Tempo contado (dias)", "Tempo averbado (dias)", "Dias excluídos", "Percentual", "Valor apurado BRL", "Averbações de origem", "Fundamento", "Situação", "Movimento"], rows: movements.map(row => { const source = origins.find(origin => origin.sourceKey === row.sourceKey), parsed = memory.safeParse(source?.payload); if (!parsed.success) throw new Error("Apuração de ATS sem memória íntegra na origem."); const value = parsed.data; return [row.contract.registration, civil(row.startsAt), civil(row.endsAt), String(value.assessment.countedDays), String(value.assessment.creditedDays), String(value.assessment.excludedDays), value.assessment.rate, row.amount.toFixed(2), value.creditIds.join(" · "), value.assessment.policy.legalReference, reversals.some(reversal => reversal.sourceKey === `ESTORNO:${row.sourceKey}`) ? "ESTORNADA" : "APURADA", row.id]; }) };
  }
  if (input.kind === "GOZOS_LICENCA_PREMIO") {
    const entries = await context.prisma.hrRightEntry.findMany({ where: { kind: "LICENCA_PREMIO", contract: contractWhere, quantity: { lt: 0 }, details: { path: ["kind"], equals: "GOZO" } }, include: { contract: { select: { registration: true } } }, orderBy: [{ periodStart: "asc" }, { id: "asc" }] });
    const memory = z.object({ leaveId: z.string().nullable(), reason: z.string().optional() });
    const parsed = entries.map(entry => ({ entry, details: memory.parse(entry.details) }));
    const leaves = await context.prisma.leave.findMany({ where: { employeeId, id: { in: parsed.flatMap(row => row.details.leaveId ? [row.details.leaveId] : []) }, startDate: { lte: until }, endDate: { gte: from } } });
    return { title: "Licença-prêmio — gozos vinculados ao afastamento de origem", headers: ["Matrícula", "Aquisitivo início", "Aquisitivo fim", "Gozo início", "Gozo fim", "Dias reservados", "Situação do afastamento", "Situação temporal", "Referência RH"], rows: parsed.flatMap(({ entry, details }) => { const leave = leaves.find(row => row.id === details.leaveId); if (!leave) return []; const state = leave.status !== "Ativa" ? leave.status : leave.startDate > new Date() ? "PROGRAMADO" : leave.endDate < new Date() ? "PERIODO_DECORRIDO" : "EM_CURSO"; return [[entry.contract.registration, civil(entry.periodStart), civil(entry.periodEnd), civil(leave.startDate), civil(leave.endDate), entry.quantity.abs().toString(), leave.status, state, leave.id]]; }) };
  }
  if (["FERIAS", "BANCO_HORAS", "LICENCA_PREMIO"].includes(input.kind)) {
    const rows = await context.prisma.hrRightEntry.findMany({ where: { kind: input.kind, contract: contractWhere, periodStart: { lte: until }, periodEnd: { gte: from } }, include: { contract: { select: { registration: true } } }, orderBy: [{ periodStart: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
    const reportRows = rows.map(row => { const details = jsonObject(row.details); return [row.contract.registration, civil(row.periodStart), civil(row.periodEnd), row.quantity.toString(), row.amount.toFixed(2), String(details.operation || details.kind || details.reason || "Registro de origem"), String(details.scope || ""), row.id]; });
    const balances = new Map<string, { labels: string[]; quantity: Prisma.Decimal }>();
    for (const row of rows) { const labels = [row.contract.registration, civil(row.periodStart), civil(row.periodEnd), String(jsonObject(row.details).scope || "")]; const key = JSON.stringify([row.contractId, ...labels.slice(1)]); const balance = balances.get(key) || { labels, quantity: new Prisma.Decimal(0) }; balance.quantity = balance.quantity.add(row.quantity); balances.set(key, balance); }
    for (const { labels: [registration, start, end, scope], quantity } of balances.values()) reportRows.push([registration, start, end, quantity.toString(), "", "Saldo do aquisitivo/recorte", scope, ""]);
    return { title: `${input.kind === "FERIAS" ? "Direitos e saldos de férias" : input.kind === "BANCO_HORAS" ? "Compensação e banco de horas" : "Licença-prêmio: aquisitivos e operações"} — livro de origem`, headers: ["Matrícula", "Início", "Fim", "Quantidade", "Valor BRL", "Operação / fundamento", "Escopo de origem", "Registro"], rows: reportRows };
  }
  if (input.kind === "AFASTAMENTOS") {
    const leaves = await context.prisma.leave.findMany({ where: { employeeId, startDate: { lte: until }, endDate: { gte: from } }, orderBy: [{ startDate: "asc" }, { id: "asc" }] });
    const absences = await context.prisma.attendanceRecord.findMany({ where: { employeeId, status: "Falta", date: { gte: from, lte: until } }, orderBy: [{ date: "asc" }, { id: "asc" }] });
    return { title: "Afastamentos e faltas pessoais", headers: ["Categoria", "Início", "Fim", "Motivo / situação", "Registro"], rows: [...leaves.map(row => ["AFASTAMENTO", civil(row.startDate), civil(row.endDate), `${row.type} · ${row.status}`, row.id]), ...absences.map(row => ["FALTA", civil(row.date), civil(row.date), row.status, row.id])] };
  }
  if (input.kind === "CONSIGNACOES") {
    const rows = await context.prisma.hrConsignmentInstallment.findMany({ where: { agreement: { contract: contractWhere }, competenceAt: { gte: from, lte: until } }, include: { agreement: { include: { contract: { select: { registration: true } } } }, entries: true }, orderBy: [{ competenceAt: "asc" }, { id: "asc" }] });
    return { title: "Empréstimos e consignações pessoais — parcelas e operações de origem", headers: ["Matrícula", "Contrato", "Consignatária ID", "Competência", "Parcela", "Valor BRL", "Operações registradas", "Referência"], rows: rows.map(row => [row.agreement.contract.registration, row.agreement.number, row.agreement.supplierId, civil(row.competenceAt), String(row.sequence), row.amount.toFixed(2), row.entries.map(entry => entry.kind).join(" · "), row.id]) };
  }
  if (input.kind === "PLANOS") {
    const rows = await context.prisma.sstBenefitEntry.findMany({ where: { beneficiary: { payrollBenefit: { employeeId } } }, include: { beneficiary: { include: { dependent: { select: { name: true } }, plan: { include: { benefitConfig: { select: { name: true } } } } } } }, orderBy: [{ competence: "asc" }, { id: "asc" }] });
    const filtered = rows.filter(row => { const [month, year] = row.competence.split("/").map(Number); const date = new Date(Date.UTC(year, month - 1, 1)); return date <= until && new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)) >= from; });
    return { title: "Mensalidades, despesas e devoluções dos planos de saúde próprios", headers: ["Plano", "Beneficiário", "Competência", "Natureza", "Valor BRL", "Registro"], rows: filtered.map(row => [row.beneficiary.plan.benefitConfig.name, row.beneficiary.dependent?.name || "Titular", row.competence, row.kind, row.amount.toFixed(2), row.id]) };
  }
  if (input.kind === "ATOS") {
    const rows = await context.prisma.personnelAct.findMany({ where: { employeeId, date: { gte: from, lte: until } }, orderBy: [{ date: "asc" }, { id: "asc" }] });
    return { title: "Atos legais do servidor", headers: ["Data", "Tipo", "Número", "Registro"], rows: rows.map(row => [civil(row.date), row.type, row.actNumber || "", row.id]) };
  }
  const employee = await context.prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { person: { include: { addresses: true } }, role: true, department: true, secretariat: true, dependents: true } });
  const contracts = await context.prisma.hrEmploymentContract.findMany({ where: contractWhere, include: { revisions: true }, orderBy: { registration: "asc" } });
  const rows: string[][] = [["IDENTIFICACAO", "", "Nome", employee.name], ["IDENTIFICACAO", "", "Matrícula", employee.registration || ""], ["VINCULO_ATUAL", "", "Cargo", employee.role?.name || ""], ["VINCULO_ATUAL", "", "Lotação", employee.department?.name || employee.secretariat?.name || ""]];
  if (employee.person) for (const [field, label] of [["cpf", "CPF"], ["rg", "RG"], ["motherName", "Filiação materna"], ["fatherName", "Filiação paterna"], ["educationLevel", "Grau de instrução"], ["maritalStatus", "Estado civil"], ["email", "E-mail cadastral"], ["phonePrimary", "Telefone"]] as const) rows.push(["CADASTRO_UNICO", "", label, employee.person[field] || ""]);
  if (employee.person) for (const address of employee.person.addresses) rows.push(["ENDERECO", address.id, address.addressType || "Endereço cadastrado", [address.streetName, address.number, address.complement, address.zipCode, address.referencePoint].filter(Boolean).join(" · ")]);
  for (const dependent of employee.dependents) rows.push(["DEPENDENTE", dependent.id, dependent.relationship, `${dependent.name} · nascimento ${civil(dependent.birthDate)}`]);
  for (const contract of contracts) { rows.push(["CONTRATO_ATUAL", contract.id, "Matrícula / vigência / situação", `${contract.registration} · ${civil(contract.admittedAt)} a ${civil(contract.endsAt)} · ${contract.status}`]); rows.push(["CONTRATO_ATUAL", contract.id, "Jornada / local", `${contract.monthlyHours} horas mensais · ${contract.workLocation}`]); for (const revision of contract.revisions.filter(revision => revision.effectiveFrom <= until).sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime() || a.version - b.version)) { rows.push(["REVISAO", contract.id, `Versão ${revision.version}`, `${civil(revision.effectiveFrom)} · ${revision.reason}`]); rows.push(["REVISAO_ORIGEM", revision.id, "Dados históricos preservados (JSON)", JSON.stringify(revision.snapshot)]); } }
  const recertifications = await context.prisma.hrIntegrationEvent.findMany({ where: { eventType: "RECADASTRAMENTO_DECIDIDO", status: "PROCESSADO", payload: { path: ["employeeId"], equals: employeeId }, createdAt: { lte: until } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  for (const event of recertifications) { const memory = z.object({ status: z.string(), appliedDetails: z.object({ previousEmployment: z.array(z.object({ employer: z.string(), role: z.string(), startsAt: z.string(), endsAt: z.string(), evidenceReference: z.string() })) }).nullable().optional() }).safeParse(event.payload); if (memory.success && memory.data.status === "DEFERIDA") for (const job of memory.data.appliedDetails?.previousEmployment || []) rows.push(["EMPREGO_ANTERIOR_DECLARADO", event.id, `${job.employer} · ${job.role}`, `${job.startsAt} a ${job.endsAt} · ${job.evidenceReference} · sem averbação automática de tempo`]); }
  return { title: "Ficha de registro funcional pessoal — cadastro e revisões de origem", headers: ["Grupo", "Referência", "Campo", "Valor"], rows };
}
