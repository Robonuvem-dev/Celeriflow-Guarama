import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AccessError, type AppContext } from "@/lib/platform/tenant-context";
import { resolveContractRevision } from "@/lib/rh/contract-timeline";
import { payrollPeriod } from "@/lib/rh/calculation-engine";
import { payrollPaymentAllocationSchema } from "@/lib/rh/payroll-payment-allocation";
import { payrollSnapshotHash, ownReleasedStatementIds } from "./payroll-publication";
import { getPayrollStatement } from "@/lib/rh/statement-service";
import { consignmentMarginSchema } from "@/lib/rh/consignment-margin";
import type { FunctionalScope } from "@/lib/sst/functional-policy";
import type { DocumentLayoutPolicy, FunctionalDocumentInput } from "./document-policy";

export type FunctionalDocumentSource = { fields: Record<string, string>; headers: string[]; rows: string[][]; snapshot: unknown };
const day = 86400000;
const date = (value: Date) => value.toISOString().slice(0, 10);

export function recognizedServiceDays(periods: { startsAt: Date; endsAt: Date }[], exclusions: { startDate: Date; endDate: Date }[], from: Date, until: Date) {
  if (until < from || (until.getTime() - from.getTime()) / day > 55000) throw new Error("Intervalo funcional inválido ou superior a 150 anos.");
  const days = new Set<string>();
  for (const period of periods) for (let instant = new Date(Math.max(period.startsAt.getTime(), from.getTime())); instant < period.endsAt && instant <= until; instant = new Date(instant.getTime() + day)) days.add(date(instant));
  for (const absence of exclusions) for (let instant = new Date(Math.max(absence.startDate.getTime(), from.getTime())); instant <= absence.endDate && instant <= until; instant = new Date(instant.getTime() + day)) days.delete(date(instant));
  return days.size;
}

async function annualIncome(context: AppContext, input: FunctionalDocumentInput, policy: DocumentLayoutPolicy): Promise<FunctionalDocumentSource> {
  if (!input.year) throw new Error("Informe o ano de pagamento.");
  const employeeId = context.user.employeeId!;
  const statements = await context.prisma.hrPayrollStatement.findMany({ where: { contract: { employeeId }, run: { mode: "OFICIAL", status: "FECHADA", scope: "PRODUCAO" }, revokedAt: null }, include: { run: { include: { payroll: true } } }, orderBy: { id: "asc" } });
  const financialOrigins = await context.prisma.hrIntegrationEvent.findMany({ where: { sourceKey: { in: [...new Set(statements.map(statement => `FINANCEIRO:PAGAMENTOS:${statement.runId}`))] }, status: "CONCLUIDA", eventType: "PAGAMENTOS_FOLHA" } });
  const yearRuns = financialOrigins.filter(origin => z.object({ input: z.object({ date: z.string() }) }).parse(origin.payload).input.date.startsWith(`${input.year}-`)).map(origin => origin.sourceKey.slice("FINANCEIRO:PAGAMENTOS:".length));
  const allocationEvents = await context.prisma.hrIntegrationEvent.findMany({ where: { eventType: "PAGAMENTO_FOLHA_ALOCADO_POR_TITULAR", status: "PROCESSADO", payload: { path: ["employeeId"], equals: employeeId } }, orderBy: { sourceKey: "asc" } });
  const allocations = allocationEvents.map(event => payrollPaymentAllocationSchema.parse(event.payload));
  if (statements.some(statement => yearRuns.includes(statement.runId) && !allocations.some(allocation => allocation.statementId === statement.id))) throw new Error("Há pagamento da folha sem conciliação individual do titular. O RH/Financeiro deve concluir a alocação antes do informe anual.");
  const allowed = await ownReleasedStatementIds(context.prisma, employeeId);
  const rows: string[][] = [], totals = new Map(policy.annualGroups.map(group => [group.code, new Prisma.Decimal(0)]));
  const evidence: unknown[] = [];
  for (const allocation of allocations) {
    const payments = await context.prisma.payment.findMany({ where: { id: { in: allocation.allocations.map(row => row.paymentId) } }, orderBy: { id: "asc" } });
    if (!payments.some(payment => payment.date.getUTCFullYear() === input.year)) continue;
    const statement = statements.find(row => row.id === allocation.statementId);
    if (!statement) throw new Error("Pagamento individual vinculado a demonstrativo revogado ou indisponível.");
    if (!allowed.includes(statement.id) || allocation.statementHash !== payrollSnapshotHash(statement) || payments.length !== allocation.allocations.length || payments.some(payment => payment.status !== "Paga")) throw new Error("Pagamento, versão ou disponibilização do informe divergente da origem.");
    const proof = await context.prisma.documentVersion.findFirst({ where: { id: allocation.proofVersionId, hashSha256: allocation.proofHash, status: { in: ["FINAL", "SIGNED"] }, document: { status: { in: ["Válido", "Assinado"] } } }, select: { id: true } });
    if (!proof) throw new Error("Comprovação da conciliação individual indisponível.");
    if (payments.some(payment => payment.date.getUTCFullYear() !== input.year)) throw new Error("Demonstrativo dividido entre anos de pagamento exige conciliação fiscal específica antes do informe.");
    const snapshot = z.object({ contract: z.object({ registration: z.string() }), items: z.array(z.object({ code: z.string(), type: z.string(), value: z.string() })) }).parse(statement.snapshot);
    const scope = await context.prisma.sstBenefitPayrollScope.findUnique({ where: { payrollId: statement.run.payrollId } });
    if (scope && scope.budgetUnitId !== policy.budgetUnitId) throw new Error("Modelo anual fora da unidade da folha.");
    for (const item of snapshot.items.filter(item => ["PROVENTO", "DESCONTO"].includes(item.type))) {
      const groups = policy.annualGroups.filter(group => group.payrollTypes.includes(statement.run.payroll.type) && group.rubricCodes.includes(item.code));
      if (groups.length !== 1) throw new Error(`Classifique a rubrica ${item.code} do tipo ${statement.run.payroll.type} em exatamente um grupo anual.`);
      const group = groups[0]; totals.set(group.code, totals.get(group.code)!.add(item.value));
      rows.push([snapshot.contract.registration, statement.run.payroll.competence, statement.run.payroll.type, group.label, item.code, new Prisma.Decimal(item.value).toFixed(2), payments.map(payment => date(payment.date)).join(" · "), statement.id]);
    }
    evidence.push({ allocation, sourceEventId: allocationEvents.find(event => (event.payload as { statementId: string }).statementId === allocation.statementId)?.id, statementHash: allocation.statementHash, payments: payments.map(payment => ({ id: payment.id, date: payment.date, status: payment.status, net: payment.netValueDecimal?.toString() || null })) });
  }
  if (!evidence.length) throw new Error("Nenhum pagamento individual conciliado e liberado neste ano.");
  for (const group of policy.annualGroups) rows.push(["TOTAL_ANUAL", "", "", group.label, group.code, totals.get(group.code)!.toFixed(2), "", ""]);
  return { fields: { ano: String(input.year) }, headers: ["Matrícula", "Competência", "Folha", "Grupo fiscal", "Rubrica", "Valor BRL", "Pagamento", "Versão"], rows, snapshot: evidence };
}

async function marginSource(context: AppContext, input: FunctionalDocumentInput, policy: DocumentLayoutPolicy): Promise<FunctionalDocumentSource> {
  if (!input.supplierId || !policy.supplierIds.includes(input.supplierId)) throw new Error("Selecione um banco/convenente do modelo autorizado.");
  const supplier = await context.prisma.supplier.findFirst({ where: { id: input.supplierId, status: "Ativo" }, include: { company: true, person: true } });
  if (!supplier) throw new Error("Banco/convenente indisponível.");
  const ids = await ownReleasedStatementIds(context.prisma, context.user.employeeId!);
  const statements = await context.prisma.hrPayrollStatement.findMany({ where: { id: { in: ids }, run: { status: "FECHADA", scope: "PRODUCAO", mode: "OFICIAL", payroll: { type: "Mensal" } } }, include: { run: { include: { payroll: true } } } });
  statements.sort((a, b) => payrollPeriod(b.run.payroll.competence).start.getTime() - payrollPeriod(a.run.payroll.competence).start.getTime() || b.run.createdAt.getTime() - a.run.createdAt.getTime());
  const statement = statements[0]; if (!statement) throw new Error("Sem referência mensal própria publicada.");
  const source = z.object({ consignmentMargin: consignmentMarginSchema, contract: z.object({ movements: z.array(z.object({ id: z.string() })) }) }).parse(statement.snapshot);
  const policyRules = await context.prisma.hrPayrollRule.findMany({ where: { ruleSetId: statement.run.ruleSetId, isActive: true }, include: { ruleSet: true } });
  const consignmentPolicy = z.object({ origin: z.literal("CONSIGNACAO_CONTRATOS"), referenceValidityMonths: z.number(), supplierIds: z.array(z.string()) });
  const native = policyRules.map(rule => consignmentPolicy.safeParse(rule.value)).find(rule => rule.success && rule.data.supplierIds.includes(supplier.id));
  const reference = payrollPeriod(statement.run.payroll.competence).start;
  const nextCompetence = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1));
  const months = (new Date().getUTCFullYear() - reference.getUTCFullYear()) * 12 + new Date().getUTCMonth() - reference.getUTCMonth();
  if (!native?.success || months > native.data.referenceValidityMonths) throw new Error("Referência de margem vencida ou banco não conveniado na política RH.");
  const all = statements.filter(row => row.runId === statement.runId);
  const movements = all.flatMap(row => z.object({ contract: z.object({ movements: z.array(z.object({ id: z.string() })) }) }).parse(row.snapshot).contract.movements.map(movement => movement.id));
  const managed = await context.prisma.hrConsignmentEntry.findMany({ where: { kind: "LANCAMENTO", movementId: { in: movements } }, include: { installment: true } });
  const baseline = new Prisma.Decimal(source.consignmentMargin.used).sub(managed.reduce((sum, row) => sum.add(row.installment.amount), new Prisma.Decimal(0)));
  const reserve = await context.prisma.hrConsignmentEntry.aggregate({ where: { installment: { competenceAt: nextCompetence, agreement: { scope: statement.run.scope, contract: { employeeId: context.user.employeeId! } } } }, _sum: { amount: true } });
  if (baseline.lt(0)) throw new Error("Margem histórica divergente do cronograma gerenciado.");
  const available = Prisma.Decimal.max(0, new Prisma.Decimal(source.consignmentMargin.limit).sub(baseline).sub(reserve._sum.amount || 0)).toFixed(2);
  const bank = supplier.company?.corporateName || supplier.person?.fullName || supplier.id;
  return { fields: { banco: bank, margem: available, inicio: date(reference), fim: date(payrollPeriod(statement.run.payroll.competence).end) }, headers: ["Referência", "Banco", "Base BRL", "Limite BRL", "Descontos não gerenciados BRL", "Reservas BRL", "Disponível BRL"], rows: [[statement.run.payroll.competence, bank, source.consignmentMargin.base, source.consignmentMargin.limit, baseline.toFixed(2), new Prisma.Decimal(reserve._sum.amount || 0).toFixed(2), available]], snapshot: { employeeId: context.user.employeeId, scope: statement.run.scope, statementId: statement.id, statementHash: payrollSnapshotHash(statement), margin: source.consignmentMargin, baseline: baseline.toFixed(2), reserved: reserve._sum.amount?.toString() || "0", supplierId: supplier.id, reference, nextCompetence } };
}

export async function buildFunctionalDocumentSource(context: AppContext, input: FunctionalDocumentInput, policy: DocumentLayoutPolicy): Promise<FunctionalDocumentSource> {
  if (input.kind === "IRRF_ANUAL") return annualIncome(context, input, policy);
  if (input.kind === "MARGEM") return marginSource(context, input, policy);
  if (["RECIBO_FERIAS", "TERMO_RESCISAO"].includes(input.kind)) {
    if (!input.statementId) throw new Error("Selecione o demonstrativo correspondente.");
    const statement = await getPayrollStatement(context.prisma, input.statementId, context.user.employeeId!);
    const source = await context.prisma.hrPayrollStatement.findUniqueOrThrow({ where: { id: statement.id }, include: { contract: true, run: true } });
    let finalitySourceId: string | undefined;
    let finalityProof: { proofVersionId: string; proofHash: string } | undefined;
    const fields: Record<string, string> = { matricula: statement.contract.registration, situacao: source.contract.status };
    if (source.run.status !== "FECHADA" || statement.payrollType !== (input.kind === "RECIBO_FERIAS" ? "Férias" : "Rescisão")) throw new Error("Documento exige cálculo oficial fechado do tipo correspondente.");
    if (source.run.scope !== "PRODUCAO") throw new Error("Documento definitivo exige fonte de produção.");
    if (statement.specialPayroll?.estimated === true) {
      const finality = await context.prisma.hrIntegrationEvent.findUnique({ where: { sourceKey: `RH:CALCULO_ESPECIAL_DEFINITIVO:${statement.id}` } });
      finalitySourceId = finality?.id;
      const proof = z.object({ statementHash: z.string(), proofVersionId: z.string(), proofHash: z.string() }).safeParse(finality?.payload);
      if (finality?.status !== "PROCESSADO" || !proof.success || proof.data.statementHash !== payrollSnapshotHash(source) || !await context.prisma.documentVersion.findFirst({ where: { id: proof.data.proofVersionId, hashSha256: proof.data.proofHash, status: "SIGNED", document: { status: { in: ["Válido", "Assinado"] } } }, select: { id: true } })) throw new Error("Conclua a conferência definitiva RH com documento assinado antes de emitir a fonte especial.");
      finalityProof = { proofVersionId: proof.data.proofVersionId, proofHash: proof.data.proofHash };
    }
    const rows = statement.items.map(item => [item.code, item.name, item.type, item.value]);
    if (input.kind === "RECIBO_FERIAS") {
      const reservations = z.object({ vacationReservations: z.object({ entries: z.array(z.object({ entryId: z.string(), vacationId: z.string(), start: z.string(), end: z.string(), acquisitionStart: z.string(), acquisitionEnd: z.string(), days: z.number() })).min(1) }) }).parse(statement.specialPayroll).vacationReservations;
      for (const reservation of reservations.entries) {
        const vacation = await context.prisma.vacation.findFirst({ where: { id: reservation.vacationId, employeeId: context.user.employeeId!, status: { in: ["Programada", "Em gozo", "Concluída"] } } });
        if (!vacation || !vacation.enjoymentStart || date(vacation.enjoymentStart) !== reservation.start || !vacation.enjoymentEnd || date(vacation.enjoymentEnd) !== reservation.end || await context.prisma.hrRightEntry.findFirst({ where: { contractId: source.contractId, details: { path: ["cancelsId"], equals: reservation.entryId } } })) throw new Error("Gozo de origem cancelado ou alterado após o cálculo.");
        rows.push(["AQUISITIVO", reservation.acquisitionStart, reservation.acquisitionEnd, ""]); rows.push(["GOZO", reservation.start, reservation.end, String(reservation.days)]);
        rows.push(["SITUAÇÃO_GOZO", vacation.status, "Programação não equivale a gozo concluído", ""]);
      }
      fields.inicio = reservations.entries[0].start; fields.fim = reservations.entries[reservations.entries.length - 1].end; fields.dias = String(reservations.entries.reduce((sum, entry) => sum + entry.days, 0));
    } else if (!source.contract.endsAt || !["DEMITIDO", "ENCERRADO", "RESCINDIDO", "INATIVO"].includes(source.contract.status)) throw new Error("Termo de rescisão exige encerramento efetivo do contrato na origem RH.");
    else { fields.inicio = date(source.contract.admittedAt); fields.fim = date(source.contract.endsAt); }
    rows.push(["TOTAL", "Bruto / descontos / líquido", `${statement.gross} / ${statement.deductions}`, statement.net]);
    rows.push(["NATUREZA", "Valores da fonte de cálculo RH", "Pagamento individual depende de conciliação financeira", ""]);
    return { fields, headers: ["Código", "Descrição / início", "Natureza / fim", "Valor / dias"], rows, snapshot: { statementId: source.id, statementHash: payrollSnapshotHash(source), finalitySourceId, finalityProof, statement, contractEndsAt: source.contract.endsAt, contractStatus: source.contract.status } };
  }
  if (!input.contractId) throw new Error("Selecione um vínculo próprio.");
  const contract = await context.prisma.hrEmploymentContract.findFirst({ where: { id: input.contractId, employeeId: context.user.employeeId! }, include: { revisions: true } });
  if (!contract) throw new AccessError("Contrato indisponível.", 404);
  const from = new Date(`${input.from}T00:00:00Z`), until = new Date(`${input.until}T23:59:59.999Z`);
  if (input.until > date(new Date())) throw new Error("Declarações de serviço não certificam períodos futuros.");
  const periods = await context.prisma.$queryRaw<(FunctionalScope & { sourceReference: string })[]>`SELECT p.* FROM "HrEmployeeFunctionalPeriod" p WHERE p."employeeId"=${context.user.employeeId} AND p."budgetUnitId"=${policy.budgetUnitId} AND p."contractReference" IN (${contract.id},${contract.registration}) AND p."startsAt"<=${until} AND p."endsAt">${from} AND NOT p.voided AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) ORDER BY p."startsAt",p.id`;
  if (!periods.length) throw new Error("História funcional canônica do vínculo/período não cadastrada.");
  const expectedFrom = new Date(Math.max(from.getTime(), contract.admittedAt.getTime()));
  const expectedUntil = new Date(Math.min(until.getTime(), contract.endsAt ? contract.endsAt.getTime() + day - 1 : until.getTime()));
  const expectedDays = Math.floor((new Date(date(expectedUntil)).getTime() - new Date(date(expectedFrom)).getTime()) / day) + 1;
  if (expectedDays > 0 && recognizedServiceDays(periods, [], expectedFrom, expectedUntil) !== expectedDays) throw new Error("Complete os dias sem história funcional RH no intervalo do vínculo antes da declaração.");
  const revision = resolveContractRevision(contract, contract.revisions, { start: until, end: until });
  const history = input.kind === "MAGISTERIO" ? periods.filter(period => policy.teachingRoleIds.includes(period.roleId)) : periods;
  if (input.kind === "MAGISTERIO" && !history.length) throw new Error("Sem período de efetivo exercício classificado como magistério na política RH.");
  const leaves = await context.prisma.leave.findMany({ where: { employeeId: context.user.employeeId!, status: { in: ["Ativa", "Concluída"] }, startDate: { lte: until }, endDate: { gte: from } }, orderBy: { id: "asc" } });
  if (input.kind !== "DECLARACAO_VINCULO" && leaves.some(leave => !policy.leaveCounting.some(rule => rule.type === leave.type))) throw new Error("Configure a contagem dos afastamentos encontrados antes de emitir a declaração de tempo.");
  const excluded = leaves.filter(leave => policy.leaveCounting.some(rule => rule.type === leave.type && !rule.counts));
  const credits = input.kind === "TEMPO_SERVICO" && policy.creditScopes.length ? await context.prisma.hrRightEntry.findMany({ where: { kind: "TEMPO_SERVICO", contractId: contract.id, periodEnd: { lte: until }, OR: policy.creditScopes.map(scope => ({ details: { path: ["scope"], equals: scope } })) }, orderBy: { id: "asc" } }) : [];
  const days = recognizedServiceDays(history, excluded, from, until) + credits.reduce((sum, credit) => sum + credit.quantity.toNumber(), 0);
  const rows = history.map(period => [date(period.startsAt), date(new Date(period.endsAt.getTime() - 1)), String(period.snapshot.role || ""), String(period.snapshot.department || ""), period.sourceReference]);
  rows.push(["TOTAL_DIAS", "", "", String(days), "Períodos distintos menos exclusões, com averbações reconhecidas quando configuradas"]);
  rows.push(["VÍNCULO", revision.contract.registration, revision.contract.status, revision.contract.workLocation, `Versão ${revision.contract.version} · referência ${input.until}`]);
  const final = periods.find(period => period.startsAt <= until && period.endsAt > until) || periods[periods.length - 1];
  return { fields: { matricula: revision.contract.registration, cargo: String(final.snapshot.role || ""), lotacao: revision.contract.workLocation, situacao: revision.contract.status, dias: String(days) }, headers: ["Início", "Fim", "Cargo histórico", "Lotação / dias", "Fonte"], rows, snapshot: { periods: history, excluded, credits, revisionId: revision.revisionId, contract: revision.contract } };
}
