import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { FinanceActor } from "./index";
import { resolveFinancialReportScope } from "./report-scope";

const object = (value: Prisma.JsonValue | null | undefined): Prisma.JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Note = { kind: string; sourceId: string; originFinancialYearId: string; budgetUnitId: string; resourceSourceId: string; bankAccountId: string; value: string; title: string; sourceFingerprint: string; document: unknown };

async function lockWithholdingNotes(tx: Prisma.TransactionClient, unitIds: string[]) {
  await tx.$queryRaw`SELECT w.id FROM "WithholdingPayable" w JOIN "PaymentRetention" r ON r.id = w."retentionId" JOIN "Payment" p ON p.id = r."paymentId" JOIN "Commitment" c ON c.id = p."commitmentId" JOIN "BudgetAppropriation" a ON a.id = c."appropriationId" WHERE a."budgetUnitId" IN (${Prisma.join(unitIds)}) ORDER BY w.id FOR UPDATE OF w`;
}

/** Copies identities and documents; financial execution continues against the single canonical obligation. */
async function canonicalNotes(tx: Prisma.TransactionClient, governmentEntityId: string, unitIds: string[], endDate: Date) {
  const notes: Note[] = [];
  const retentions = await tx.withholdingPayable.findMany({ where: { status: "Pendente", retention: { payment: { status: "Paga", date: { lte: endDate }, commitment: { appropriation: { budgetUnitId: { in: unitIds } } } } } }, include: { financialDocument: true, retention: { include: { payment: { include: { financialDocument: true, commitment: { include: { appropriation: true } } } } } } }, orderBy: { id: "asc" } });
  for (const note of retentions) {
    const payment = note.retention.payment;
    const origin = payment.commitment.appropriation;
    const yearId = payment.executionFinancialYearId ?? origin.financialYearId;
    const year = await tx.financialYear.findUniqueOrThrow({ where: { id: yearId } });
    const bank = await tx.bankAccount.findUniqueOrThrow({ where: { id: payment.bankAccountId } });
    const document = note.financialDocument ?? payment.financialDocument;
    if (year.status !== "Encerrado" || year.governmentEntityId !== governmentEntityId || year.endDate > endDate || bank.budgetUnitId !== origin.budgetUnitId || !origin.resourceSourceId || !note.valueDecimal.isFinite() || note.valueDecimal.lte(0) || !document) throw new Error("Nota de retenção sem exercício encerrado, banco/UG, fonte, valor ou documento financeiro conciliados.");
    notes.push({ kind: "WITHHOLDING", sourceId: note.id, originFinancialYearId: year.id, budgetUnitId: origin.budgetUnitId, resourceSourceId: origin.resourceSourceId, bankAccountId: payment.bankAccountId, value: note.valueDecimal.toFixed(2), title: `Retenção ${note.retention.type} · ${document.title}`, sourceFingerprint: fingerprint(note), document: note });
  }
  const credits = await tx.taxRegistryEntry.findMany({ where: { category: "TAX_CREDIT", status: { not: "ESTORNADO" }, AND: [{ data: { path: ["governmentEntityId"], equals: governmentEntityId } }, { OR: unitIds.map(id => ({ data: { path: ["budgetUnitId"], equals: id } })) }] }, orderBy: { id: "asc" } });
  for (const credit of credits) {
    await tx.$queryRaw`SELECT id FROM "TaxRegistryEntry" WHERE id = ${credit.id} FOR UPDATE`;
    const current = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: credit.id } });
    if (current.status !== credit.status || fingerprint(current.data) !== fingerprint(credit.data)) throw new Error("Crédito alterado durante a conferência do transporte; atualize e tente novamente.");
    const data = object(credit.data);
    if (typeof data.financialYearId !== "string" || typeof data.budgetUnitId !== "string" || typeof data.resourceSourceId !== "string" || typeof data.bankAccountId !== "string" || typeof data.ingressMovementId !== "string" || typeof data.available !== "string") throw new Error("Crédito extraorçamentário sem origem financeira documental conciliada.");
    const ingress = await tx.treasuryMovement.findUniqueOrThrow({ where: { id: data.ingressMovementId } });
    if (ingress.sourceId !== credit.id || ingress.sourceType !== "TAX_CREDIT" || ingress.financialYearId !== data.financialYearId || ingress.bankAccountId !== data.bankAccountId || ingress.resourceSourceId !== data.resourceSourceId) throw new Error("Ingresso extraorçamentário diverge da nota de origem.");
    if (ingress.date > endDate) continue;
    const [year, bank] = await Promise.all([tx.financialYear.findUniqueOrThrow({ where: { id: data.financialYearId } }), tx.bankAccount.findUniqueOrThrow({ where: { id: data.bankAccountId } })]);
    if (year.status !== "Encerrado" || year.governmentEntityId !== governmentEntityId || year.endDate > endDate || bank.budgetUnitId !== data.budgetUnitId) throw new Error("Nota extraorçamentária fora do exercício encerrado, banco ou UG documentados.");
    const requests = await tx.taxRegistryEntry.findMany({ where: { category: "REFUND_REQUEST", status: { in: ["PENDENTE_APROVACAO", "APROVADA_AGUARDANDO_TESOURARIA"] }, data: { path: ["sourceCreditId"], equals: credit.id } }, orderBy: { id: "asc" } });
    let value = new Prisma.Decimal(data.available);
    for (const request of requests) {
      const amount = new Prisma.Decimal(String(object(request.data).amount));
      if (!amount.isFinite() || amount.lte(0)) throw new Error("Restituição reservada sem valor conciliado.");
      value = value.plus(amount);
    }
    if (!value.isFinite() || value.lt(0)) throw new Error("Saldo extraorçamentário inválido.");
    if (value.gt(0)) notes.push({ kind: "TAX_CREDIT", sourceId: credit.id, originFinancialYearId: data.financialYearId, budgetUnitId: data.budgetUnitId, resourceSourceId: data.resourceSourceId, bankAccountId: data.bankAccountId, value: value.toFixed(2), title: `Crédito extraorçamentário ${credit.id}`, sourceFingerprint: fingerprint({ credit, requests }), document: { credit, requests, ingress } });
  }
  return notes;
}

export async function executeAnnualExtraNoteTransport(db: PrismaClient, actor: FinanceActor, input: { sourceFinancialYearId: string; targetFinancialYearId: string; reason: string; requestKey: string }) {
  if (!actor.employeeId || !input.reason.trim() || !input.requestKey.trim() || input.requestKey.length > 150) throw new Error("Informe servidor, justificativa e chave documental do transporte extraorçamentário.");
  return db.$transaction(async tx => {
    const sourceScope = await resolveFinancialReportScope(tx, input.sourceFinancialYearId, { budgetUnitIds: actor.allowedBudgetUnitIds });
    const targetScope = await resolveFinancialReportScope(tx, input.targetFinancialYearId, { budgetUnitIds: actor.allowedBudgetUnitIds });
    if (!sourceScope.fullEntity || !targetScope.fullEntity || !sourceScope.governmentEntityId || sourceScope.governmentEntityId !== targetScope.governmentEntityId || targetScope.year !== sourceScope.year + 1) throw new Error("Transporte extra exige exercícios sequenciais do mesmo ente e autorização para todas as UGs.");
    const stageKey = `ANNUAL_EXTRA:${input.targetFinancialYearId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${stageKey}, 0))::text`;
    await lockWithholdingNotes(tx, sourceScope.budgetUnitIds!);
    for (const scope of [{ ...sourceScope, id: input.sourceFinancialYearId }, { ...targetScope, id: input.targetFinancialYearId }]) for (let month = 0; month < 12; month++) { const period = `ACCOUNTING_PERIOD:${scope.id}:${new Date(Date.UTC(scope.year, month, 1)).toISOString()}`; await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${period}, 0))::text`; }
    const requestHash = fingerprint({ ...input, reason: input.reason.trim(), requestKey: input.requestKey.trim() });
    const replay = await tx.financialAuditLog.findFirst({ where: { action: "ANNUAL_EXTRA_TRANSPORT_COMPLETE", entityId: stageKey, payload: { path: ["requestKey"], equals: input.requestKey.trim() } } });
    if (replay) { if (object(replay.payload).requestHash !== requestHash) throw new Error("Chave extra já usada com outros dados."); return { stageId: replay.id, replay: true }; }
    const [source, target] = await Promise.all([tx.financialYear.findUniqueOrThrow({ where: { id: input.sourceFinancialYearId } }), tx.financialYear.findUniqueOrThrow({ where: { id: input.targetFinancialYearId } })]);
    if (source.status !== "Encerrado" || target.status !== "Aberto" || await tx.monthlyAccountingClose.count({ where: { financialYearId: target.id, competence: new Date(Date.UTC(target.year, 0, 1)), status: "FECHADO" } })) throw new Error("Transporte extra exige origem encerrada e competência de abertura disponível no destino aberto.");
    const previous = await tx.financialAuditLog.findFirst({ where: { action: "ANNUAL_EXTRA_TRANSPORT_COMPLETE", entityId: stageKey }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (previous && !await tx.financialAuditLog.findFirst({ where: { action: "ANNUAL_EXTRA_TRANSPORT_UNDONE", entityId: previous.id } })) throw new Error("Desmovimente a edição extraorçamentária vigente antes de refazê-la.");
    const notes = await canonicalNotes(tx, sourceScope.governmentEntityId, sourceScope.budgetUnitIds!, source.endDate);
    const noteIds = [];
    for (const note of notes) {
      const copy = await tx.financialAuditLog.create({ data: { action: "ANNUAL_EXTRA_NOTE_COPY", entityType: "ExtraBudgetaryNote", entityId: `${target.id}:${note.kind}:${note.sourceId}:${input.requestKey.trim()}`, financialYearId: target.id, budgetUnitId: note.budgetUnitId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: json({ ...note, sourceFinancialYearId: source.id, targetFinancialYearId: target.id, reason: input.reason.trim(), stageKey, requestKey: input.requestKey.trim(), canonicalObligationId: `${note.kind}:${note.sourceId}` }) } });
      noteIds.push(copy.id);
    }
    const audit = await tx.financialAuditLog.create({ data: { action: "ANNUAL_EXTRA_TRANSPORT_COMPLETE", entityType: "ExtraBudgetaryTransport", entityId: stageKey, financialYearId: target.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: json({ sourceFinancialYearId: source.id, targetFinancialYearId: target.id, governmentEntityId: sourceScope.governmentEntityId, noteIds, requestKey: input.requestKey.trim(), requestHash, reason: input.reason.trim(), total: notes.reduce((sum, note) => sum.plus(note.value), new Prisma.Decimal(0)).toFixed(2), canonicalObligationsPreserved: true }) } });
    return { stageId: audit.id, replay: false };
  }, { timeout: 120000 });
}

export async function undoAnnualExtraNoteTransport(db: PrismaClient, actor: FinanceActor, input: { stageId: string; reason: string }) {
  if (!actor.employeeId || !input.reason.trim()) throw new Error("Informe servidor e justificativa da desmovimentação extraorçamentária.");
  return db.$transaction(async tx => {
    const audit = await tx.financialAuditLog.findUniqueOrThrow({ where: { id: input.stageId } });
    const payload = object(audit.payload);
    if (audit.action !== "ANNUAL_EXTRA_TRANSPORT_COMPLETE" || typeof payload.sourceFinancialYearId !== "string" || typeof payload.targetFinancialYearId !== "string" || !Array.isArray(payload.noteIds)) throw new Error("Selecione uma edição de transporte extraorçamentário.");
    const scope = await resolveFinancialReportScope(tx, payload.targetFinancialYearId, { budgetUnitIds: actor.allowedBudgetUnitIds });
    if (!scope.fullEntity || scope.governmentEntityId !== payload.governmentEntityId) throw new Error("Desmovimentação extra exige autorização para todas as UGs do ente.");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${audit.entityId}, 0))::text`;
    await lockWithholdingNotes(tx, scope.budgetUnitIds!);
    for (let month = 0; month < 12; month++) { const period = `ACCOUNTING_PERIOD:${payload.targetFinancialYearId}:${new Date(Date.UTC(scope.year, month, 1)).toISOString()}`; await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${period}, 0))::text`; }
    if (await tx.financialAuditLog.findFirst({ where: { action: "ANNUAL_EXTRA_TRANSPORT_UNDONE", entityId: audit.id } })) return { replay: true };
    const target = await tx.financialYear.findUniqueOrThrow({ where: { id: payload.targetFinancialYearId } });
    if (target.status !== "Aberto" || await tx.monthlyAccountingClose.count({ where: { financialYearId: target.id, status: "FECHADO" } })) throw new Error("Desmovimentação extra exige destino aberto sem competências fechadas.");
    const successor = await tx.financialAuditLog.findMany({ where: { action: "ANNUAL_EXTRA_TRANSPORT_COMPLETE", payload: { path: ["sourceFinancialYearId"], equals: target.id } } });
    for (const stage of successor) if (!await tx.financialAuditLog.findFirst({ where: { action: "ANNUAL_EXTRA_TRANSPORT_UNDONE", entityId: stage.id } })) throw new Error("Desmovimente o transporte extraorçamentário posterior primeiro.");
    const originalYear = await tx.financialYear.findUniqueOrThrow({ where: { id: payload.sourceFinancialYearId } });
    const current = await canonicalNotes(tx, scope.governmentEntityId!, scope.budgetUnitIds!, originalYear.endDate);
    for (const id of payload.noteIds) {
      if (typeof id !== "string") throw new Error("Memória extra sem identidade documental.");
      const copy = await tx.financialAuditLog.findUniqueOrThrow({ where: { id } });
      const note = object(copy.payload);
      const canonical = current.find(row => row.kind === note.kind && row.sourceId === note.sourceId);
      if (!canonical || canonical.sourceFingerprint !== note.sourceFingerprint || copy.financialYearId !== target.id || copy.action !== "ANNUAL_EXTRA_NOTE_COPY") throw new Error("Nota extra possui pagamento, restituição, compensação ou alteração posterior; desfaça os fatos dependentes antes da desmovimentação.");
    }
    await tx.financialAuditLog.create({ data: { action: "ANNUAL_EXTRA_TRANSPORT_UNDONE", entityType: "ExtraBudgetaryTransport", entityId: audit.id, financialYearId: target.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { reason: input.reason.trim(), noteIds: payload.noteIds as Prisma.InputJsonArray } } });
    return { replay: false };
  }, { timeout: 120000 });
}
