import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { FinanceActor } from "./index";

const object = (value: Prisma.JsonValue | undefined): Prisma.JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const amount = (value: Prisma.Decimal | null) => { if (!value?.isFinite() || value.lt(0)) throw new Error("Transporte RAP exige valor Decimal conciliado."); return value; };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const authorize = (actor: FinanceActor, unit: string) => { if (!actor.employeeId || actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(unit)) throw new Error("Transporte RAP exige servidor responsável e UG autorizada."); };

export async function getInheritedCarryForwardSettlement(tx: Prisma.TransactionClient, payableId: string, settlementId: string) {
  const link = await tx.payableCarryForwardSettlementLink.findUnique({ where: { payableCarryForwardId_settlementId: { payableCarryForwardId: payableId, settlementId } }, include: { payableCarryForward: { include: { financialYear: true } }, sourcePayableCarryForward: true, sourceFinancialYear: true, transportAudit: true } });
  if (!link || link.status !== "ACTIVE") return null;
  const payload = object(link.transportAudit.payload ?? undefined);
  if (link.sourcePayableCarryForward.status !== "TRANSPORTADO" || link.transportAudit.financialYearId !== link.payableCarryForward.financialYearId || payload.targetFinancialYearId !== link.payableCarryForward.financialYearId) throw new Error("Parcela herdada sem transporte ativo no exercício documentado.");
  if (link.payableCarryForward.previousPayableCarryForwardId !== link.sourcePayableCarryForwardId || link.sourcePayableCarryForward.commitmentId !== link.payableCarryForward.commitmentId || link.sourcePayableCarryForward.originFinancialYearId !== link.payableCarryForward.originFinancialYearId || link.sourcePayableCarryForward.type !== link.payableCarryForward.type || link.sourceFinancialYear.status !== "Encerrado" || link.sourceFinancialYear.governmentEntityId !== link.payableCarryForward.financialYear.governmentEntityId || link.sourceFinancialYear.year + 1 !== link.payableCarryForward.financialYear.year || link.transportAudit.action !== "ANNUAL_RAP_TRANSPORT" || link.transportAudit.entityId !== payableId || payload.sourcePayableCarryForwardId !== link.sourcePayableCarryForwardId || payload.sourceFinancialYearId !== link.sourceFinancialYearId) throw new Error("Liquidação herdada sem transporte documental compatível com a inscrição.");
  return link;
}

export async function transportCarryForward(db: PrismaClient, actor: FinanceActor, input: { payableCarryForwardId: string; sourceFinancialYearId: string; targetFinancialYearId: string; reason: string; requestKey: string }) {
  if (!input.reason.trim() || !input.requestKey.trim() || input.requestKey.length > 150) throw new Error("Informe justificativa e chave documental do transporte.");
  return db.$transaction(async tx => {
    const initial = await tx.payableCarryForward.findUniqueOrThrow({ where: { id: input.payableCarryForwardId } });
    await tx.$queryRaw`SELECT id FROM "Commitment" WHERE id = ${initial.commitmentId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "PayableCarryForward" WHERE id = ${initial.id} FOR UPDATE`;
    const parent = await tx.payableCarryForward.findUniqueOrThrow({ where: { id: initial.id }, include: { financialYear: true, originFinancialYear: true, commitment: { include: { appropriation: { select: { budgetUnitId: true, financialYearId: true } } } }, inheritedSettlements: { where: { status: "ACTIVE" } }, nativePayments: { where: { status: { in: ["Emitida", "Paga"] } } }, events: { where: { action: "PAGAMENTO_RASTREADO", payment: { is: { status: "Paga", payableCarryForwardId: null } } }, include: { payment: true } } } });
    authorize(actor, parent.commitment.appropriation.budgetUnitId);
    const requestHash = createHash("sha256").update(JSON.stringify([parent.id, input.sourceFinancialYearId, input.targetFinancialYearId, input.reason.trim(), input.requestKey.trim()])).digest("hex");
    const replay = await tx.financialAuditLog.findFirst({ where: { action: "ANNUAL_RAP_TRANSPORT", AND: [{ payload: { path: ["sourcePayableCarryForwardId"], equals: parent.id } }, { payload: { path: ["requestKey"], equals: input.requestKey.trim() } }] } });
    if (replay) { if (object(replay.payload ?? undefined).requestHash !== requestHash) throw new Error("Chave de transporte já usada com outros dados."); return { payableCarryForwardId: replay.entityId, transportId: replay.id, replay: true }; }
    const [sourceYear, targetYear, binding] = await Promise.all([tx.financialYear.findUniqueOrThrow({ where: { id: input.sourceFinancialYearId } }), tx.financialYear.findUniqueOrThrow({ where: { id: input.targetFinancialYearId } }), tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: parent.commitment.appropriation.budgetUnitId } })]);
    if (targetYear.year !== sourceYear.year + 1 || sourceYear.governmentEntityId !== binding.governmentEntityId || targetYear.governmentEntityId !== binding.governmentEntityId) throw new Error("Transporte exige exercícios sequenciais do mesmo ente/UG.");
    for (const year of [sourceYear, targetYear]) for (let month = 0; month < 12; month++) { const key = `ACCOUNTING_PERIOD:${year.id}:${new Date(Date.UTC(year.year, month, 1)).toISOString()}`; await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`; }
    const currentYears = await tx.financialYear.findMany({ where: { id: { in: [sourceYear.id, targetYear.id] } } });
    if (currentYears.find(year => year.id === sourceYear.id)?.status !== "Encerrado" || currentYears.find(year => year.id === targetYear.id)?.status !== "Aberto" || targetYear.year !== sourceYear.year + 1 || sourceYear.governmentEntityId !== binding.governmentEntityId || targetYear.governmentEntityId !== binding.governmentEntityId || parent.financialYear.governmentEntityId !== binding.governmentEntityId || parent.originFinancialYear.governmentEntityId !== binding.governmentEntityId || parent.originFinancialYear.status !== "Encerrado" || parent.financialYear.year > sourceYear.year || parent.originFinancialYearId !== parent.commitment.appropriation.financialYearId) throw new Error("Transporte exige origem encerrada e destino seguinte aberto do mesmo ente/UG.");
    if (await tx.monthlyAccountingClose.count({ where: { financialYearId: targetYear.id, competence: new Date(Date.UTC(targetYear.year, 0, 1)), status: "FECHADO" } })) throw new Error("Reabra a competência de abertura do destino antes de transportar a inscrição.");
    if (!["PENDENTE", "PAGAMENTO_PARCIAL_RASTREADO"].includes(parent.status) || !["PROCESSADO", "NAO_PROCESSADO"].includes(parent.type)) throw new Error("Selecione uma inscrição pendente, sem transporte ativo posterior.");
    if (parent.nativePayments.some(payment => payment.status === "Emitida")) throw new Error("Cancele as ordens emitidas antes de transportar a inscrição.");
    if ([...parent.nativePayments, ...parent.events.flatMap(event => event.payment ? [event.payment] : [])].some(payment => payment.date > sourceYear.endDate)) throw new Error("Inscrição possui execução posterior ao exercício de transporte.");
    const paid = [...parent.nativePayments.map(payment => amount(payment.valueDecimal)), ...parent.events.map(event => amount(event.valueDecimal))].reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0));
    const outstanding = amount(parent.valueDecimal).minus(paid);
    if (outstanding.lte(0)) throw new Error("Inscrição sem saldo remanescente a transportar.");
    const settlements = await tx.settlement.findMany({ where: { commitmentId: parent.commitmentId, status: "Liquidado", OR: [{ id: { in: parent.inheritedSettlements.map(link => link.settlementId) } }, ...(parent.type === "PROCESSADO" ? [{ payableCarryForwardId: null, date: { lte: parent.originFinancialYear.endDate } }] : [{ payableCarryForwardId: parent.id }])] }, include: { executionFinancialYear: true, payments: { where: { status: { in: ["Emitida", "Paga"] } }, select: { status: true, date: true, valueDecimal: true } } } });
    if (await tx.settlement.count({ where: { commitmentId: parent.commitmentId, status: "Liquidado", date: { gt: parent.originFinancialYear.endDate }, OR: [{ payableCarryForwardId: null }, { payableCarryForward: { is: { type: parent.type } } }], NOT: { id: { in: settlements.map(settlement => settlement.id) } } } })) throw new Error("Empenho possui liquidação posterior sem vínculo documental a esta inscrição; concilie a origem antes do transporte.");
    const memories = [];
    for (const settlement of settlements) {
      if (settlement.date > sourceYear.endDate || settlement.executionFinancialYear && (settlement.executionFinancialYear.status !== "Encerrado" || settlement.executionFinancialYear.governmentEntityId !== binding.governmentEntityId) || settlement.payments.some(payment => payment.status === "Emitida" || payment.date > sourceYear.endDate)) throw new Error("Liquidação possui exercício aberto, ordem pendente ou execução posterior ao transporte.");
      const remainder = amount(settlement.valueDecimal).minus(settlement.payments.reduce((sum, payment) => sum.plus(amount(payment.valueDecimal)), new Prisma.Decimal(0)));
      if (remainder.lt(0)) throw new Error("Pagamentos excedem a liquidação original do transporte.");
      const inheritedMemory = parent.inheritedSettlements.find(link => link.settlementId === settlement.id);
      if (inheritedMemory && remainder.gt(inheritedMemory.valueDecimal)) throw new Error("Liquidação herdada excede a memória do transporte anterior; concilie os fatos posteriores.");
      if (remainder.gt(0)) memories.push({ settlementId: settlement.id, value: remainder });
    }
    const liquidated = memories.reduce((sum, memory) => sum.plus(memory.value), new Prisma.Decimal(0));
    if (liquidated.gt(outstanding) || parent.type === "PROCESSADO" && !liquidated.eq(outstanding)) throw new Error("Saldo liquidado e saldo inscrito remanescente não conciliados para transporte.");
    const existing = await tx.payableCarryForward.findUnique({ where: { previousPayableCarryForwardId: parent.id }, include: { inheritedSettlements: true } });
    let child;
    if (existing) {
      if (existing.status !== "TRANSPORTE_DESMOVIMENTADO" || existing.financialYearId !== targetYear.id || !existing.valueDecimal.eq(outstanding) || existing.inheritedSettlements.length !== memories.length || memories.some(memory => !existing.inheritedSettlements.some(link => link.settlementId === memory.settlementId && link.valueDecimal.eq(memory.value)))) throw new Error("Transporte anterior divergente ou ativo; preserve a memória documental.");
      child = await tx.payableCarryForward.update({ where: { id: existing.id }, data: { status: "PENDENTE" } });
      await tx.payableCarryForwardSettlementLink.updateMany({ where: { payableCarryForwardId: child.id }, data: { status: "ACTIVE" } });
    } else child = await tx.payableCarryForward.create({ data: { financialYearId: targetYear.id, originFinancialYearId: parent.originFinancialYearId, commitmentId: parent.commitmentId, previousPayableCarryForwardId: parent.id, valueDecimal: outstanding, type: parent.type, status: "PENDENTE", notes: `Transporte anual da inscrição ${parent.id}.` } });
    const audit = await tx.financialAuditLog.create({ data: { action: "ANNUAL_RAP_TRANSPORT", entityType: "PayableCarryForwardTransport", entityId: child.id, financialYearId: targetYear.id, budgetUnitId: parent.commitment.appropriation.budgetUnitId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: json({ sourcePayableCarryForwardId: parent.id, sourceFinancialYearId: sourceYear.id, targetFinancialYearId: targetYear.id, previousStatus: parent.status, outstanding: outstanding.toFixed(2), liquidated: liquidated.toFixed(2), requestKey: input.requestKey.trim(), requestHash, reason: input.reason.trim(), settlements: memories.map(memory => ({ settlementId: memory.settlementId, value: memory.value.toFixed(2) })) }) } });
    if (!existing) for (const memory of memories) await tx.payableCarryForwardSettlementLink.create({ data: { payableCarryForwardId: child.id, sourcePayableCarryForwardId: parent.id, settlementId: memory.settlementId, sourceFinancialYearId: sourceYear.id, transportAuditId: audit.id, valueDecimal: memory.value } });
    await tx.payableCarryForward.update({ where: { id: parent.id }, data: { status: "TRANSPORTADO" } });
    for (const [id, action] of [[parent.id, "TRANSPORTE_ANUAL_REGISTRADO"], [child.id, "TRANSPORTE_ANUAL_RECEBIDO"]]) await tx.payableCarryForwardEvent.create({ data: { payableCarryForwardId: id, action, justification: input.reason.trim(), actorUsuarioId: actor.usuarioId, valueDecimal: outstanding } });
    return { payableCarryForwardId: child.id, transportId: audit.id, replay: false };
  }, { timeout: 120000 });
}

export async function undoCarryForwardTransport(db: PrismaClient, actor: FinanceActor, input: { payableCarryForwardId: string; reason: string }) {
  if (!input.reason.trim()) throw new Error("Informe justificativa da desmovimentação do transporte.");
  return db.$transaction(async tx => {
    const initial = await tx.payableCarryForward.findUniqueOrThrow({ where: { id: input.payableCarryForwardId } });
    await tx.$queryRaw`SELECT id FROM "Commitment" WHERE id = ${initial.commitmentId} FOR UPDATE`;
    const child = await tx.payableCarryForward.findUniqueOrThrow({ where: { id: initial.id }, include: { financialYear: true, commitment: { select: { appropriation: { select: { budgetUnitId: true } } } }, successorPayableCarryForward: true } });
    authorize(actor, child.commitment.appropriation.budgetUnitId);
    const audit = await tx.financialAuditLog.findFirst({ where: { action: "ANNUAL_RAP_TRANSPORT", entityType: "PayableCarryForwardTransport", entityId: child.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (!audit || !child.previousPayableCarryForwardId) throw new Error("Selecione uma inscrição recebida por transporte anual nativo.");
    for (let month = 0; month < 12; month++) { const key = `ACCOUNTING_PERIOD:${child.financialYearId}:${new Date(Date.UTC(child.financialYear.year, month, 1)).toISOString()}`; await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`; }
    if (child.status === "TRANSPORTE_DESMOVIMENTADO") return { replay: true };
    const year = await tx.financialYear.findUniqueOrThrow({ where: { id: child.financialYearId } });
    if (year.status !== "Aberto" || await tx.monthlyAccountingClose.count({ where: { financialYearId: year.id, status: "FECHADO" } })) throw new Error("Desmovimentação exige destino aberto e competências disponíveis para recompor sua abertura.");
    const nativePayments = await tx.payment.count({ where: { payableCarryForwardId: child.id, status: { in: ["Emitida", "Paga"] } } });
    const legacyPayments = await tx.payableCarryForwardEvent.count({ where: { payableCarryForwardId: child.id, action: "PAGAMENTO_RASTREADO", payment: { is: { status: "Paga", payableCarryForwardId: null } } } });
    const settlements = await tx.settlement.count({ where: { payableCarryForwardId: child.id, status: "Liquidado" } });
    if (nativePayments || legacyPayments || settlements || child.successorPayableCarryForward && child.successorPayableCarryForward.status !== "TRANSPORTE_DESMOVIMENTADO") throw new Error("Desfaça pagamentos, liquidações e transportes posteriores antes da desmovimentação.");
    const parent = await tx.payableCarryForward.findUniqueOrThrow({ where: { id: child.previousPayableCarryForwardId } });
    const payload = object(audit.payload ?? undefined);
    if (parent.status !== "TRANSPORTADO" || payload.sourcePayableCarryForwardId !== parent.id || !["PENDENTE", "PAGAMENTO_PARCIAL_RASTREADO"].includes(String(payload.previousStatus))) throw new Error("Memória de transporte diverge da inscrição de origem.");
    await tx.payableCarryForward.update({ where: { id: child.id }, data: { status: "TRANSPORTE_DESMOVIMENTADO" } });
    await tx.payableCarryForwardSettlementLink.updateMany({ where: { payableCarryForwardId: child.id }, data: { status: "INACTIVE" } });
    await tx.payableCarryForward.update({ where: { id: parent.id }, data: { status: String(payload.previousStatus) } });
    for (const id of [parent.id, child.id]) await tx.payableCarryForwardEvent.create({ data: { payableCarryForwardId: id, action: "TRANSPORTE_ANUAL_DESMOVIMENTADO", justification: input.reason.trim(), actorUsuarioId: actor.usuarioId, valueDecimal: child.valueDecimal } });
    await tx.financialAuditLog.create({ data: { action: "ANNUAL_RAP_TRANSPORT_UNDONE", entityType: "PayableCarryForwardTransport", entityId: child.id, financialYearId: year.id, budgetUnitId: child.commitment.appropriation.budgetUnitId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { transportId: audit.id, reason: input.reason.trim() } } });
    return { replay: false };
  }, { timeout: 120000 });
}
