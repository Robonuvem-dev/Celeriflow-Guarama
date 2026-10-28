import { Decimal } from "@/db/decimal";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portalEvent, portalEvents, portalFirst, portalRows } from "@/db/repositories/portal-servidor/records";
import { portalStatements } from "@/db/repositories/portal-servidor/payroll";
import { portalContracts } from "@/db/repositories/portal-servidor/contracts";
import { portalSupplier, portalConsignmentReserve, portalRights, type PortalLeave, type PortalVacation } from "@/db/repositories/portal-servidor/reports";
import type { JsonValue } from "@/db/json";
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
  const executor = context.database ?? db;
  const statements = await portalStatements(executor, sql`c."employeeId"=${employeeId} AND r.mode='OFICIAL' AND r.status='FECHADA' AND r.scope='PRODUCAO' AND s."revokedAt" IS NULL`);
  const financialOrigins = await portalEvents(executor, sql`"sourceKey"=ANY(${sql.param([...new Set(statements.map(statement => `FINANCEIRO:PAGAMENTOS:${statement.runId}`))])}::text[]) AND status='CONCLUIDA' AND "eventType"='PAGAMENTOS_FOLHA'`);
  const yearRuns = financialOrigins.filter(origin => z.object({ input: z.object({ date: z.string() }) }).parse(origin.payload).input.date.startsWith(`${input.year}-`)).map(origin => origin.sourceKey.slice("FINANCEIRO:PAGAMENTOS:".length));
  const allocationEvents = await portalEvents(executor, sql`"eventType"='PAGAMENTO_FOLHA_ALOCADO_POR_TITULAR' AND status='PROCESSADO' AND payload->>'employeeId'=${employeeId}`, sql`"sourceKey" ASC`);
  const allocations = allocationEvents.map(event => payrollPaymentAllocationSchema.parse(event.payload));
  if (statements.some(statement => yearRuns.includes(statement.runId) && !allocations.some(allocation => allocation.statementId === statement.id))) throw new Error("Há pagamento da folha sem conciliação individual do titular. O RH/Financeiro deve concluir a alocação antes do informe anual.");
  const allowed = await ownReleasedStatementIds(executor, employeeId);
  const rows: string[][] = [], totals = new Map(policy.annualGroups.map(group => [group.code, new Decimal(0)]));
  const evidence: unknown[] = [];
  for (const allocation of allocations) {
    const payments = await portalRows<{ id: string; date: Date; status: string; netValueDecimal: string | null }>(executor, sql`SELECT id,date,status,"netValueDecimal" FROM "Payment" WHERE id=ANY(${sql.param(allocation.allocations.map(row => row.paymentId))}::text[]) ORDER BY id`);
    if (!payments.some(payment => payment.date.getUTCFullYear() === input.year)) continue;
    const statement = statements.find(row => row.id === allocation.statementId);
    if (!statement) throw new Error("Pagamento individual vinculado a demonstrativo revogado ou indisponível.");
    if (!allowed.includes(statement.id) || allocation.statementHash !== payrollSnapshotHash(statement) || payments.length !== allocation.allocations.length || payments.some(payment => payment.status !== "Paga")) throw new Error("Pagamento, versão ou disponibilização do informe divergente da origem.");
    const proof = await portalFirst<{ id: string }>(executor, sql`SELECT v.id FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" WHERE v.id=${allocation.proofVersionId} AND v."hashSha256"=${allocation.proofHash} AND v.status IN ('FINAL','SIGNED') AND d.status IN ('Válido','Assinado') LIMIT 1`);
    if (!proof) throw new Error("Comprovação da conciliação individual indisponível.");
    if (payments.some(payment => payment.date.getUTCFullYear() !== input.year)) throw new Error("Demonstrativo dividido entre anos de pagamento exige conciliação fiscal específica antes do informe.");
    const snapshot = z.object({ contract: z.object({ registration: z.string() }), items: z.array(z.object({ code: z.string(), type: z.string(), value: z.string() })) }).parse(statement.snapshot);
    const scope = await portalFirst<{ budgetUnitId: string }>(executor, sql`SELECT "budgetUnitId" FROM "SstBenefitPayrollScope" WHERE "payrollId"=${statement.run.payrollId}`);
    if (scope && scope.budgetUnitId !== policy.budgetUnitId) throw new Error("Modelo anual fora da unidade da folha.");
    for (const item of snapshot.items.filter(item => ["PROVENTO", "DESCONTO"].includes(item.type))) {
      const groups = policy.annualGroups.filter(group => group.payrollTypes.includes(statement.run.payroll.type) && group.rubricCodes.includes(item.code));
      if (groups.length !== 1) throw new Error(`Classifique a rubrica ${item.code} do tipo ${statement.run.payroll.type} em exatamente um grupo anual.`);
      const group = groups[0]; totals.set(group.code, totals.get(group.code)!.add(item.value));
      rows.push([snapshot.contract.registration, statement.run.payroll.competence, statement.run.payroll.type, group.label, item.code, new Decimal(item.value).toFixed(2), payments.map(payment => date(payment.date)).join(" · "), statement.id]);
    }
    evidence.push({ allocation, sourceEventId: allocationEvents.find(event => (event.payload as { statementId: string }).statementId === allocation.statementId)?.id, statementHash: allocation.statementHash, payments: payments.map(payment => ({ id: payment.id, date: payment.date, status: payment.status, net: payment.netValueDecimal === null ? null : new Decimal(payment.netValueDecimal).toString() })) });
  }
  if (!evidence.length) throw new Error("Nenhum pagamento individual conciliado e liberado neste ano.");
  for (const group of policy.annualGroups) rows.push(["TOTAL_ANUAL", "", "", group.label, group.code, totals.get(group.code)!.toFixed(2), "", ""]);
  return { fields: { ano: String(input.year) }, headers: ["Matrícula", "Competência", "Folha", "Grupo fiscal", "Rubrica", "Valor BRL", "Pagamento", "Versão"], rows, snapshot: evidence };
}

async function marginSource(context: AppContext, input: FunctionalDocumentInput, policy: DocumentLayoutPolicy): Promise<FunctionalDocumentSource> {
  if (!input.supplierId || !policy.supplierIds.includes(input.supplierId)) throw new Error("Selecione um banco/convenente do modelo autorizado.");
  const executor = context.database ?? db;
  const supplier = await portalSupplier(executor, input.supplierId);
  if (!supplier) throw new Error("Banco/convenente indisponível.");
  const ids = await ownReleasedStatementIds(executor, context.user.employeeId!);
  const statements = await portalStatements(executor, sql`s.id=ANY(${sql.param(ids)}::text[]) AND r.status='FECHADA' AND r.scope='PRODUCAO' AND r.mode='OFICIAL' AND p.type='Mensal'`);
  statements.sort((a, b) => payrollPeriod(b.run.payroll.competence).start.getTime() - payrollPeriod(a.run.payroll.competence).start.getTime() || b.run.createdAt.getTime() - a.run.createdAt.getTime());
  const statement = statements[0]; if (!statement) throw new Error("Sem referência mensal própria publicada.");
  const source = z.object({ consignmentMargin: consignmentMarginSchema, contract: z.object({ movements: z.array(z.object({ id: z.string() })) }) }).parse(statement.snapshot);
  const policyRules = await portalRows<{ value: JsonValue }>(executor, sql`SELECT value FROM "HrPayrollRule" WHERE "ruleSetId"=${statement.run.ruleSetId} AND "isActive"`);
  const consignmentPolicy = z.object({ origin: z.literal("CONSIGNACAO_CONTRATOS"), referenceValidityMonths: z.number(), supplierIds: z.array(z.string()) });
  const native = policyRules.map(rule => consignmentPolicy.safeParse(rule.value)).find(rule => rule.success && rule.data.supplierIds.includes(supplier.id));
  const reference = payrollPeriod(statement.run.payroll.competence).start;
  const nextCompetence = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1));
  const months = (new Date().getUTCFullYear() - reference.getUTCFullYear()) * 12 + new Date().getUTCMonth() - reference.getUTCMonth();
  if (!native?.success || months > native.data.referenceValidityMonths) throw new Error("Referência de margem vencida ou banco não conveniado na política RH.");
  const all = statements.filter(row => row.runId === statement.runId);
  const movements = all.flatMap(row => z.object({ contract: z.object({ movements: z.array(z.object({ id: z.string() })) }) }).parse(row.snapshot).contract.movements.map(movement => movement.id));
  const managed = await portalRows<{ amount: string }>(executor, sql`SELECT i.amount FROM "HrConsignmentEntry" e JOIN "HrConsignmentInstallment" i ON i.id=e."installmentId" WHERE e.kind='LANCAMENTO' AND e."movementId"=ANY(${sql.param(movements)}::text[])`);
  const baseline = new Decimal(source.consignmentMargin.used).sub(managed.reduce((sum, row) => sum.add(row.amount), new Decimal(0)));
  const reserve = await portalConsignmentReserve(executor, context.user.employeeId!, nextCompetence, statement.run.scope);
  if (baseline.lt(0)) throw new Error("Margem histórica divergente do cronograma gerenciado.");
  const available = Decimal.max(0, new Decimal(source.consignmentMargin.limit).sub(baseline).sub(reserve || 0)).toFixed(2);
  const bank = supplier.company?.corporateName || supplier.person?.fullName || supplier.id;
  return { fields: { banco: bank, margem: available, inicio: date(reference), fim: date(payrollPeriod(statement.run.payroll.competence).end) }, headers: ["Referência", "Banco", "Base BRL", "Limite BRL", "Descontos não gerenciados BRL", "Reservas BRL", "Disponível BRL"], rows: [[statement.run.payroll.competence, bank, source.consignmentMargin.base, source.consignmentMargin.limit, baseline.toFixed(2), new Decimal(reserve || 0).toFixed(2), available]], snapshot: { employeeId: context.user.employeeId, scope: statement.run.scope, statementId: statement.id, statementHash: payrollSnapshotHash(statement), margin: source.consignmentMargin, baseline: baseline.toFixed(2), reserved: reserve?.toString() || "0", supplierId: supplier.id, reference, nextCompetence } };
}

export async function buildFunctionalDocumentSource(context: AppContext, input: FunctionalDocumentInput, policy: DocumentLayoutPolicy): Promise<FunctionalDocumentSource> {
  const executor = context.database ?? db;
  if (input.kind === "IRRF_ANUAL") return annualIncome(context, input, policy);
  if (input.kind === "MARGEM") return marginSource(context, input, policy);
  if (["RECIBO_FERIAS", "TERMO_RESCISAO"].includes(input.kind)) {
    if (!input.statementId) throw new Error("Selecione o demonstrativo correspondente.");
    const statement = await getPayrollStatement(executor, input.statementId, context.user.employeeId!);
    const source = (await portalStatements(executor, sql`s.id=${statement.id}`))[0];
    if (!source) throw new Error("Registro não encontrado.");
    let finalitySourceId: string | undefined;
    let finalityProof: { proofVersionId: string; proofHash: string } | undefined;
    const fields: Record<string, string> = { matricula: statement.contract.registration, situacao: source.contract.status };
    if (source.run.status !== "FECHADA" || statement.payrollType !== (input.kind === "RECIBO_FERIAS" ? "Férias" : "Rescisão")) throw new Error("Documento exige cálculo oficial fechado do tipo correspondente.");
    if (source.run.scope !== "PRODUCAO") throw new Error("Documento definitivo exige fonte de produção.");
    if (statement.specialPayroll?.estimated === true) {
      const finality = await portalEvent(executor, sql`"sourceKey"=${`RH:CALCULO_ESPECIAL_DEFINITIVO:${statement.id}`}`);
      finalitySourceId = finality?.id;
      const proof = z.object({ statementHash: z.string(), proofVersionId: z.string(), proofHash: z.string() }).safeParse(finality?.payload);
      if (finality?.status !== "PROCESSADO" || !proof.success || proof.data.statementHash !== payrollSnapshotHash(source) || !await portalFirst<{ id: string }>(executor, sql`SELECT v.id FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" WHERE v.id=${proof.data.proofVersionId} AND v."hashSha256"=${proof.data.proofHash} AND v.status='SIGNED' AND d.status IN ('Válido','Assinado') LIMIT 1`)) throw new Error("Conclua a conferência definitiva RH com documento assinado antes de emitir a fonte especial.");
      finalityProof = { proofVersionId: proof.data.proofVersionId, proofHash: proof.data.proofHash };
    }
    const rows = statement.items.map(item => [item.code, item.name, item.type, item.value]);
    if (input.kind === "RECIBO_FERIAS") {
      const reservations = z.object({ vacationReservations: z.object({ entries: z.array(z.object({ entryId: z.string(), vacationId: z.string(), start: z.string(), end: z.string(), acquisitionStart: z.string(), acquisitionEnd: z.string(), days: z.number() })).min(1) }) }).parse(statement.specialPayroll).vacationReservations;
      for (const reservation of reservations.entries) {
        const vacation = await portalFirst<PortalVacation>(executor, sql`SELECT * FROM "Vacation" WHERE id=${reservation.vacationId} AND "employeeId"=${context.user.employeeId!} AND status IN ('Programada','Em gozo','Concluída') LIMIT 1`);
        if (!vacation || !vacation.enjoymentStart || date(vacation.enjoymentStart) !== reservation.start || !vacation.enjoymentEnd || date(vacation.enjoymentEnd) !== reservation.end || await portalFirst<{ id: string }>(executor, sql`SELECT id FROM "HrRightEntry" WHERE "contractId"=${source.contractId} AND details->>'cancelsId'=${reservation.entryId} LIMIT 1`)) throw new Error("Gozo de origem cancelado ou alterado após o cálculo.");
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
  const contract = (await portalContracts(executor, sql`id=${input.contractId} AND "employeeId"=${context.user.employeeId!}`))[0];
  if (!contract) throw new AccessError("Contrato indisponível.", 404);
  const from = new Date(`${input.from}T00:00:00Z`), until = new Date(`${input.until}T23:59:59.999Z`);
  if (input.until > date(new Date())) throw new Error("Declarações de serviço não certificam períodos futuros.");
  const periods = await portalRows<FunctionalScope & { sourceReference: string }>(executor, sql`SELECT p.* FROM "HrEmployeeFunctionalPeriod" p WHERE p."employeeId"=${context.user.employeeId} AND p."budgetUnitId"=${policy.budgetUnitId} AND p."contractReference" IN (${contract.id},${contract.registration}) AND p."startsAt"<=${until} AND p."endsAt">${from} AND NOT p.voided AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) ORDER BY p."startsAt",p.id`);
  if (!periods.length) throw new Error("História funcional canônica do vínculo/período não cadastrada.");
  const expectedFrom = new Date(Math.max(from.getTime(), contract.admittedAt.getTime()));
  const expectedUntil = new Date(Math.min(until.getTime(), contract.endsAt ? contract.endsAt.getTime() + day - 1 : until.getTime()));
  const expectedDays = Math.floor((new Date(date(expectedUntil)).getTime() - new Date(date(expectedFrom)).getTime()) / day) + 1;
  if (expectedDays > 0 && recognizedServiceDays(periods, [], expectedFrom, expectedUntil) !== expectedDays) throw new Error("Complete os dias sem história funcional RH no intervalo do vínculo antes da declaração.");
  const revision = resolveContractRevision(contract, contract.revisions, { start: until, end: until });
  const history = input.kind === "MAGISTERIO" ? periods.filter(period => policy.teachingRoleIds.includes(period.roleId)) : periods;
  if (input.kind === "MAGISTERIO" && !history.length) throw new Error("Sem período de efetivo exercício classificado como magistério na política RH.");
  const leaves = await portalRows<PortalLeave>(executor, sql`SELECT * FROM "Leave" WHERE "employeeId"=${context.user.employeeId!} AND status IN ('Ativa','Concluída') AND "startDate"<=${until} AND "endDate">=${from} ORDER BY id`);
  if (input.kind !== "DECLARACAO_VINCULO" && leaves.some(leave => !policy.leaveCounting.some(rule => rule.type === leave.type))) throw new Error("Configure a contagem dos afastamentos encontrados antes de emitir a declaração de tempo.");
  const excluded = leaves.filter(leave => policy.leaveCounting.some(rule => rule.type === leave.type && !rule.counts));
  const credits = input.kind === "TEMPO_SERVICO" && policy.creditScopes.length ? await portalRights(executor, sql`e.kind='TEMPO_SERVICO' AND e."contractId"=${contract.id} AND e."periodEnd"<=${until} AND e.details->>'scope'=ANY(${sql.param(policy.creditScopes)}::text[])`, sql`e.id`) : [];
  const days = recognizedServiceDays(history, excluded, from, until) + credits.reduce((sum, credit) => sum + credit.quantity.toNumber(), 0);
  const rows = history.map(period => [date(period.startsAt), date(new Date(period.endsAt.getTime() - 1)), String(period.snapshot.role || ""), String(period.snapshot.department || ""), period.sourceReference]);
  rows.push(["TOTAL_DIAS", "", "", String(days), "Períodos distintos menos exclusões, com averbações reconhecidas quando configuradas"]);
  rows.push(["VÍNCULO", revision.contract.registration, revision.contract.status, revision.contract.workLocation, `Versão ${revision.contract.version} · referência ${input.until}`]);
  const final = periods.find(period => period.startsAt <= until && period.endsAt > until) || periods[periods.length - 1];
  return { fields: { matricula: revision.contract.registration, cargo: String(final.snapshot.role || ""), lotacao: revision.contract.workLocation, situacao: revision.contract.status, dias: String(days) }, headers: ["Início", "Fim", "Cargo histórico", "Lotação / dias", "Fonte"], rows, snapshot: { periods: history, excluded, credits, revisionId: revision.revisionId, contract: revision.contract } };
}
