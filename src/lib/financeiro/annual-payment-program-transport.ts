import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { createPaymentInTransaction, type FinanceActor } from "./index";
import { transportCarryForward } from "./carry-forward-transport";
import { resolveFinancialReportScope } from "./report-scope";

const object = (value: Prisma.JsonValue | null | undefined): Prisma.JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const pendingBankStatuses = [null, "PENDING_SUBMISSION", "RECEIVED", "PENDING"];
const preparedFingerprint = (payment: { id: string; status: string; bankStatus: string | null; bankTransactionId: string | null; bankProcessedAt: Date | null; valueDecimal: Prisma.Decimal | null; netValueDecimal: Prisma.Decimal | null; settlementId: string | null; bankAccountId: string; executionFinancialYearId: string | null; payableCarryForwardId: string | null; paymentOrderExternalId: string | null; integrationEventId: string | null; date: Date }) => hash({ id: payment.id, status: payment.status, bankPending: pendingBankStatuses.includes(payment.bankStatus), bankTransactionId: payment.bankTransactionId, bankProcessedAt: payment.bankProcessedAt, value: payment.valueDecimal?.toFixed(2), net: payment.netValueDecimal?.toFixed(2), settlementId: payment.settlementId, bankAccountId: payment.bankAccountId, executionFinancialYearId: payment.executionFinancialYearId, payableCarryForwardId: payment.payableCarryForwardId, paymentOrderExternalId: payment.paymentOrderExternalId, integrationEventId: payment.integrationEventId, date: payment.date });

export async function preparedAnnualPaymentProgramIds(tx: Prisma.TransactionClient | PrismaClient, financialYearId: string) {
  const preparations = await tx.financialAuditLog.findMany({ where: { action: "ANNUAL_PAYMENT_PROGRAM_PREPARED", financialYearId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  const fingerprints = new Map<string, string>();
  for (const preparation of preparations) {
    const payload = object(preparation.payload);
    const target = typeof payload.targetFinancialYearId === "string" ? await tx.financialYear.findUnique({ where: { id: payload.targetFinancialYearId } }) : null;
    const source = await tx.financialYear.findUniqueOrThrow({ where: { id: financialYearId } });
    if (!target || target.status !== "Aberto" || target.governmentEntityId !== source.governmentEntityId || target.year !== source.year + 1 || !Array.isArray(payload.payments)) continue;
    for (const raw of payload.payments) { const row = object(raw); if (typeof row.paymentId === "string" && typeof row.fingerprint === "string" && !fingerprints.has(row.paymentId)) fingerprints.set(row.paymentId, row.fingerprint); }
  }
  if (!fingerprints.size) return [];
  const payments = await tx.payment.findMany({ where: { id: { in: [...fingerprints.keys()] }, status: "Emitida" } });
  return payments.filter(payment => pendingBankStatuses.includes(payment.bankStatus) && !payment.bankTransactionId && !payment.bankProcessedAt && preparedFingerprint(payment) === fingerprints.get(payment.id)).map(payment => payment.id);
}

/** Authorizes a documented deferral, before closing months; it never confirms a payment. */
export async function prepareAnnualPaymentPrograms(db: PrismaClient, actor: FinanceActor, input: { sourceFinancialYearId: string; targetFinancialYearId: string; paymentIds: string[]; reason: string; requestKey: string }) {
  if (!actor.employeeId || !input.reason.trim() || !input.requestKey.trim() || input.requestKey.length > 100 || !input.paymentIds.length || input.paymentIds.length > 100 || new Set(input.paymentIds).size !== input.paymentIds.length) throw new Error("Informe servidor, justificativa, chave e programações distintas para preparação.");
  return db.$transaction(async tx => {
    const sourceScope = await resolveFinancialReportScope(tx, input.sourceFinancialYearId, { budgetUnitIds: actor.allowedBudgetUnitIds });
    const targetScope = await resolveFinancialReportScope(tx, input.targetFinancialYearId, { budgetUnitIds: actor.allowedBudgetUnitIds });
    if (!sourceScope.fullEntity || !targetScope.fullEntity || !sourceScope.governmentEntityId || sourceScope.governmentEntityId !== targetScope.governmentEntityId || targetScope.year !== sourceScope.year + 1) throw new Error("Preparação exige origem/destino sequenciais do mesmo ente e autorização integral.");
    const key = `ANNUAL_PAYMENT_PROGRAM_PREPARE:${input.sourceFinancialYearId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
    const initial = await tx.payment.findMany({ where: { id: { in: input.paymentIds } }, orderBy: { id: "asc" } });
    if (initial.length !== input.paymentIds.length) throw new Error("Programação não encontrada.");
    for (const externalId of [...new Set(initial.flatMap(row => row.paymentOrderExternalId ? [row.paymentOrderExternalId] : []))].sort()) await lockPaymentBankCorrelation(tx, externalId);
    for (const payment of initial) await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;
    const source = await tx.financialYear.findUniqueOrThrow({ where: { id: input.sourceFinancialYearId } });
    for (let month = 0; month < 12; month++) { const period = `ACCOUNTING_PERIOD:${source.id}:${new Date(Date.UTC(source.year, month, 1)).toISOString()}`; await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${period}, 0))::text`; }
    const requestHash = hash({ ...input, paymentIds: [...input.paymentIds].sort(), reason: input.reason.trim(), requestKey: input.requestKey.trim() });
    const previous = await tx.financialAuditLog.findFirst({ where: { action: "ANNUAL_PAYMENT_PROGRAM_PREPARED", entityId: key, payload: { path: ["requestKey"], equals: input.requestKey.trim() } } });
    if (previous) { if (object(previous.payload).requestHash !== requestHash) throw new Error("Chave de preparação já usada com outros dados."); return { stageId: previous.id, replay: true }; }
    const target = await tx.financialYear.findUniqueOrThrow({ where: { id: input.targetFinancialYearId } });
    if (!["Aberto", "Em Encerramento"].includes((await tx.financialYear.findUniqueOrThrow({ where: { id: source.id } })).status) || target.status !== "Aberto") throw new Error("Prepare as programações antes do encerramento final, com destino aberto.");
    const payments = await tx.payment.findMany({ where: { id: { in: input.paymentIds } }, include: { financialDocument: true, commitment: { include: { appropriation: true } } }, orderBy: { id: "asc" } });
    for (const payment of payments) if (payment.status !== "Emitida" || !pendingBankStatuses.includes(payment.bankStatus) || payment.bankTransactionId || payment.bankProcessedAt || !payment.financialDocument || !payment.settlementId || !payment.valueDecimal?.isFinite() || payment.valueDecimal.lte(0) || !payment.netValueDecimal?.isFinite() || payment.netValueDecimal.lt(0) || (payment.executionFinancialYearId ?? payment.commitment.appropriation.financialYearId) !== source.id || !sourceScope.budgetUnitIds!.includes(payment.commitment.appropriation.budgetUnitId) || payment.paymentOrderExternalId !== initial.find(row => row.id === payment.id)?.paymentOrderExternalId) throw new Error("Preparação exige ordens documentadas pendentes e sem execução do exercício de origem.");
    const audit = await tx.financialAuditLog.create({ data: { action: "ANNUAL_PAYMENT_PROGRAM_PREPARED", entityType: "PaymentProgramPreparation", entityId: key, financialYearId: source.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: json({ sourceFinancialYearId: source.id, targetFinancialYearId: target.id, governmentEntityId: sourceScope.governmentEntityId, reason: input.reason.trim(), requestKey: input.requestKey.trim(), requestHash, payments: payments.map(payment => ({ paymentId: payment.id, fingerprint: preparedFingerprint(payment), sourceDocumentId: payment.financialDocument!.id, grossValue: payment.valueDecimal!.toFixed(2), netValue: payment.netValueDecimal!.toFixed(2) })) }) } });
    return { stageId: audit.id, replay: false };
  }, { timeout: 120000 });
}

/** Also acquired by bank callbacks: correlations cannot change owner while a return is applied. */
export async function lockPaymentBankCorrelation(tx: Prisma.TransactionClient, externalId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`PAYMENT_BANK_CORRELATION:${externalId}`}, 0))::text`;
}

export async function transportAnnualPaymentPrograms(db: PrismaClient, actor: FinanceActor, input: { sourceFinancialYearId: string; targetFinancialYearId: string; paymentIds: string[]; reason: string; requestKey: string }) {
  if (!actor.employeeId || !input.reason.trim() || !input.requestKey.trim() || input.requestKey.length > 100 || !input.paymentIds.length || input.paymentIds.length > 100 || new Set(input.paymentIds).size !== input.paymentIds.length) throw new Error("Informe servidor, justificativa, chave e até cem programações distintas.");
  return db.$transaction(async tx => {
    const sourceScope = await resolveFinancialReportScope(tx, input.sourceFinancialYearId, { budgetUnitIds: actor.allowedBudgetUnitIds });
    const targetScope = await resolveFinancialReportScope(tx, input.targetFinancialYearId, { budgetUnitIds: actor.allowedBudgetUnitIds });
    if (!sourceScope.fullEntity || !targetScope.fullEntity || !sourceScope.governmentEntityId || sourceScope.governmentEntityId !== targetScope.governmentEntityId || targetScope.year !== sourceScope.year + 1) throw new Error("Transporte de programações exige exercícios sequenciais do mesmo ente e autorização integral das UGs.");
    const stageKey = `ANNUAL_PAYMENT_PROGRAM:${input.targetFinancialYearId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${stageKey}, 0))::text`;
    const requestHash = hash({ ...input, paymentIds: [...input.paymentIds].sort(), reason: input.reason.trim(), requestKey: input.requestKey.trim() });
    const replay = await tx.financialAuditLog.findFirst({ where: { action: "ANNUAL_PAYMENT_PROGRAM_COMPLETE", entityId: stageKey, payload: { path: ["requestKey"], equals: input.requestKey.trim() } } });
    if (replay) { if (object(replay.payload).requestHash !== requestHash) throw new Error("Chave de programação já usada com outros dados."); return { stageId: replay.id, replay: true }; }
    const initial = await tx.payment.findMany({ where: { id: { in: input.paymentIds } }, orderBy: { id: "asc" } });
    if (initial.length !== input.paymentIds.length) throw new Error("Programação não encontrada.");
    for (const externalId of [...new Set(initial.flatMap(row => row.paymentOrderExternalId ? [row.paymentOrderExternalId] : []))].sort()) await lockPaymentBankCorrelation(tx, externalId);
    for (const payment of initial) await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;
    for (const commitmentId of [...new Set(initial.map(row => row.commitmentId))].sort()) await tx.$queryRaw`SELECT id FROM "Commitment" WHERE id = ${commitmentId} FOR UPDATE`;
    for (const payment of initial) await tx.$queryRaw`SELECT w.id FROM "WithholdingPayable" w JOIN "PaymentRetention" r ON r.id = w."retentionId" WHERE r."paymentId" = ${payment.id} ORDER BY w.id FOR UPDATE OF w`;
    const [source, target] = await Promise.all([tx.financialYear.findUniqueOrThrow({ where: { id: input.sourceFinancialYearId } }), tx.financialYear.findUniqueOrThrow({ where: { id: input.targetFinancialYearId } })]);
    for (const year of [source, target]) for (let month = 0; month < 12; month++) { const key = `ACCOUNTING_PERIOD:${year.id}:${new Date(Date.UTC(year.year, month, 1)).toISOString()}`; await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`; }
    if ((await tx.financialYear.findUniqueOrThrow({ where: { id: source.id } })).status !== "Encerrado" || (await tx.financialYear.findUniqueOrThrow({ where: { id: target.id } })).status !== "Aberto" || await tx.monthlyAccountingClose.count({ where: { financialYearId: target.id, competence: new Date(Date.UTC(target.year, 0, 1)), status: "FECHADO" } })) throw new Error("Transporte de programação exige origem encerrada e abertura disponível no destino aberto.");
    const payments = await tx.payment.findMany({ where: { id: { in: input.paymentIds } }, include: { financialDocument: true, instrumentInstallments: true, commitment: { include: { appropriation: true } }, retentions: { include: { withholdingPayable: true } } }, orderBy: { id: "asc" } });
    for (const payment of payments) {
      if (payment.status !== "Emitida" || !pendingBankStatuses.includes(payment.bankStatus) || payment.bankTransactionId || payment.bankProcessedAt || payment.reversalBankTransactionId || !payment.settlementId || !payment.financialDocument || payment.instrumentInstallments.length || !payment.valueDecimal?.isFinite() || payment.valueDecimal.lte(0) || !payment.netValueDecimal?.isFinite() || payment.netValueDecimal.lt(0) || (payment.executionFinancialYearId ?? payment.commitment.appropriation.financialYearId) !== source.id || !sourceScope.budgetUnitIds!.includes(payment.commitment.appropriation.budgetUnitId) || payment.retentions.some(row => !row.withholdingPayable || row.withholdingPayable.status !== "Pendente")) throw new Error("Selecione programações documentadas em aberto/aguardando banco do exercício de origem, sem execução ou vínculo contratual de parcela posterior.");
      if (initial.find(row => row.id === payment.id)?.paymentOrderExternalId !== payment.paymentOrderExternalId) throw new Error("Correlação bancária alterada durante o transporte; atualize a seleção.");
    }
    const totalBefore = await tx.treasuryMovement.count();
    // The source is inactive before RAP transport, so it cannot reserve or execute twice.
    for (const payment of payments) {
      await tx.payment.update({ where: { id: payment.id }, data: { status: "Transportada", paymentOrderExternalId: null, integrationEventId: null } });
      await tx.withholdingPayable.updateMany({ where: { retention: { paymentId: payment.id }, status: "Pendente" }, data: { status: "Transportada" } });
    }
    const scopedDb = new Proxy(tx, { get(target, property) { if (property === "$transaction") return (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx); return Reflect.get(target, property); } }) as unknown as PrismaClient;
    const targetPayables = new Map<string, string>();
    const copies = [];
    for (const payment of payments) {
      const origin = payment.commitment.appropriation;
      const payableKey = `${payment.commitmentId}:${payment.payableCarryForwardId ?? "PROCESSADO"}`;
      let payableId = targetPayables.get(payableKey);
      if (!payableId) {
        const parent = payment.payableCarryForwardId ? await tx.payableCarryForward.findUniqueOrThrow({ where: { id: payment.payableCarryForwardId } }) : await tx.payableCarryForward.findFirst({ where: { commitmentId: payment.commitmentId, financialYearId: source.id, originFinancialYearId: source.id, type: "PROCESSADO", status: { in: ["PENDENTE", "TRANSPORTADO"] } } });
        if (!parent) throw new Error("Inscreva o saldo processado do empenho antes de transportar a programação.");
        const successor = parent.status === "TRANSPORTADO" ? await tx.payableCarryForward.findUnique({ where: { previousPayableCarryForwardId: parent.id } }) : null;
        if (successor) {
          if (successor.financialYearId !== target.id || !["PENDENTE", "PAGAMENTO_PARCIAL_RASTREADO"].includes(successor.status)) throw new Error("Transporte RAP existente incompatível com o destino da programação.");
          payableId = successor.id;
        } else {
          const transported = await transportCarryForward(scopedDb, actor, { payableCarryForwardId: parent.id, sourceFinancialYearId: source.id, targetFinancialYearId: target.id, reason: input.reason.trim(), requestKey: `PROGRAM:${hash([input.requestKey.trim(), parent.id])}` });
          payableId = transported.payableCarryForwardId;
        }
        targetPayables.set(payableKey, payableId);
      }
      const copy = await createPaymentInTransaction(tx, actor, { orderNumber: `OP-T${target.year}-${hash([input.requestKey.trim(), payment.id]).slice(0, 24)}`, date: target.startDate, value: payment.valueDecimal!, commitmentId: payment.commitmentId, settlementId: payment.settlementId!, bankAccountId: payment.bankAccountId, supplierId: payment.supplierId, paymentMethod: payment.paymentMethod, payableCarryForwardId: payableId });
      const copiedRetentions = await tx.paymentRetention.findMany({ where: { paymentId: copy.id } });
      const retentionKey = (row: { settlementRetentionId: string | null; type: string; valueDecimal: Prisma.Decimal }) => JSON.stringify([row.settlementRetentionId, row.type, row.valueDecimal.toFixed(2)]);
      if (!copy.netValueDecimal?.eq(payment.netValueDecimal!) || JSON.stringify(copiedRetentions.map(retentionKey).sort()) !== JSON.stringify(payment.retentions.map(retentionKey).sort())) throw new Error("A cópia altera valor líquido ou retenções da remessa original; concilie a programação antes do transporte.");
      const current = await tx.payment.update({ where: { id: copy.id }, data: { paymentOrderExternalId: payment.paymentOrderExternalId, integrationEventId: payment.integrationEventId, bankAccountExternalId: payment.bankAccountExternalId, bankStatus: payment.bankStatus, bankSubmittedAt: payment.bankSubmittedAt, bankRejectionCode: payment.bankRejectionCode, bankRejectionMessage: payment.bankRejectionMessage } });
      copies.push({ sourcePaymentId: payment.id, targetPaymentId: copy.id, payableCarryForwardId: payableId, sourceDocumentId: payment.financialDocument!.id, budgetUnitId: origin.budgetUnitId, resourceSourceId: origin.resourceSourceId, source: payment, targetFingerprint: hash(current), grossValue: payment.valueDecimal!.toFixed(2), netValue: payment.netValueDecimal!.toFixed(2), paymentOrderExternalId: payment.paymentOrderExternalId, awaitingBank: Boolean(payment.bankSubmittedAt || ["RECEIVED", "PENDING"].includes(payment.bankStatus ?? "")) });
    }
    if (await tx.treasuryMovement.count() !== totalBefore) throw new Error("Transporte de programações não pode movimentar caixa.");
    const audit = await tx.financialAuditLog.create({ data: { action: "ANNUAL_PAYMENT_PROGRAM_COMPLETE", entityType: "PaymentProgramTransport", entityId: stageKey, financialYearId: target.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: json({ sourceFinancialYearId: source.id, targetFinancialYearId: target.id, governmentEntityId: sourceScope.governmentEntityId, requestKey: input.requestKey.trim(), requestHash, reason: input.reason.trim(), copies, bankResubmitted: false }) } });
    return { stageId: audit.id, replay: false };
  }, { timeout: 120000 });
}

export async function undoAnnualPaymentPrograms(db: PrismaClient, actor: FinanceActor, input: { stageId: string; reason: string }) {
  if (!actor.employeeId || !input.reason.trim()) throw new Error("Informe servidor e justificativa da desmovimentação das programações.");
  return db.$transaction(async tx => {
    const audit = await tx.financialAuditLog.findUniqueOrThrow({ where: { id: input.stageId } });
    const data = object(audit.payload);
    if (audit.action !== "ANNUAL_PAYMENT_PROGRAM_COMPLETE" || typeof data.targetFinancialYearId !== "string" || !Array.isArray(data.copies)) throw new Error("Selecione uma edição de transporte de programações.");
    const scope = await resolveFinancialReportScope(tx, data.targetFinancialYearId, { budgetUnitIds: actor.allowedBudgetUnitIds });
    if (!scope.fullEntity || scope.governmentEntityId !== data.governmentEntityId) throw new Error("Desmovimentação de programações exige autorização integral do ente.");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${audit.entityId}, 0))::text`;
    const copies = data.copies.map(object);
    for (const externalId of [...new Set(copies.flatMap(row => typeof row.paymentOrderExternalId === "string" ? [row.paymentOrderExternalId] : []))].sort()) await lockPaymentBankCorrelation(tx, externalId);
    const ids = copies.flatMap(row => [String(row.sourcePaymentId), String(row.targetPaymentId)]).sort();
    for (const id of ids) await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${id} FOR UPDATE`;
    const targets = await tx.payment.findMany({ where: { id: { in: copies.map(row => String(row.targetPaymentId)) } }, include: { retentions: { include: { withholdingPayable: true } } } });
    for (const commitmentId of [...new Set(targets.map(row => row.commitmentId))].sort()) await tx.$queryRaw`SELECT id FROM "Commitment" WHERE id = ${commitmentId} FOR UPDATE`;
    for (const id of ids) await tx.$queryRaw`SELECT w.id FROM "WithholdingPayable" w JOIN "PaymentRetention" r ON r.id = w."retentionId" WHERE r."paymentId" = ${id} ORDER BY w.id FOR UPDATE OF w`;
    const year = await tx.financialYear.findUniqueOrThrow({ where: { id: data.targetFinancialYearId } });
    for (let month = 0; month < 12; month++) { const key = `ACCOUNTING_PERIOD:${year.id}:${new Date(Date.UTC(year.year, month, 1)).toISOString()}`; await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`; }
    if (await tx.financialAuditLog.findFirst({ where: { action: "ANNUAL_PAYMENT_PROGRAM_UNDONE", entityId: audit.id } })) return { replay: true };
    if ((await tx.financialYear.findUniqueOrThrow({ where: { id: year.id } })).status !== "Aberto" || await tx.monthlyAccountingClose.count({ where: { financialYearId: year.id, status: "FECHADO" } })) throw new Error("Desmovimentação das programações exige destino aberto sem competências fechadas.");
    for (const copy of copies) {
      const current = await tx.payment.findUniqueOrThrow({ where: { id: String(copy.targetPaymentId) } });
      const source = await tx.payment.findUniqueOrThrow({ where: { id: String(copy.sourcePaymentId) } });
      if (current.status !== "Emitida" || hash(current) !== copy.targetFingerprint || source.status !== "Transportada" || source.paymentOrderExternalId || source.integrationEventId || targets.find(row => row.id === current.id)?.retentions.some(row => row.withholdingPayable?.status !== "Pendente")) throw new Error("Programação possui retorno bancário, pagamento, cancelamento ou transporte posterior; desfaça os fatos dependentes primeiro.");
      if (await tx.treasuryMovement.count({ where: { sourceType: "PAYMENT", sourceId: current.id } })) throw new Error("Programação transportada possui execução de caixa posterior.");
    }
    for (const copy of copies) {
      const original = object(copy.source as Prisma.JsonValue);
      await tx.payment.update({ where: { id: String(copy.targetPaymentId) }, data: { status: "TRANSPORTE_DESMOVIMENTADO", paymentOrderExternalId: null, integrationEventId: null } });
      await tx.withholdingPayable.updateMany({ where: { retention: { paymentId: String(copy.targetPaymentId) } }, data: { status: "TRANSPORTE_DESMOVIMENTADO" } });
      await tx.payment.update({ where: { id: String(copy.sourcePaymentId) }, data: { status: "Emitida", paymentOrderExternalId: typeof original.paymentOrderExternalId === "string" ? original.paymentOrderExternalId : null, integrationEventId: typeof original.integrationEventId === "string" ? original.integrationEventId : null } });
      await tx.withholdingPayable.updateMany({ where: { retention: { paymentId: String(copy.sourcePaymentId) }, status: "Transportada" }, data: { status: "Pendente" } });
    }
    await tx.financialAuditLog.create({ data: { action: "ANNUAL_PAYMENT_PROGRAM_UNDONE", entityType: "PaymentProgramTransport", entityId: audit.id, financialYearId: year.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { reason: input.reason.trim(), sourceFinancialYearId: String(data.sourceFinancialYearId), targetFinancialYearId: year.id, rapTransportPreserved: true } } });
    return { replay: false };
  }, { timeout: 120000 });
}
