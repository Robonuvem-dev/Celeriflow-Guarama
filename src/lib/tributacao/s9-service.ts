import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { assertCemeteryTransferAllowed, assertLotCanReceiveGrave, cemeteryFeeAmount, concessionSituation, executionNext, formatCdaNumber, graveHasVacancy, internalProtocol, nextCdaVersion, occupancyStats, protestNext, sumBy, trendByMonth, validateEnrollmentEligibility, TributarioS9Error } from "./s9-engine";
import { confirmTaxPaymentInTransaction, createTaxAssessment, createTaxAssessmentInTransaction, enrollAssessmentInActiveDebt, generateTaxGuide, generateTaxGuideInTransaction } from "./index";
import { activeDebtAccessFilter, resolveTaxAssessmentScope, resolveTaxFinancialYear, taxAssessmentAccessFilter, taxAssessmentCompensatedValue, taxScopeSnapshot } from "./scope";
import { assertAccountingPeriodOpen } from "@/lib/financeiro";
import { postTaxAssessmentAdjustment, reclassifyActiveDebtInTransaction, returnActiveDebtReceivableInTransaction } from "./accrual-accounting";
import { MUNICIPALITY_LABEL, MUNICIPALITY_NAME } from "@/lib/municipality-identity";
import { lockWorkflowRows, validateBurialIdentity, validateTransferPair, validateWorkflowDate, workflowRequest } from "../cemeteries/workflow";
import { recordCemeteryFeeEvent, chargeCemeteryFeeEvent } from "../cemeteries/fees-service";

type Actor = { usuarioId: string; employeeId?: string | null; allowedBudgetUnitIds?: string[] };
const fullActor = (actor: Actor) => ({ usuarioId: actor.usuarioId, employeeId: actor.employeeId ?? null, allowedBudgetUnitIds: actor.allowedBudgetUnitIds });
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const money = (value: number | string | Prisma.Decimal) => new Prisma.Decimal(String(value)).toDecimalPlaces(2);
const code = (prefix: string) => `${prefix}-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;

async function chargeRecordedCemeteryFees(db: PrismaClient, actor: Actor, sourceType: string, sourceId: string) {
  const events = await db.cemeteryFeeEvent.findMany({ where: { sourceType, sourceId }, select: { eventKey: true } });
  for (const event of events) await chargeCemeteryFeeEvent(db, fullActor(actor), event.eventKey);
}

async function validateTaxpayer(db: PrismaClient | Prisma.TransactionClient, taxpayerId: string, label: string) {
  const taxpayer = await db.taxpayer.findUnique({ where: { id: taxpayerId }, select: { id: true, status: true } });
  if (!taxpayer || taxpayer.status !== "Ativo") throw new TributarioS9Error(`${label} deve estar vinculado a um contribuinte ativo do Cadastro Único.`);
  return taxpayer;
}

async function validateCemeteryAdditionalData(db: PrismaClient | Prisma.TransactionClient, cemeteryId: string, targetType: "LOTE" | "SEPULTURA", value?: Record<string, unknown>) {
  const fields = await db.cemeteryIdentificationField.findMany({ where: { cemeteryId, targetType, active: true } });
  const data = value ?? {};
  for (const field of fields) {
    const fieldValue = data[field.fieldKey];
    if (field.required && (fieldValue === undefined || fieldValue === null || String(fieldValue).trim() === "")) throw new TributarioS9Error(`O campo ${field.label} é obrigatório.`);
    if (fieldValue !== undefined && fieldValue !== null && field.valueType === "NUMERICO" && !Number.isFinite(Number(fieldValue))) throw new TributarioS9Error(`O campo ${field.label} deve ser numérico.`);
  }
  return json(data);
}

async function cemeteryHistory(tx: Prisma.TransactionClient, actor: Actor, targetType: "LOTE" | "SEPULTURA", targetId: string, fieldName: string, previousValue: unknown, newValue: unknown) {
  await tx.cemeteryChangeHistory.create({ data: { targetType, targetId, fieldName, previousValue: previousValue === undefined ? undefined : json(previousValue), newValue: newValue === undefined ? undefined : json(newValue), actorUsuarioId: actor.usuarioId } });
}

async function refreshCemeteryLotStatus(tx: Prisma.TransactionClient, actor: Actor, lotId?: string | null) {
  if (!lotId) return;
  await lockWorkflowRows(tx, "CemeteryLot", [lotId]);
  const lot = await tx.cemeteryLot.findUnique({ where: { id: lotId }, select: { status: true } });
  if (!lot) return;
  const occupied = await tx.taxGrave.count({ where: { lotId, occupantCount: { gt: 0 } } });
  const status = occupied ? "OCUPADO" : "LIVRE";
  if (lot.status !== status) {
    await tx.cemeteryLot.update({ where: { id: lotId }, data: { status } });
    await cemeteryHistory(tx, actor, "LOTE", lotId, "status", lot.status, status);
  }
}

async function nextSequence(tx: Prisma.TransactionClient, year: number, documentType: string) {
  const sequence = await tx.taxDocumentSequence.upsert({
    where: { year_documentType: { year, documentType } },
    create: { year, documentType, currentValue: 1 },
    update: { currentValue: { increment: 1 } },
  });
  return sequence.currentValue;
}

async function assertDebtAccess(db: PrismaClient | Prisma.TransactionClient, actor: Actor, debtId: string) {
  if (!actor.allowedBudgetUnitIds) return;
  const debt = await db.activeDebt.findFirst({ where: { id: debtId, ...activeDebtAccessFilter(actor.allowedBudgetUnitIds) }, select: { id: true, budgetUnitId: true, governmentEntityId: true } });
  if (!debt) throw new TributarioS9Error("Dívida sem origem municipal conciliada ou fora das unidades gestoras autorizadas.");
  if (debt.budgetUnitId) {
    const binding = await db.planningEntityUnit.findUnique({ where: { budgetUnitId: debt.budgetUnitId }, select: { governmentEntityId: true } });
    if (!binding || binding.governmentEntityId !== debt.governmentEntityId) throw new TributarioS9Error("O vínculo municipal da UG diverge da dívida original; concilie o histórico antes da operação.");
  }
}

async function debtEvent(tx: Prisma.TransactionClient, actor: Actor, activeDebtId: string, eventType: string, description: string, payload?: unknown) {
  await assertDebtAccess(tx, actor, activeDebtId);
  return tx.taxActiveDebtEvent.create({ data: { activeDebtId, eventType, description, payload: payload === undefined ? undefined : json(payload), actorUsuarioId: actor.usuarioId } });
}

function taxpayerName(taxpayer: { person?: { fullName?: string | null; cpf?: string | null } | null; company?: { corporateName?: string | null; cnpj?: string | null } | null } | null) {
  return taxpayer?.company?.corporateName ?? taxpayer?.person?.fullName ?? "Contribuinte";
}

function taxpayerDocument(taxpayer: { person?: { cpf?: string | null } | null; company?: { cnpj?: string | null } | null } | null) {
  return taxpayer?.company?.cnpj ?? taxpayer?.person?.cpf ?? "-";
}

// Defaults demonstrativos controlados: tributo de sepultamento, estrutura mínima de cemitério, causas e funerária.
export async function ensureS9Defaults(db: PrismaClient, actor: Actor) {
  void actor;
  const tax = await db.tax.upsert({ where: { id: "tax-sepultamento-s9" }, update: {}, create: { id: "tax-sepultamento-s9", name: "Taxa de Sepultamento", taxType: "Taxa", isActive: true } });
  const cemetery = await db.taxCemetery.upsert({ where: { code: "CEM-MUNICIPAL" }, update: {}, create: { code: "CEM-MUNICIPAL", name: `Cemitério Municipal de ${MUNICIPALITY_NAME}`, address: MUNICIPALITY_LABEL, wakePlace: "Capela municipal" } });
  const sector = await db.taxCemeterySector.upsert({ where: { cemeteryId_code: { cemeteryId: cemetery.id, code: "QUADRA-A" } }, update: {}, create: { cemeteryId: cemetery.id, code: "QUADRA-A", name: "Quadra A" } });
  for (const [code, description] of [["NATURAL", "Causa natural"], ["ACIDENTE", "Acidente"], ["VIOLENTA", "Causa violenta"], ["INFANTIL", "Óbito infantil"], ["FETAL", "Óbito fetal"], ["IGNORADA", "Causa ignorada"]] as [string, string][]) {
    await db.taxDeathCause.upsert({ where: { code }, update: {}, create: { code, description } });
  }
  await db.taxFuneralHome.upsert({ where: { id: "funeraria-s9" }, update: {}, create: { id: "funeraria-s9", name: "Funerária Paz Eterna", phone: "Não informado" } });
  await db.taxCemeteryEmployee.upsert({ where: { id: "coveiro-s9" }, update: {}, create: { id: "coveiro-s9", cemeteryId: cemetery.id, name: "Zelador do cemitério", role: "Coveiro" } });
  const feeRule = await db.cemeteryFeeRule.findFirst({ where: { cemeteryId: cemetery.id, eventType: "SEPULTAMENTO", active: true } });
  if (!feeRule) await db.cemeteryFeeRule.create({ data: { cemeteryId: cemetery.id, eventType: "SEPULTAMENTO", label: "Taxa de sepultamento", formula: "VALOR_FIXO", baseAmount: new Prisma.Decimal(100) } });
  return { tax, cemetery, sector };
}

// S9-A — Débitos elegíveis com validação prévia (TRI-340/341). Reutiliza lançamentos e dívida existentes.
export async function listEnrollmentCandidates(db: PrismaClient, allowedBudgetUnitIds?: string[]) {
  const assessments = await db.taxAssessment.findMany({
    where: { status: { in: ["Lançado", "Emitido", "Parcial"] }, ...taxAssessmentAccessFilter(allowedBudgetUnitIds) },
    include: { tax: { select: { name: true } }, activeDebt: { select: { id: true } }, taxpayer: { include: { person: { include: { addresses: true } }, company: { include: { addresses: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return assessments.map((row) => {
    const taxpayer = row.taxpayer;
    const addresses = [...(taxpayer.person?.addresses ?? []), ...(taxpayer.company?.addresses ?? [])];
    const check = validateEnrollmentEligibility({
      taxpayerActive: taxpayer.status === "Ativo",
      hasIdentification: Boolean(taxpayer.person || taxpayer.company),
      hasAddress: addresses.length > 0,
      debtStatus: row.status,
      debtValue: row.finalValueDecimal ?? row.originalValueDecimal ?? row.originalValue,
      alreadyEnrolled: Boolean(row.activeDebt),
      suspended: false,
    });
    return { id: row.id, number: row.assessmentNumber ?? row.id, taxpayerId: row.taxpayerId, taxpayer: taxpayerName(taxpayer), origin: row.tax.name, year: row.year, value: Number(row.finalValueDecimal ?? row.originalValueDecimal ?? row.originalValue), status: row.status, eligible: check.eligible, reasons: check.reasons, enrolledDebtId: row.activeDebt?.id ?? null };
  });
}

// Inscrição a partir de lançamento: reaproveita o motor existente, que devolve a dívida atual sem duplicar.
export async function enrollAssessmentDebt(db: PrismaClient, actor: Actor, assessmentId: string) {
  const debt = await enrollAssessmentInActiveDebt(db, fullActor(actor), assessmentId);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ActiveDebt" WHERE id = ${debt.id} FOR UPDATE`;
    await assertDebtAccess(tx, actor, debt.id);
    const previous = await tx.taxActiveDebtEvent.findFirst({ where: { activeDebtId: debt.id, eventType: "INSCRICAO" }, select: { id: true } });
    if (!previous) await debtEvent(tx, actor, debt.id, "INSCRICAO", `Débito inscrito em dívida ativa a partir do lançamento ${assessmentId}.`, { assessmentId });
  });
  return debt;
}

// Inscrição manual/arquivo com chave de origem idempotente: mesma origem nunca cria segunda dívida.
export async function enrollManualDebt(db: PrismaClient, actor: Actor, input: { taxpayerId: string; originDebtType: string; year: number; value: number; sourceKey: string; competence?: Date; budgetUnitId?: string }) {
  if (!input.sourceKey.trim()) throw new TributarioS9Error("A chave de origem é obrigatória para inscrição manual/arquivo.");
  const key = input.sourceKey.trim();
  const budgetUnitId = input.budgetUnitId?.trim();
  if (!budgetUnitId || (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(budgetUnitId))) throw new TributarioS9Error("Selecione a UG municipal autorizada de origem da dívida.");
  if (!Number.isInteger(input.year) || input.year < 1900 || input.year > new Date().getUTCFullYear()) throw new TributarioS9Error("Exercício de origem da dívida inválido.");
  if (input.competence && (!Number.isFinite(input.competence.valueOf()) || input.competence.getUTCFullYear() !== input.year)) throw new TributarioS9Error("Competência da dívida deve pertencer ao exercício de origem.");
  const taxpayer = await db.taxpayer.findUnique({ where: { id: input.taxpayerId } });
  if (!taxpayer || taxpayer.status !== "Ativo") throw new TributarioS9Error("Contribuinte ativo é obrigatório.");
  const value = money(input.value);
  if (value.lessThanOrEqualTo(0)) throw new TributarioS9Error("Valor do débito inválido.");
  const debt = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`DA:MANUAL:${key}`}, 0))::text`;
    const binding = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId }, select: { governmentEntityId: true } });
    const existing = await tx.activeDebt.findUnique({ where: { sourceKey: key } });
    if (existing) {
      await assertDebtAccess(tx, actor, existing.id);
      if (existing.budgetUnitId !== budgetUnitId || existing.governmentEntityId !== binding.governmentEntityId || existing.taxpayerId !== input.taxpayerId || existing.originDebtType !== (input.originDebtType.trim() || "Débito manual") || existing.year !== input.year || !existing.originalValueDecimal?.eq(value)) throw new TributarioS9Error("Origem da dívida já inscrita com outros dados; preserve e concilie o registro anterior.");
      const enrollment = await tx.taxActiveDebtEvent.findFirst({ where: { activeDebtId: existing.id, eventType: "INSCRICAO" }, orderBy: { createdAt: "asc" }, select: { payload: true } });
      if (!enrollment || (taxScopeSnapshot(enrollment.payload).competence ?? null) !== (input.competence?.toISOString() ?? null)) throw new TributarioS9Error("Competência da inscrição anterior diverge da repetição da origem.");
      return { debt: existing, created: false as const };
    }
    const created = await tx.activeDebt.create({ data: { taxpayerId: taxpayer.id, originDebtType: input.originDebtType.trim() || "Débito manual", year: input.year, budgetUnitId, governmentEntityId: binding.governmentEntityId, originalValue: Number(value), originalValueDecimal: value, updatedValue: Number(value), updatedValueDecimal: value, sourceKey: key, status: "PENDENTE_DE_VALIDACAO" } });
    await debtEvent(tx, actor, created.id, "INSCRICAO", `Inscrição manual/arquivo registrada com chave ${key}.`, { sourceKey: key, competence: input.competence ?? null });
    return { debt: created, created: true as const };
  });
  return debt;
}

export async function validateDebt(db: PrismaClient, actor: Actor, debtId: string) {
  return db.$transaction(async (tx) => {
    const debt = await tx.activeDebt.findUnique({ where: { id: debtId }, include: { taxpayer: { include: { person: { include: { addresses: true } }, company: { include: { addresses: true } } } } } });
    if (!debt) throw new TributarioS9Error("Dívida não encontrada.");
    const addresses = [...(debt.taxpayer.person?.addresses ?? []), ...(debt.taxpayer.company?.addresses ?? [])];
    const suspensions = await tx.taxDebtSuspension.findMany({ where: { activeDebtId: debt.id, status: "VIGENTE" }, select: { id: true } });
    const check = validateEnrollmentEligibility({
      taxpayerActive: debt.taxpayer.status === "Ativo",
      hasIdentification: Boolean(debt.taxpayer.person || debt.taxpayer.company),
      hasAddress: addresses.length > 0,
      debtStatus: debt.status === "PENDENTE_DE_VALIDACAO" ? "Lançado" : debt.status,
      debtValue: debt.updatedValueDecimal ?? debt.updatedValue,
      alreadyEnrolled: false,
      suspended: suspensions.length > 0,
    });
    if (!check.eligible) throw new TributarioS9Error(`Validação reprovada: ${check.reasons.join(" ")}`);
    const updated = await tx.activeDebt.update({ where: { id: debt.id }, data: { status: "VALIDADA" } });
    await debtEvent(tx, actor, debt.id, "VALIDACAO", "Débito validado para inscrição com cadastro suficiente.", { reasons: [] });
    return updated;
  });
}

function cdaSnapshot(debt: { id: string; originDebtType: string; year: number; originalValueDecimal: unknown; updatedValueDecimal: unknown; taxpayerId: string }, taxpayer: { name: string; document: string }, cdaNumber: string, version: number) {
  return json({ cdaNumber, version, debtId: debt.id, origin: debt.originDebtType, year: debt.year, originalValue: String(debt.originalValueDecimal), updatedValue: String(debt.updatedValueDecimal), taxpayerId: debt.taxpayerId, taxpayer, scope: "CERTIDAO_DIVIDA_ATIVA" });
}

// Emissão da CDA com numeração sequencial e primeira versão (TRI-347/349).
export async function issueCda(db: PrismaClient, actor: Actor, debtId: string) {
  return db.$transaction(async (tx) => {
    const origin = await tx.activeDebt.findUniqueOrThrow({ where: { id: debtId }, select: { assessmentId: true } });
    if (origin.assessmentId) await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id = ${origin.assessmentId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ActiveDebt" WHERE id = ${debtId} FOR UPDATE`;
    await assertDebtAccess(tx, actor, debtId);
    const debt = await tx.activeDebt.findUnique({ where: { id: debtId }, include: { taxpayer: { include: { person: true, company: true } } } });
    if (!debt) throw new TributarioS9Error("Dívida não encontrada.");
    if (!["VALIDADA", "PENDENTE_DE_VALIDACAO", "INSCRITA"].includes(debt.status)) throw new TributarioS9Error("Dívida fora do estágio de emissão de CDA.");
    if (debt.cdaNumber) {
      await reclassifyActiveDebtInTransaction(tx, fullActor(actor), debt.id, new Date());
      return tx.activeDebt.findUniqueOrThrow({ where: { id: debt.id } });
    }
    const sequence = await nextSequence(tx, debt.year, "CDA");
    const cdaNumber = formatCdaNumber(debt.year, sequence);
    const taxpayer = { name: taxpayerName(debt.taxpayer), document: taxpayerDocument(debt.taxpayer) };
    const updated = await tx.activeDebt.update({ where: { id: debt.id }, data: { cdaNumber, status: "INSCRITA" } });
    await tx.taxCdaVersion.create({ data: { activeDebtId: debt.id, versionNumber: 1, cdaNumber, contentSnapshot: cdaSnapshot(debt, taxpayer, cdaNumber, 1) } });
    await reclassifyActiveDebtInTransaction(tx, fullActor(actor), debt.id, new Date());
    await debtEvent(tx, actor, debt.id, "CDA_EMITIDA", `CDA ${cdaNumber} emitida (versão 1).`, { cdaNumber });
    return updated;
  }, { timeout: 60000 });
}

export async function annotateCda(db: PrismaClient, actor: Actor, input: { debtId: string; annotation: string }) {
  if (!input.annotation.trim()) throw new TributarioS9Error("Informe a anotação da CDA.");
  return db.$transaction(async (tx) => {
    const latest = await tx.taxCdaVersion.findFirst({ where: { activeDebtId: input.debtId }, orderBy: { versionNumber: "desc" } });
    if (!latest) throw new TributarioS9Error("Emita a CDA antes de anotar.");
    const updated = await tx.taxCdaVersion.update({ where: { id: latest.id }, data: { annotation: input.annotation.trim() } });
    await debtEvent(tx, actor, input.debtId, "CDA_ANOTADA", input.annotation.trim(), { version: latest.versionNumber });
    return updated;
  });
}

// Versionamento: nova versão preserva o conteúdo anterior (TRI-348/383).
export async function createCdaVersion(db: PrismaClient, actor: Actor, debtId: string) {
  return db.$transaction(async (tx) => {
    const debt = await tx.activeDebt.findUnique({ where: { id: debtId }, include: { taxpayer: { include: { person: true, company: true } } } });
    if (!debt?.cdaNumber) throw new TributarioS9Error("Emita a CDA antes de versionar.");
    const count = await tx.taxCdaVersion.count({ where: { activeDebtId: debt.id } });
    const version = nextCdaVersion(count);
    const taxpayer = { name: taxpayerName(debt.taxpayer), document: taxpayerDocument(debt.taxpayer) };
    const created = await tx.taxCdaVersion.create({ data: { activeDebtId: debt.id, versionNumber: version, cdaNumber: debt.cdaNumber, contentSnapshot: cdaSnapshot(debt, taxpayer, debt.cdaNumber, version) } });
    await debtEvent(tx, actor, debt.id, "CDA_VERSIONADA", `CDA versionada para a versão ${version} sem reutilizar numeração.`, { version });
    return created;
  });
}

// Assinatura registrada como interna: sem ICP-Brasil configurado, sem presunção oficial (TRI-384/385).
export async function signCdaInternal(db: PrismaClient, actor: Actor, versionId: string) {
  const version = await db.taxCdaVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new TributarioS9Error("Versão de CDA não encontrada.");
  await assertDebtAccess(db, actor, version.activeDebtId);
  if (version.signatureStatus !== "NAO_ASSINADA") return version;
  return db.$transaction(async (tx) => {
    const updated = await tx.taxCdaVersion.update({ where: { id: version.id }, data: { signatureStatus: "ASSINATURA_INTERNA", signedByUsuarioId: actor.usuarioId, signedAt: new Date() } });
    await debtEvent(tx, actor, version.activeDebtId, "OBSERVACAO", "CDA assinada internamente; certificação ICP-Brasil não configurada.", { version: version.versionNumber });
    return updated;
  });
}

// Carteiras de dívida ativa com atualização (TRI-342/343).
export async function createDaPortfolio(db: PrismaClient, actor: Actor, input: { name: string; minValue?: number; statuses?: string[] }) {
  const debts = await db.activeDebt.findMany({ where: { status: { in: input.statuses?.length ? input.statuses : ["INSCRITA", "VALIDADA", "EM_COBRANCA"] }, ...activeDebtAccessFilter(actor.allowedBudgetUnitIds) }, orderBy: { createdAt: "asc" }, take: 300 });
  const eligible = debts.filter((row) => Number(row.updatedValueDecimal ?? row.updatedValue) >= (input.minValue ?? 0));
  if (!eligible.length) throw new TributarioS9Error("Nenhuma dívida elegível para a carteira.");
  return db.taxDaPortfolio.create({
    data: { name: input.name.trim() || "Carteira de dívida ativa", criteria: json({ minValue: input.minValue ?? 0, statuses: input.statuses ?? [], createdAt: new Date() }), createdByUsuarioId: actor.usuarioId, items: { create: eligible.map((row) => ({ activeDebtId: row.id, outstandingDecimal: row.updatedValueDecimal ?? row.updatedValue })) } },
    include: { items: true },
  });
}

export async function refreshDaPortfolio(db: PrismaClient, portfolioId: string, actor?: Actor) {
  return db.$transaction(async (tx) => {
    const items = await tx.taxDaPortfolioItem.findMany({ where: { portfolioId } });
    if (actor?.allowedBudgetUnitIds && !items.length) throw new TributarioS9Error("Carteira sem itens municipais conciliados para o escopo autorizado.");
    if (actor) for (const item of items) await assertDebtAccess(tx, actor, item.activeDebtId);
    for (const item of items) {
      const debt = await tx.activeDebt.findUnique({ where: { id: item.activeDebtId }, select: { updatedValueDecimal: true, updatedValue: true, status: true } });
      if (!debt) { await tx.taxDaPortfolioItem.delete({ where: { id: item.id } }); continue; }
      if (["PAGA", "CANCELADA", "BAIXADA", "BAIXADA_PRESCRICAO", "DEVOLVIDA"].includes(debt.status)) { await tx.taxDaPortfolioItem.delete({ where: { id: item.id } }); continue; }
      await tx.taxDaPortfolioItem.update({ where: { id: item.id }, data: { outstandingDecimal: debt.updatedValueDecimal ?? debt.updatedValue } });
    }
    return tx.taxDaPortfolioItem.count({ where: { portfolioId } });
  });
}

// DAM da dívida inscrita pelo motor de guias (TRI-353/354).
export async function issueDaGuide(db: PrismaClient, actor: Actor, input: { debtId: string; dueDate: Date }) {
  if (!Number.isFinite(input.dueDate.valueOf())) throw new TributarioS9Error("Vencimento da guia inválido.");
  return db.$transaction(async tx => {
    const origin = await tx.activeDebt.findUniqueOrThrow({ where: { id: input.debtId }, select: { assessmentId: true } });
    if (origin.assessmentId) await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id = ${origin.assessmentId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ActiveDebt" WHERE id = ${input.debtId} FOR UPDATE`;
    await assertDebtAccess(tx, actor, input.debtId);
    const debt = await tx.activeDebt.findUniqueOrThrow({ where: { id: input.debtId } });
    if (!debt.cdaNumber || !["INSCRITA", "Inscrita", "EM_COBRANCA", "EM_PROTESTO", "AJUIZADA"].includes(debt.status)) throw new TributarioS9Error("A guia exige CDA emitida e dívida disponível para cobrança.");
    let assessmentId = debt.assessmentId;
    if (!assessmentId) {
      const taxes = await tx.tax.findMany({ where: { name: debt.originDebtType, isActive: true }, select: { id: true } });
      if (taxes.length !== 1) throw new TributarioS9Error(`Concilie um único tributo ativo para a origem "${debt.originDebtType}".`);
      if (!debt.updatedValueDecimal || debt.updatedValueDecimal.lte(0)) throw new TributarioS9Error("Dívida manual sem saldo Decimal conciliado.");
      const assessment = await createTaxAssessmentInTransaction(tx, fullActor(actor), { year: debt.year, taxId: taxes[0].id, taxpayerId: debt.taxpayerId, taxableBase: debt.updatedValueDecimal, rate: 100, competence: new Date(Date.UTC(debt.year, 0, 1, 12)) }, { legacyDebtOriginId: debt.id });
      assessmentId = assessment.id;
      await tx.activeDebt.update({ where: { id: debt.id }, data: { assessmentId } });
    }
    const existing = await tx.taxGuide.findFirst({ where: { assessmentId, status: { not: "Cancelada" } } });
    if (existing) {
      if (existing.dueDate.getTime() !== input.dueDate.getTime()) throw new TributarioS9Error("A dívida já possui guia com outro vencimento; cancele-a formalmente antes de reemitir.");
      return existing;
    }
    const guide = await generateTaxGuideInTransaction(tx, fullActor(actor), { assessmentId, dueDate: input.dueDate });
    await debtEvent(tx, actor, debt.id, "GUIA_EMITIDA", "DAM emitida pela origem nativa da dívida, sem duplicar constituição histórica.", { assessmentId, guideId: guide.id });
    return guide;
  }, { timeout: 60000 });
}

export async function suspendDebt(db: PrismaClient, actor: Actor, input: { debtId: string; reason: string; legalGround?: string; endsAt?: Date }) {
  if (!input.reason.trim()) throw new TributarioS9Error("Informe o motivo da suspensão.");
  return db.$transaction(async (tx) => {
    const suspension = await tx.taxDebtSuspension.create({ data: { activeDebtId: input.debtId, reason: input.reason.trim(), legalGround: input.legalGround?.trim() || null, endsAt: input.endsAt || null, createdByUsuarioId: actor.usuarioId } });
    await tx.activeDebt.update({ where: { id: input.debtId }, data: { status: "SUSPENSA" } });
    await debtEvent(tx, actor, input.debtId, "SUSPENSAO", input.reason.trim(), { suspensionId: suspension.id });
    return suspension;
  });
}

export async function resumeDebt(db: PrismaClient, actor: Actor, debtId: string) {
  return db.$transaction(async (tx) => {
    await tx.taxDebtSuspension.updateMany({ where: { activeDebtId: debtId, status: "VIGENTE" }, data: { status: "ENCERRADA" } });
    const updated = await tx.activeDebt.update({ where: { id: debtId }, data: { status: "INSCRITA" } });
    await debtEvent(tx, actor, debtId, "SUSPENSAO_ENCERRADA", "Suspensão encerrada; cobrança retomada.");
    return updated;
  });
}

// Devolução ao órgão de origem sem apagar o histórico (TRI-359).
export async function returnDebtToOrigin(db: PrismaClient, actor: Actor, input: { debtId: string; reason: string }) {
  if (!input.reason.trim()) throw new TributarioS9Error("Informe o motivo da devolução.");
  return db.$transaction(async (tx) => {
    const origin = await tx.activeDebt.findUniqueOrThrow({ where: { id: input.debtId }, select: { assessmentId: true } });
    if (origin.assessmentId) await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id = ${origin.assessmentId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ActiveDebt" WHERE id = ${input.debtId} FOR UPDATE`;
    await assertDebtAccess(tx, actor, input.debtId);
    const debt = await tx.activeDebt.findUniqueOrThrow({ where: { id: input.debtId } });
    if (debt.status === "DEVOLVIDA") {
      const event = await tx.taxActiveDebtEvent.findFirst({ where: { activeDebtId: debt.id, eventType: "DEVOLUCAO_ORIGEM" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      if (!event || event.description !== input.reason.trim()) throw new TributarioS9Error("Dívida já devolvida com outro motivo ou sem histórico conciliado.");
      return debt;
    }
    if (!["VALIDADA", "INSCRITA", "Inscrita", "EM_COBRANCA", "PENDENTE_DE_VALIDACAO"].includes(debt.status)) throw new TributarioS9Error("Devolução exige dívida disponível na cobrança administrativa; concilie os estágios posteriores antes da devolução.");
    if (debt.assessmentId && await tx.taxGuide.count({ where: { assessmentId: debt.assessmentId, status: { notIn: ["Cancelada", "Paga"] } } })) throw new TributarioS9Error("Cancele as guias abertas antes de devolver a dívida à origem.");
    const position = await returnActiveDebtReceivableInTransaction(tx, fullActor(actor), debt.id, new Date(), input.reason);
    const updated = await tx.activeDebt.update({ where: { id: input.debtId }, data: { status: "DEVOLVIDA" } });
    if (debt.assessmentId) await tx.taxAssessment.update({ where: { id: debt.assessmentId }, data: { status: "Revisado" } });
    await debtEvent(tx, actor, input.debtId, "DEVOLUCAO_ORIGEM", input.reason.trim(), { registryEntryId: position?.id ?? null });
    return updated;
  }, { timeout: 60000 });
}

// Pagamento da dívida inscrita pela guia confirmada no motor (TRI-360).
export async function settleDebtByGuide(db: PrismaClient, actor: Actor, input: { debtId: string; guideId: string; amount: number; paymentMethod: string; idempotencyKey: string }) {
  return db.$transaction(async (tx) => {
    const originGuide = await tx.taxGuide.findUniqueOrThrow({ where: { id: input.guideId } });
    await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id = ${originGuide.assessmentId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "TaxGuide" WHERE id = ${input.guideId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ActiveDebt" WHERE id = ${input.debtId} FOR UPDATE`;
    const debt = await tx.activeDebt.findUniqueOrThrow({ where: { id: input.debtId } });
    if (!debt.assessmentId || originGuide.assessmentId !== debt.assessmentId) throw new TributarioS9Error("A guia não pertence ao lançamento da dívida selecionada.");
    const previous = await tx.taxPayment.findUnique({ where: { idempotencyKey: input.idempotencyKey.trim() } });
    if (!previous && !["INSCRITA", "Inscrita", "EM_COBRANCA", "Parcelada", "PARCELADA", "EM_PROTESTO", "AJUIZADA"].includes(debt.status)) throw new TributarioS9Error("Dívida suspensa, devolvida ou baixada não admite novo pagamento por este fluxo.");
    if (previous?.status !== undefined && previous.status !== "Confirmado") throw new TributarioS9Error("Pagamento anterior estornado; utilize uma nova operação fundamentada.");
    const guide = await confirmTaxPaymentInTransaction(tx, fullActor(actor), { guideId: input.guideId, amountPaid: input.amount, paymentDate: previous?.paymentDate ?? new Date(), paymentMethod: input.paymentMethod, idempotencyKey: input.idempotencyKey });
    const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: debt.assessmentId } });
    const payments = await tx.taxPayment.findMany({ where: { guide: { assessmentId: debt.assessmentId }, status: "Confirmado" }, select: { amountPaidDecimal: true } });
    if (payments.some(payment => !payment.amountPaidDecimal)) throw new TributarioS9Error("Pagamento legado sem valor Decimal conciliado.");
    const total = assessment.finalValueDecimal ?? assessment.originalValueDecimal;
    if (!total) throw new TributarioS9Error("Dívida sem posição Decimal do lançamento original.");
    const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Prisma.Decimal(0)).plus(await taxAssessmentCompensatedValue(tx, assessment.id));
    const remaining = Prisma.Decimal.max(0, total.minus(paid));
    const updated = await tx.activeDebt.update({ where: { id: debt.id }, data: { status: remaining.isZero() ? "PAGA" : ["EM_PROTESTO", "AJUIZADA"].includes(debt.status) ? debt.status : "EM_COBRANCA", updatedValue: Number(remaining), updatedValueDecimal: remaining } });
    if (!previous) await debtEvent(tx, actor, debt.id, "PAGAMENTO", `Baixa de R$ ${money(input.amount).toFixed(2)} pela guia ${guide.guideNumber ?? guide.id}.`, { guideId: guide.id, paymentKey: input.idempotencyKey, remaining: remaining.toFixed(2) });
    return updated;
  }, { timeout: 60000 });
}

// Baixa manual justificada (TRI-361) e automática por prescrição (TRI-362).
async function extinguishDebt(tx: Prisma.TransactionClient, actor: Actor, debtId: string, reason: string, cause: "MANUAL" | "PRESCRIPTION") {
  const origin = await tx.activeDebt.findUniqueOrThrow({ where: { id: debtId }, select: { assessmentId: true } });
  if (!origin.assessmentId) throw new TributarioS9Error("Extinção exige lançamento de origem conciliado; regularize a dívida manual antes da baixa.");
  await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id = ${origin.assessmentId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "ActiveDebt" WHERE id = ${debtId} FOR UPDATE`;
  await assertDebtAccess(tx, actor, debtId);
  const debt = await tx.activeDebt.findUniqueOrThrow({ where: { id: debtId } });
  const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: origin.assessmentId } });
  const key = `DA:${debtId}:EXTINCTION:${cause}`;
  const previous = await tx.taxIntegrationEvent.findUnique({ where: { idempotencyKey: key } });
  if (previous) {
    const payload = taxScopeSnapshot(previous.payload);
    if (payload.reason !== reason.trim() || payload.assessmentId !== assessment.id) throw new TributarioS9Error("Baixa da dívida já registrada com outros dados.");
    return debt;
  }
  if (!["INSCRITA", "Inscrita", "VALIDADA", "EM_COBRANCA", "EM_PROTESTO", "AJUIZADA"].includes(debt.status)) throw new TributarioS9Error("Dívida fora do estágio de extinção; concilie suspensão, parcelamento ou baixa anterior.");
  if (await tx.taxGuide.count({ where: { assessmentId: assessment.id, status: { notIn: ["Cancelada", "Paga"] } } })) throw new TributarioS9Error("Cancele as guias abertas antes da extinção da dívida.");
  const scope = await resolveTaxAssessmentScope(tx, fullActor(actor), assessment.taxId, assessment.calculationSnapshot);
  const date = new Date();
  const year = await resolveTaxFinancialYear(tx, date.getUTCFullYear(), scope);
  await assertAccountingPeriodOpen(tx, year.id, date);
  const payments = await tx.taxPayment.findMany({ where: { guide: { assessmentId: assessment.id }, status: "Confirmado" }, select: { amountPaidDecimal: true } });
  if (payments.some(payment => !payment.amountPaidDecimal)) throw new TributarioS9Error("Arrecadação histórica sem Decimal conciliado.");
  const extinguished = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Prisma.Decimal(0)).plus(await taxAssessmentCompensatedValue(tx, assessment.id));
  const total = assessment.finalValueDecimal ?? assessment.originalValueDecimal;
  if (!total) throw new TributarioS9Error("Dívida sem valor Decimal do lançamento de origem.");
  const balance = total.minus(extinguished);
  if (balance.lte(0)) throw new TributarioS9Error("Dívida já extinta por pagamento ou compensação; não crie segunda extinção.");
  const transaction = await postTaxAssessmentAdjustment(tx, fullActor(actor), { assessmentId: assessment.id, date, delta: balance.negated(), kind: "EXTINCTION", idempotencyKey: `${key}:ACCOUNTING`, reason: reason.trim() });
  const entry = await tx.taxRegistryEntry.create({ data: { entityType: "TAX_ASSESSMENT", entityId: assessment.id, category: "CREDIT_EVENT", title: cause === "MANUAL" ? "Extinção por baixa fundamentada da dívida" : "Extinção por prescrição da dívida", status: "ATIVO", source: "DIVIDA_ATIVA", actorUsuarioId: actor.usuarioId, data: { ...scope, eventType: "EXTINCAO_NAO_FINANCEIRA", cause, debtId, amount: balance.toFixed(2), oldValue: total.toFixed(2), newValue: extinguished.toFixed(2), reducesAssessmentValue: true, reason: reason.trim(), operationFinancialYearId: year.id, accountingTransactionId: transaction?.id ?? null } } });
  await tx.taxAssessment.update({ where: { id: assessment.id }, data: { finalValueDecimal: extinguished, status: "Extinto", calculationSnapshot: { ...taxScopeSnapshot(assessment.calculationSnapshot), currentValue: extinguished.toFixed(2), lastExtinctionKey: key } } });
  const updated = await tx.activeDebt.update({ where: { id: debtId }, data: { status: cause === "MANUAL" ? "BAIXADA" : "BAIXADA_PRESCRICAO", updatedValue: 0, updatedValueDecimal: 0 } });
  await tx.taxIntegrationEvent.create({ data: { integrationCode: "ACTIVE_DEBT", eventType: "EXTINCAO_NAO_FINANCEIRA", idempotencyKey: key, status: "PROCESSADO", evidenceLevel: "L1", taxpayerId: assessment.taxpayerId, payload: { debtId, assessmentId: assessment.id, cause, reason: reason.trim(), ...scope }, result: { registryEntryId: entry.id, accountingTransactionId: transaction?.id ?? null, extinguishedAmount: balance.toFixed(2) }, processedAt: date } });
  await debtEvent(tx, actor, debtId, cause === "MANUAL" ? "BAIXA_MANUAL" : "BAIXA_PRESCRICAO", reason.trim(), { registryEntryId: entry.id, accountingTransactionId: transaction?.id ?? null, amount: balance.toFixed(2) });
  return updated;
}

export async function writeOffDebt(db: PrismaClient, actor: Actor, input: { debtId: string; reason: string }) {
  if (!input.reason.trim()) throw new TributarioS9Error("A baixa manual exige justificativa.");
  return db.$transaction(tx => extinguishDebt(tx, actor, input.debtId, input.reason, "MANUAL"), { timeout: 60000 });
}

export async function runPrescription(db: PrismaClient, actor: Actor, years = 5) {
  if (!Number.isInteger(years) || years < 1) throw new TributarioS9Error("Prazo prescricional inválido.");
  const limit = new Date();
  limit.setUTCFullYear(limit.getUTCFullYear() - years);
  const debts = await db.activeDebt.findMany({ where: { status: { in: ["INSCRITA", "VALIDADA", "EM_COBRANCA"] }, createdAt: { lt: limit }, ...activeDebtAccessFilter(actor.allowedBudgetUnitIds) }, select: { id: true } });
  for (const row of debts) {
    await db.$transaction(async (tx) => {
      await extinguishDebt(tx, actor, row.id, `Baixa por prazo prescricional parametrizado (${years} anos), sujeita à conferência municipal da exigibilidade.`, "PRESCRIPTION");
    }, { timeout: 60000 });
  }
  return { count: debts.length, years };
}

// Livro de dívida ativa por exercício e origem (TRI-351) e relatórios gerenciais (TRI-365/403..407).
export async function daBook(db: PrismaClient, year?: number, allowedBudgetUnitIds?: string[]) {
  const debts = await db.activeDebt.findMany({ where: { ...(year ? { year } : {}), ...activeDebtAccessFilter(allowedBudgetUnitIds) }, include: { taxpayer: { include: { person: true, company: true } } }, orderBy: [{ year: "asc" }, { createdAt: "asc" }], take: 500 });
  return debts.map((row) => ({ id: row.id, year: row.year, cda: row.cdaNumber ?? "SEM CDA", origin: row.originDebtType, taxpayer: taxpayerName(row.taxpayer), original: Number(row.originalValueDecimal ?? row.originalValue), updated: Number(row.updatedValueDecimal ?? row.updatedValue), status: row.status }));
}

// S9-B — Protesto com status internos e retorno controlado (TRI-373..380/386).
export async function selectProtestCandidates(db: PrismaClient, allowedBudgetUnitIds?: string[]) {
  const open = await db.taxProtestItem.findMany({ where: { status: { in: ["SELECIONADA", "REMESSA_PREPARADA", "EM_ACOMPANHAMENTO"] } }, select: { activeDebtId: true } });
  const busy = new Set(open.map((row) => row.activeDebtId));
  const debts = await db.activeDebt.findMany({ where: { status: { in: ["INSCRITA", "EM_COBRANCA"] }, cdaNumber: { not: null }, ...activeDebtAccessFilter(allowedBudgetUnitIds) }, include: { taxpayer: { include: { person: true, company: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  return debts.filter((row) => !busy.has(row.id)).map((row) => ({ id: row.id, cda: row.cdaNumber!, taxpayer: taxpayerName(row.taxpayer), value: Number(row.updatedValueDecimal ?? row.updatedValue), status: row.status }));
}

export async function createProtestBatch(db: PrismaClient, actor: Actor, debtIds: string[]) {
  if (!debtIds.length) throw new TributarioS9Error("Selecione ao menos uma CDA.");
  return db.$transaction(async (tx) => {
    const debts = await tx.activeDebt.findMany({ where: { id: { in: debtIds }, status: { in: ["INSCRITA", "EM_COBRANCA"] }, cdaNumber: { not: null } }, include: { taxpayer: { include: { person: true, company: true } } } });
    if (debts.length !== debtIds.length) throw new TributarioS9Error("Somente CDAs inscritas participam da seleção.");
    const sequence = await nextSequence(tx, new Date().getUTCFullYear(), "PROTESTO");
    const batchNumber = `PROT-${new Date().getUTCFullYear()}-${String(sequence).padStart(5, "0")}`;
    const batch = await tx.taxProtestBatch.create({
      data: {
        batchNumber, status: "PREPARADA", createdByUsuarioId: actor.usuarioId,
        fileContent: json({ batchNumber, generatedAt: new Date(), layout: "REMESSA_INTERNA_CONTROLADA", scope: "SEM_CONVENIO — retorno controlado, sem protesto efetivado presumido", items: debts.map((row) => ({ debtId: row.id, cda: row.cdaNumber, taxpayer: taxpayerName(row.taxpayer), document: taxpayerDocument(row.taxpayer), value: String(row.updatedValueDecimal ?? row.updatedValue) })) }),
        items: { create: debts.map((row) => ({ activeDebtId: row.id, status: protestNext("SELECIONADA", "PREPARAR_REMESSA") })) },
      },
      include: { items: true },
    });
    for (const row of debts) {
      await tx.activeDebt.update({ where: { id: row.id }, data: { status: "EM_PROTESTO" } });
      await debtEvent(tx, actor, row.id, "PROTESTO", `CDA incluída na remessa interna ${batchNumber}.`, { batchId: batch.id });
    }
    return batch;
  });
}

export async function registerProtestReturn(db: PrismaClient, actor: Actor, input: { batchId: string; returns: { itemId: string; code: string; message: string }[] }) {
  if (!input.returns.length) throw new TributarioS9Error("Informe ao menos um item para o retorno do protesto.");
  return db.$transaction(async (tx) => {
    if (actor.allowedBudgetUnitIds) {
      const items = await tx.taxProtestItem.findMany({ where: { batchId: input.batchId }, select: { activeDebtId: true } });
      if (!items.length) throw new TributarioS9Error("Lote de protesto sem itens municipais conciliados.");
      for (const item of items) await assertDebtAccess(tx, actor, item.activeDebtId);
    }
    for (const row of input.returns) {
      const item = await tx.taxProtestItem.findFirst({ where: { id: row.itemId, batchId: input.batchId } });
      if (!item) throw new TributarioS9Error("Item de protesto não encontrado no lote.");
      const status = protestNext(item.status, "REGISTRAR_RETORNO");
      await tx.taxProtestItem.update({ where: { id: item.id }, data: { status, returnCode: row.code, returnMessage: row.message } });
      await debtEvent(tx, actor, item.activeDebtId, "PROTESTO", `Retorno controlado do cartório: ${row.code} — ${row.message}.`, { batchId: input.batchId, code: row.code });
    }
    const open = await tx.taxProtestItem.count({ where: { batchId: input.batchId, status: "REMESSA_PREPARADA" } });
    await tx.taxProtestBatch.update({ where: { id: input.batchId }, data: { status: open ? "RETORNO_PARCIAL" : "RETORNO_TOTAL" } });
    return tx.taxProtestBatch.findUniqueOrThrow({ where: { id: input.batchId }, include: { items: true } });
  });
}

export async function resolveProtestItem(db: PrismaClient, actor: Actor, input: { itemId: string; action: "BAIXAR_PAGAMENTO" | "CANCELAR" | "ANUIR"; reason: string }) {
  if (!input.reason.trim()) throw new TributarioS9Error("Informe a justificativa.");
  return db.$transaction(async (tx) => {
    const item = await tx.taxProtestItem.findUnique({ where: { id: input.itemId } });
    if (!item) throw new TributarioS9Error("Item de protesto não encontrado.");
    const status = protestNext(item.status, input.action === "BAIXAR_PAGAMENTO" ? "BAIXAR_PAGAMENTO" : input.action === "CANCELAR" ? "CANCELAR" : "ANUIR");
    const updated = await tx.taxProtestItem.update({ where: { id: item.id }, data: { status, resolvedAt: new Date(), consentIssuedAt: input.action === "ANUIR" ? new Date() : undefined } });
    if (input.action === "BAIXAR_PAGAMENTO") {
      const debt = await tx.activeDebt.findUnique({ where: { id: item.activeDebtId } });
      if (!debt?.assessmentId) throw new TributarioS9Error("Baixa de protesto por pagamento exige lançamento e arrecadação nativa conciliados.");
      await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id = ${debt.assessmentId} FOR UPDATE`;
      const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: debt.assessmentId } });
      const payments = await tx.taxPayment.findMany({ where: { guide: { assessmentId: debt.assessmentId }, status: "Confirmado" }, select: { amountPaidDecimal: true } });
      if (payments.some(payment => !payment.amountPaidDecimal)) throw new TributarioS9Error("Arrecadação histórica sem Decimal conciliado.");
      const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Prisma.Decimal(0)).plus(await taxAssessmentCompensatedValue(tx, debt.assessmentId));
      const total = assessment.finalValueDecimal ?? assessment.originalValueDecimal;
      if (!total || total.lte(0) || paid.lt(total)) throw new TributarioS9Error("Receba ou compense integralmente a dívida pela origem financeira antes de baixar o protesto por pagamento.");
      await tx.activeDebt.update({ where: { id: item.activeDebtId }, data: { status: "PAGA", updatedValue: 0, updatedValueDecimal: new Prisma.Decimal(0) } });
      if (debt?.assessmentId) await tx.taxAssessment.update({ where: { id: debt.assessmentId }, data: { status: "Pago" } });
      await debtEvent(tx, actor, item.activeDebtId, "PAGAMENTO", `Protesto baixado por pagamento: ${input.reason.trim()}.`, { itemId: item.id });
    } else if (input.action === "CANCELAR") {
      await tx.activeDebt.update({ where: { id: item.activeDebtId }, data: { status: "INSCRITA" } });
      await debtEvent(tx, actor, item.activeDebtId, "PROTESTO", `Protesto cancelado/desistido: ${input.reason.trim()}.`, { itemId: item.id });
    } else {
      await debtEvent(tx, actor, item.activeDebtId, "PROTESTO", `Carta de anuência emitida: ${input.reason.trim()}.`, { itemId: item.id, consent: true });
    }
    return updated;
  });
}

// S9-C — Execução fiscal com protocolo interno (TRI-346/388..398). Sem TJES: sem processo oficial presumido.
export async function createExecutionBatch(db: PrismaClient, actor: Actor, input: { debtIds: string[]; prosecutor: string }) {
  if (!input.prosecutor.trim()) throw new TributarioS9Error("Informe o procurador responsável.");
  if (!input.debtIds.length) throw new TributarioS9Error("Selecione ao menos uma CDA para o lote.");
  return db.$transaction(async (tx) => {
    const year = new Date().getUTCFullYear();
    const sequence = await nextSequence(tx, year, "EXECUCAO");
    const batchNumber = `EXEC-${year}-${String(sequence).padStart(5, "0")}`;
    const protocolSequence = await nextSequence(tx, year, "PROTOCOLO_EXECUCAO");
    const batch = await tx.taxExecutionBatch.create({ data: { batchNumber, internalProtocol: internalProtocol("EXEC", year, protocolSequence), prosecutor: input.prosecutor.trim(), createdByUsuarioId: actor.usuarioId } });
    for (const debtId of input.debtIds) {
      await openExecutionCaseTx(tx, actor, { debtId, batchId: batch.id, prosecutor: input.prosecutor.trim(), attorneyReference: "", attachments: [] });
    }
    return tx.taxExecutionBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { cases: true } });
  });
}

async function openExecutionCaseTx(tx: Prisma.TransactionClient, actor: Actor, input: { debtId: string; batchId?: string; prosecutor: string; attorneyReference: string; attachments: unknown[] }) {
  const debt = await tx.activeDebt.findUnique({ where: { id: input.debtId }, include: { taxpayer: { include: { person: true, company: true } } } });
  if (!debt?.cdaNumber) throw new TributarioS9Error("Somente CDA emitida segue para execução.");
  if (!["INSCRITA", "EM_COBRANCA", "EM_PROTESTO"].includes(debt.status)) throw new TributarioS9Error("Dívida fora do estágio de execução.");
  const year = new Date().getUTCFullYear();
  const sequence = await nextSequence(tx, year, "PROCESSO_EXECUCAO");
  const internalProtocolNumber = internalProtocol("EXEC", year, sequence);
  const snapshot = json({ debtId: debt.id, cda: debt.cdaNumber, taxpayer: taxpayerName(debt.taxpayer), value: String(debt.updatedValueDecimal ?? debt.updatedValue), prosecutor: input.prosecutor, attorneyReference: input.attorneyReference, attachments: input.attachments, scope: "PROTOCOLO_INTERNO" });
  const executionCase = await tx.taxExecutionCase.create({ data: { batchId: input.batchId || null, activeDebtId: debt.id, internalProtocol: internalProtocolNumber, prosecutor: input.prosecutor, attorneyReference: input.attorneyReference || null, attachments: json(input.attachments), caseSnapshot: snapshot, createdByUsuarioId: actor.usuarioId, events: { create: { eventType: "ABERTURA", description: `Peças reunidas para ${input.prosecutor}. Protocolo interno ${internalProtocolNumber}.`, actorUsuarioId: actor.usuarioId } } } });
  await tx.activeDebt.update({ where: { id: debt.id }, data: { status: "AJUIZADA" } });
  await debtEvent(tx, actor, debt.id, "EXECUCAO", `Execução aberta sob protocolo interno ${internalProtocolNumber}.`, { caseId: executionCase.id });
  return executionCase;
}

export async function openExecutionCase(db: PrismaClient, actor: Actor, input: { debtId: string; prosecutor: string; attorneyReference?: string; attachments?: unknown[] }) {
  if (!input.prosecutor.trim()) throw new TributarioS9Error("Informe o procurador responsável.");
  return db.$transaction(async (tx) => openExecutionCaseTx(tx, actor, { debtId: input.debtId, prosecutor: input.prosecutor.trim(), attorneyReference: input.attorneyReference?.trim() ?? "", attachments: input.attachments ?? [] }));
}

export async function advanceExecutionCase(db: PrismaClient, actor: Actor, input: { caseId: string; action: "ENVIAR_PROCURADORIA" | "DEVOLVER" | "REGISTRAR_PROTOCOLO" | "ACOMPANHAR" | "REGISTRAR_RETORNO" | "REABRIR" | "ENCERRAR"; description: string }) {
  if (!input.description.trim()) throw new TributarioS9Error("Descreva o andamento.");
  return db.$transaction(async (tx) => {
    const executionCase = await tx.taxExecutionCase.findUnique({ where: { id: input.caseId } });
    if (!executionCase) throw new TributarioS9Error("Caso de execução não encontrado.");
    const status = executionNext(executionCase.status, input.action);
    const updated = await tx.taxExecutionCase.update({ where: { id: executionCase.id }, data: { status, events: { create: { eventType: input.action === "ENVIAR_PROCURADORIA" ? "ENVIO_PROCURADORIA" : input.action === "REGISTRAR_PROTOCOLO" ? "PROTOCOLO" : input.action === "REGISTRAR_RETORNO" ? "RETORNO" : input.action === "ENCERRAR" ? "ENCERRAMENTO" : "ANDAMENTO", description: input.description.trim(), actorUsuarioId: actor.usuarioId } } } });
    await debtEvent(tx, actor, executionCase.activeDebtId, "EXECUCAO", input.description.trim(), { caseId: executionCase.id, status });
    return updated;
  });
}

// MNI como registro interno controlado: sem credencial TJES, sem envio oficial presumido (TRI-389).
export async function registerMni(db: PrismaClient, actor: Actor, caseId: string) {
  return db.$transaction(async (tx) => {
    const executionCase = await tx.taxExecutionCase.findUnique({ where: { id: caseId } });
    if (!executionCase) throw new TributarioS9Error("Caso de execução não encontrado.");
    const status = executionNext(executionCase.status, "REGISTRAR_MNI");
    const year = new Date().getUTCFullYear();
    const sequence = await nextSequence(tx, year, "MNI");
    const updated = await tx.taxExecutionCase.update({ where: { id: executionCase.id }, data: { status, mniStatus: "MNI_REGISTRO_INTERNO", events: { create: { eventType: "MNI", description: `Registro MNI interno ${internalProtocol("MNI", year, sequence)}; adaptador interno, sem credencial TJES.`, payload: json({ adapter: "INTERNAL_ADAPTER", reference: internalProtocol("MNI", year, sequence) }), actorUsuarioId: actor.usuarioId } } } });
    await debtEvent(tx, actor, executionCase.activeDebtId, "EXECUCAO", "Intercâmbio MNI registrado internamente.", { caseId });
    return updated;
  });
}

export async function scheduleHearing(db: PrismaClient, actor: Actor, input: { caseId: string; date: Date; notes?: string }) {
  return db.$transaction(async (tx) => {
    const executionCase = await tx.taxExecutionCase.findUniqueOrThrow({ where: { id: input.caseId }, select: { activeDebtId: true } });
    await assertDebtAccess(tx, actor, executionCase.activeDebtId);
    const updated = await tx.taxExecutionCase.update({ where: { id: input.caseId }, data: { nextHearingAt: input.date, hearingNotes: input.notes?.trim() || null, events: { create: { eventType: "AUDIENCIA", description: `Agenda do procurador: ${input.date.toLocaleString("pt-BR")}${input.notes?.trim() ? ` — ${input.notes.trim()}` : ""}.`, actorUsuarioId: actor.usuarioId } } } });
    return updated;
  });
}

// S9-D — Cemitérios com taxas pelo motor tributário (TRI-408..436).
export async function createCemetery(db: PrismaClient, input: { code: string; name: string; address?: string; phone?: string; wakePlace?: string; observations?: string }) {
  if (!input.code.trim() || !input.name.trim()) throw new TributarioS9Error("Código e nome do cemitério são obrigatórios.");
  return db.taxCemetery.create({ data: { code: input.code.trim().toUpperCase(), name: input.name.trim(), address: input.address?.trim() || null, phone: input.phone?.trim() || null, wakePlace: input.wakePlace?.trim() || null, observations: input.observations?.trim() || null } });
}

export async function createSector(db: PrismaClient, input: { cemeteryId: string; parentId?: string; code: string; name: string }) {
  if (!input.code.trim() || !input.name.trim()) throw new TributarioS9Error("Código e nome do setor são obrigatórios.");
  return db.taxCemeterySector.create({ data: { cemeteryId: input.cemeteryId, parentId: input.parentId || null, code: input.code.trim().toUpperCase(), name: input.name.trim() } });
}

export async function createGrave(db: PrismaClient, actor: Actor, input: { cemeteryId: string; sectorId?: string; lotId?: string; code: string; graveType: string; capacity?: number; ownerTaxpayerId?: string; additionalData?: Record<string, unknown>; notes?: string }) {
  if (!input.code.trim()) throw new TributarioS9Error("Identificação da sepultura é obrigatória.");
  if (!input.lotId) throw new TributarioS9Error("Vincule a sepultura a um lote.");
  if (!["COVA", "CARNEIRA", "GAVETA", "JAZIGO", "OSSARIO"].includes(input.graveType)) throw new TributarioS9Error("Tipo de sepultura inválido.");
  if (input.graveType === "GAVETA" && !input.ownerTaxpayerId) throw new TributarioS9Error("Lóculo exige proprietário do Cadastro Único.");
  const capacity = input.capacity ?? 1;
  if (!Number.isInteger(capacity) || capacity < 1) throw new TributarioS9Error("Capacidade inválida.");
  return db.$transaction(async (tx) => {
    if (input.ownerTaxpayerId) await validateTaxpayer(tx, input.ownerTaxpayerId, "O proprietário do lóculo");
    if (input.lotId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.lotId}))`;
      await lockWorkflowRows(tx, "CemeteryLot", [input.lotId]);
      const lot = await tx.cemeteryLot.findUnique({ where: { id: input.lotId }, include: { _count: { select: { graves: true } } } });
      if (!lot || lot.cemeteryId !== input.cemeteryId || !lot.active) throw new TributarioS9Error("Lote ativo não encontrado no cemitério informado.");
      assertLotCanReceiveGrave(lot._count.graves, lot.graveLimit);
    }
    if (input.sectorId && !await tx.taxCemeterySector.count({ where: { id: input.sectorId, cemeteryId: input.cemeteryId } })) throw new TributarioS9Error("Quadra fora do cemitério informado.");
    const additionalData = await validateCemeteryAdditionalData(tx, input.cemeteryId, "SEPULTURA", input.additionalData);
    const grave = await tx.taxGrave.create({ data: { cemeteryId: input.cemeteryId, sectorId: input.sectorId || null, lotId: input.lotId || null, code: input.code.trim().toUpperCase(), graveType: input.graveType, capacity, ownerTaxpayerId: input.ownerTaxpayerId || null, additionalData, notes: input.notes?.trim() || null } });
    await cemeteryHistory(tx, actor, "SEPULTURA", grave.id, "*", null, { code: grave.code, graveType: grave.graveType, capacity: grave.capacity, lotId: grave.lotId });
    return grave;
  });
}

export async function registerEmployee(db: PrismaClient, input: { cemeteryId: string; name: string; role: string; phone?: string }) {
  if (!input.name.trim() || !input.role.trim()) throw new TributarioS9Error("Nome e função são obrigatórios.");
  return db.taxCemeteryEmployee.create({ data: { cemeteryId: input.cemeteryId, name: input.name.trim(), role: input.role.trim(), phone: input.phone?.trim() || null } });
}

export async function registerFuneralHome(db: PrismaClient, input: { name: string; cnpj?: string; phone?: string; ownershipType?: "PUBLICA" | "PRIVADA" }) {
  if (!input.name.trim()) throw new TributarioS9Error("Nome da funerária é obrigatório.");
  return db.taxFuneralHome.create({ data: { name: input.name.trim(), cnpj: input.cnpj?.trim() || null, phone: input.phone?.trim() || null, ownershipType: input.ownershipType ?? "PRIVADA" } });
}

export async function createDeathCause(db: PrismaClient, input: { code: string; description: string }) {
  if (!input.code.trim() || !input.description.trim()) throw new TributarioS9Error("Código e descrição da causa são obrigatórios.");
  return db.taxDeathCause.create({ data: { code: input.code.trim().toUpperCase(), description: input.description.trim() } });
}

export async function createCemeteryChapel(db: PrismaClient, input: { cemeteryId: string; name: string; address?: string; personTaxpayerId?: string; responsibleTaxpayerId: string }) {
  if (!input.name.trim()) throw new TributarioS9Error("Nome da capela é obrigatório.");
  if (!input.personTaxpayerId) throw new TributarioS9Error("Pessoa vinculada à capela é obrigatória.");
  await validateTaxpayer(db, input.responsibleTaxpayerId, "O responsável pela capela");
  if (input.personTaxpayerId) await validateTaxpayer(db, input.personTaxpayerId, "A pessoa vinculada à capela");
  return db.cemeteryChapel.create({ data: { cemeteryId: input.cemeteryId, name: input.name.trim(), address: input.address?.trim() || null, personTaxpayerId: input.personTaxpayerId || null, responsibleTaxpayerId: input.responsibleTaxpayerId } });
}

export async function createCemeteryOssuary(db: PrismaClient, input: { cemeteryId: string; code: string; address: string; ownerTaxpayerId?: string; capacity?: number }) {
  const capacity = input.capacity ?? 1;
  if (!input.code.trim() || !input.address.trim() || !Number.isInteger(capacity) || capacity < 1) throw new TributarioS9Error("Código, endereço e capacidade válida são obrigatórios para o ossuário.");
  if (input.ownerTaxpayerId) await validateTaxpayer(db, input.ownerTaxpayerId, "O proprietário do ossuário");
  return db.cemeteryOssuary.create({ data: { cemeteryId: input.cemeteryId, code: input.code.trim().toUpperCase(), address: input.address.trim(), ownerTaxpayerId: input.ownerTaxpayerId || null, capacity } });
}

export async function createCemeteryIdentificationField(db: PrismaClient, input: { cemeteryId: string; targetType: "LOTE" | "SEPULTURA"; fieldKey: string; label: string; valueType: "DESCRITIVO" | "NUMERICO"; required?: boolean }) {
  const fieldKey = input.fieldKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!fieldKey || !input.label.trim()) throw new TributarioS9Error("Chave e rótulo do campo são obrigatórios.");
  return db.cemeteryIdentificationField.create({ data: { cemeteryId: input.cemeteryId, targetType: input.targetType, fieldKey, label: input.label.trim(), valueType: input.valueType, required: input.required ?? false } });
}

export async function createCemeteryLot(db: PrismaClient, actor: Actor, input: { cemeteryId: string; identifier: string; ownerTaxpayerId: string; graveLimit: number; additionalData?: Record<string, unknown> }) {
  if (!input.identifier.trim() || !Number.isInteger(input.graveLimit) || input.graveLimit < 1) throw new TributarioS9Error("Identificador e limite de sepulturas válido são obrigatórios.");
  const result = await db.$transaction(async (tx) => {
    await validateTaxpayer(tx, input.ownerTaxpayerId, "O proprietário do lote");
    const additionalData = await validateCemeteryAdditionalData(tx, input.cemeteryId, "LOTE", input.additionalData);
    const lot = await tx.cemeteryLot.create({ data: { cemeteryId: input.cemeteryId, identifier: input.identifier.trim().toUpperCase(), ownerTaxpayerId: input.ownerTaxpayerId, graveLimit: input.graveLimit, additionalData } });
    await cemeteryHistory(tx, actor, "LOTE", lot.id, "*", null, { identifier: lot.identifier, ownerTaxpayerId: lot.ownerTaxpayerId, graveLimit: lot.graveLimit });
    await recordCemeteryFeeEvent(tx, { eventType: "ACQUISICAO_LOTE", sourceType: "LOTE", sourceId: lot.id });
    return lot;
  });
  await chargeRecordedCemeteryFees(db, actor, "LOTE", result.id);
  return result;
}

export async function setCemeteryEntityActive(db: PrismaClient, actor: Actor, input: { targetType: "LOTE" | "SEPULTURA"; targetId: string; active: boolean }) {
  return db.$transaction(async (tx) => {
    if (input.targetType === "LOTE") {
      await lockWorkflowRows(tx, "CemeteryLot", [input.targetId]);
      const current = await tx.cemeteryLot.findUnique({ where: { id: input.targetId } });
      if (!current) throw new TributarioS9Error("Lote não encontrado.");
      if (!input.active && await tx.cemeteryProcess.count({ where: { grave: { lotId: current.id }, status: { in: ["AGENDADO", "EM_REALIZACAO"] } } })) throw new TributarioS9Error("Lote possui atendimento pendente.");
      const updated = await tx.cemeteryLot.update({ where: { id: current.id }, data: { active: input.active } });
      await cemeteryHistory(tx, actor, "LOTE", current.id, "active", current.active, updated.active);
      return updated;
    }
    await lockWorkflowRows(tx, "TaxGrave", [input.targetId]);
    const current = await tx.taxGrave.findUnique({ where: { id: input.targetId } });
    if (!current) throw new TributarioS9Error("Sepultura não encontrada.");
    if (!input.active && current.occupantCount > 0) throw new TributarioS9Error("Não é possível desativar uma sepultura ocupada.");
    if (!input.active && await tx.cemeteryProcess.count({ where: { graveId: current.id, status: { in: ["AGENDADO", "EM_REALIZACAO"] } } })) throw new TributarioS9Error("Sepultura possui atendimento pendente.");
    const updated = await tx.taxGrave.update({ where: { id: current.id }, data: { active: input.active } });
    await cemeteryHistory(tx, actor, "SEPULTURA", current.id, "active", current.active, updated.active);
    return updated;
  });
}

const DEATH_GROUPS = ["falecido", "nascimento", "documentos", "endereco", "obito", "local", "medico", "causas", "funeraria", "sepultamento", "observacoes"];

export async function declarantDebtSnapshot(tx: Prisma.TransactionClient | PrismaClient, taxpayerId: string) {
  const [assessments, activeDebts] = await Promise.all([
    tx.taxAssessment.findMany({ where: { taxpayerId, status: { in: ["Lançado", "Emitido", "Parcial", "Dívida Ativa"] }, activeDebt: { is: null } }, include: { guides: { include: { payments: true } } } }),
    tx.activeDebt.findMany({ where: { taxpayerId, status: { notIn: ["PAGA", "Paga", "CANCELADA", "Cancelada", "BAIXADA", "BAIXADA_PRESCRICAO", "DEVOLVIDA"] } }, select: { id: true, cdaNumber: true, status: true, updatedValue: true, updatedValueDecimal: true } }),
  ]);
  const openAssessments = assessments.map((row) => {
    const paid = row.guides.flatMap((guide) => guide.payments).filter((payment) => payment.status === "Confirmado").reduce((total, payment) => total.plus(payment.amountPaidDecimal ?? payment.amountPaid), new Prisma.Decimal(0));
    const balance = row.guides.some(guide => guide.status === "Paga" || guide.status === "PAGA") ? new Prisma.Decimal(0) : money(row.finalValueDecimal ?? row.originalValueDecimal ?? row.originalValue).minus(paid);
    return { id: row.id, assessmentNumber: row.assessmentNumber, status: row.status, balance: balance.toFixed(2) };
  }).filter((row) => new Prisma.Decimal(row.balance).greaterThan(0));
  const openDebts = activeDebts.map((row) => ({ id: row.id, cdaNumber: row.cdaNumber, status: row.status, balance: money(row.updatedValueDecimal ?? row.updatedValue).toFixed(2) })).filter((row) => new Prisma.Decimal(row.balance).greaterThan(0));
  const total = [...openAssessments, ...openDebts].reduce((sum, row) => sum.plus(row.balance), new Prisma.Decimal(0));
  return { checkedAt: new Date().toISOString(), hasDebt: total.greaterThan(0), total: total.toFixed(2), assessmentCount: openAssessments.length, activeDebtCount: openDebts.length, assessments: openAssessments, activeDebts: openDebts };
}

async function applyDeceasedRegistryUpdate(tx: Prisma.TransactionClient, deceased: { deceasedTaxpayerId: string | null; deathDate: Date }) {
  if (!deceased.deceasedTaxpayerId) return;
  const taxpayer = await tx.taxpayer.findUnique({ where: { id: deceased.deceasedTaxpayerId }, include: { person: true } });
  if (!taxpayer?.person) throw new TributarioS9Error("O cadastro único do falecido deve corresponder a uma pessoa física.");
  const fullName = /esp[oó]lio/i.test(taxpayer.person.fullName) ? taxpayer.person.fullName : `${taxpayer.person.fullName} - ESPÓLIO`;
  await tx.person.update({ where: { id: taxpayer.person.id }, data: { fullName, deathDate: deceased.deathDate, estateApplied: true } });
}

export async function registerDeceased(db: PrismaClient, actor: Actor, input: {
  fullName: string; birthDate?: Date; deathDate: Date; deathTime?: string; gender?: string; document?: string; maritalStatus?: string; fatherName?: string; motherName?: string; address?: string;
  cemeteryId: string; graveId: string; funeralHomeId?: string; funeralHomeName?: string; causeId?: string; causeText?: string;
  doctorName: string; doctorCrm: string; groups?: Record<string, unknown>; taxpayerId?: string; deceasedTaxpayerId?: string; declarantTaxpayerId?: string; unidentified?: boolean;
  scheduledAt?: Date; burialType?: "MEMBRO" | "NORMAL" | "NAO_RECLAMADO"; chapelId?: string; finalizeNow?: boolean;
  exceptionReason?: string; memberOwnerDeceased?: boolean; requestKey?: string;
}) {
  if (!input.fullName.trim()) throw new TributarioS9Error("Nome do falecido é obrigatório.");
  if (!input.doctorName.trim() || !input.doctorCrm.trim()) throw new TributarioS9Error("Médico declarante com CRM é obrigatório.");
  validateWorkflowDate(input.deathDate, "Data do óbito");
  if (input.scheduledAt) validateWorkflowDate(input.scheduledAt, "Data do agendamento");
  if (input.birthDate && input.birthDate > input.deathDate) throw new TributarioS9Error("Nascimento posterior ao óbito.");
  const burialType = validateBurialIdentity(input);
  if ((!input.funeralHomeId || !input.causeId || !input.chapelId) && !(input.unidentified && input.exceptionReason?.trim())) throw new TributarioS9Error("Funerária, causa do óbito e capela são obrigatórias; a exceção para não identificado exige motivo.");
  const result = await db.$transaction(async (tx) => {
    const request = await workflowRequest(tx, "registerDeceased", input.requestKey, input);
    if (request.replayId) return tx.taxDeceased.findUniqueOrThrow({ where: { id: request.replayId } });
    await lockWorkflowRows(tx, "TaxGrave", [input.graveId]);
    const grave = await tx.taxGrave.findUnique({ where: { id: input.graveId } });
    if (!grave || grave.cemeteryId !== input.cemeteryId) throw new TributarioS9Error("Sepultura fora do cemitério informado.");
    if (!grave.active || !graveHasVacancy(grave)) throw new TributarioS9Error("Sepultura sem vaga: inativa, ocupada, cheia ou interditada.");
    await lockWorkflowRows(tx, "CemeteryLot", [grave.lotId]);
    if (grave.lotId && !await tx.cemeteryLot.count({ where: { id: grave.lotId, active: true } })) throw new TributarioS9Error("O lote da sepultura está inativo.");
    const declarantTaxpayerId = input.declarantTaxpayerId || input.taxpayerId;
    let fullName = input.fullName.trim();
    if (!declarantTaxpayerId) throw new TributarioS9Error("O declarante responsável do Cadastro Único é obrigatório.");
    await validateTaxpayer(tx, declarantTaxpayerId, "O declarante responsável");
    if (input.deceasedTaxpayerId) await validateTaxpayer(tx, input.deceasedTaxpayerId, "O falecido");
    if (input.deceasedTaxpayerId) {
      await lockWorkflowRows(tx, "Taxpayer", [input.deceasedTaxpayerId]);
      const person = await tx.taxpayer.findUnique({ where: { id: input.deceasedTaxpayerId }, select: { personId: true, person: { select: { fullName: true } } } });
      if (!person?.personId) throw new TributarioS9Error("O cadastro vinculado deve ser pessoa física.");
      if (burialType !== "MEMBRO" && person.person) fullName = person.person.fullName;
      if (burialType !== "MEMBRO" && await tx.taxDeceased.count({ where: { deceasedTaxpayerId: input.deceasedTaxpayerId, status: { not: "CANCELADO" }, processes: { some: { processType: "SEPULTAMENTO", OR: [{ burialType: { not: "MEMBRO" } }, { burialType: null }] } } } })) throw new TributarioS9Error("Já existe registro funerário desta pessoa física. Utilize o processo existente.");
    }
    if (input.funeralHomeId && !await tx.taxFuneralHome.count({ where: { id: input.funeralHomeId, active: true } })) throw new TributarioS9Error("Funerária ativa não encontrada.");
    if (input.causeId && !await tx.taxDeathCause.count({ where: { id: input.causeId } })) throw new TributarioS9Error("Causa do óbito não encontrada.");
    if (input.chapelId && !await tx.cemeteryChapel.count({ where: { id: input.chapelId, cemeteryId: input.cemeteryId, active: true } })) throw new TributarioS9Error("Capela ativa fora do cemitério informado.");
    const debtSnapshot = await declarantDebtSnapshot(tx, declarantTaxpayerId);
    const finalizeNow = input.finalizeNow ?? true;
    const groups = { ...(input.groups ?? {}) };
    for (const group of DEATH_GROUPS) if (groups[group] === undefined) groups[group] = null;
    const reusable = burialType !== "MEMBRO" && input.deceasedTaxpayerId ? await tx.taxDeceased.findFirst({ where: { deceasedTaxpayerId: input.deceasedTaxpayerId, status: "REGISTRADO", processes: { none: { processType: "SEPULTAMENTO" } } } }) : null;
    if (reusable && reusable.deathDate.toISOString().slice(0,10) !== input.deathDate.toISOString().slice(0,10)) throw new TributarioS9Error("Data do óbito diverge do registro funerário existente.");
    const deceasedData: Prisma.TaxDeceasedUncheckedCreateInput = {
        fullName, birthDate: input.birthDate || null, deathDate: input.deathDate, deathTime: input.deathTime || null, gender: input.gender || null, document: input.document || null,
        maritalStatus: input.maritalStatus || null, fatherName: input.fatherName || null, motherName: input.motherName || null, address: input.address || null,
        cemeteryId: input.cemeteryId, graveId: grave.id, funeralHomeId: input.funeralHomeId || null, funeralHomeName: input.funeralHomeName || null,
        causeId: input.causeId || null, causeText: input.causeText || null, doctorName: input.doctorName.trim(), doctorCrm: input.doctorCrm.trim(),
        groups: json({ ...groups, _version: "OBITO_11_GRUPOS_V1", _workflow: { burialType, exceptionReason: input.exceptionReason?.trim() || null, memberOwnerDeceased: input.memberOwnerDeceased === true } }), taxpayerId: input.taxpayerId || declarantTaxpayerId, deceasedTaxpayerId: input.deceasedTaxpayerId || null, declarantTaxpayerId, unidentified: input.unidentified ?? false, status: finalizeNow ? "SEPULTADO" : "AGENDADO", createdByUsuarioId: actor.usuarioId,
    };
    const deceased = reusable ? await tx.taxDeceased.update({ where: { id: reusable.id }, data: deceasedData }) : await tx.taxDeceased.create({ data: deceasedData });
    const scheduledAt = input.scheduledAt ?? new Date();
    const process = await tx.cemeteryProcess.create({ data: { receiptCode: code("AG-CEM"), processType: "SEPULTAMENTO", status: finalizeNow ? "SEPULTADO" : "AGENDADO", burialType: input.burialType ?? (input.unidentified ? "NAO_RECLAMADO" : "NORMAL"), deceasedId: deceased.id, cemeteryId: input.cemeteryId, graveId: grave.id, chapelId: input.chapelId || null, funeralHomeId: input.funeralHomeId || null, declarantTaxpayerId, declarantDebtSnapshot: json(debtSnapshot), scheduledAt, performedAt: finalizeNow ? scheduledAt : null, createdByUsuarioId: actor.usuarioId } });
    if (finalizeNow) {
      const occupantCount = grave.occupantCount + 1;
      await tx.taxGrave.update({ where: { id: grave.id }, data: { occupantCount, status: occupantCount >= grave.capacity ? "OCUPADA" : grave.status } });
      await cemeteryHistory(tx, actor, "SEPULTURA", grave.id, "occupantCount", grave.occupantCount, occupantCount);
      if (occupantCount >= grave.capacity && grave.status !== "OCUPADA") await cemeteryHistory(tx, actor, "SEPULTURA", grave.id, "status", grave.status, "OCUPADA");
      await refreshCemeteryLotStatus(tx, actor, grave.lotId);
      await tx.taxBurialMovement.create({ data: { deceasedId: deceased.id, graveId: grave.id, toGraveId: grave.id, movementType: "SEPULTAMENTO", movementDate: scheduledAt, notes: "Sepultamento finalizado com vaga controlada.", createdByUsuarioId: actor.usuarioId } });
      if (burialType !== "MEMBRO" || input.memberOwnerDeceased === true) await applyDeceasedRegistryUpdate(tx, deceased);
      await recordCemeteryFeeEvent(tx, { eventType: "SEPULTAMENTO", sourceType: "PROCESSO", sourceId: process.id });
    }
    await request.record(deceased.id, actor.usuarioId);
    return deceased;
  });
  const processes = await db.cemeteryProcess.findMany({ where: { deceasedId: result.id, processType: "SEPULTAMENTO", performedAt: { not: null } }, select: { id: true } });
  for (const process of processes) await chargeRecordedCemeteryFees(db, actor, "PROCESSO", process.id);
  return result;
}

export async function registerMovement(db: PrismaClient, actor: Actor, input: { deceasedId: string; graveId: string; toGraveId?: string; ossuaryId?: string; movementType: "OUTRO_LOTE" | "OSSUARIO" | "EXUMACAO" | "MUDANCA_CIDADE" | "MUDANCA_CEMITERIO" | "DESAPROPRIACAO" | "CREMACAO" | "OUTRO"; destinationDescription?: string; notes?: string; requestKey?: string }) {
  const result = await db.$transaction(async (tx) => {
    const request = await workflowRequest(tx, "registerMovement", input.requestKey, input);
    if (request.replayId) return tx.taxBurialMovement.findUniqueOrThrow({ where: { id: request.replayId } });
    await lockWorkflowRows(tx, "TaxDeceased", [input.deceasedId]);
    const processes = await tx.cemeteryProcess.findMany({ where: { deceasedId: input.deceasedId, processType: "SEPULTAMENTO" }, select: { id: true } });
    await lockWorkflowRows(tx, "CemeteryProcess", processes.map(process => process.id));
    await lockWorkflowRows(tx, "TaxGrave", [input.graveId, input.toGraveId]);
    await lockWorkflowRows(tx, "CemeteryOssuary", [input.ossuaryId]);
    const grave = await tx.taxGrave.findUnique({ where: { id: input.graveId } });
    if (!grave) throw new TributarioS9Error("Sepultura de origem não encontrada.");
    const deceased = await tx.taxDeceased.findUnique({ where: { id: input.deceasedId } });
    if (!deceased) throw new TributarioS9Error("Falecido não encontrado.");
    assertCemeteryTransferAllowed({ deceasedStatus: deceased.status, currentGraveId: deceased.graveId, originGraveId: grave.id });
    const destination = input.toGraveId ? await tx.taxGrave.findUnique({ where: { id: input.toGraveId } }) : null;
    validateTransferPair(input, grave, destination);
    if (input.toGraveId && !destination) throw new TributarioS9Error("Sepultura de destino não encontrada.");
    await lockWorkflowRows(tx, "CemeteryLot", [grave.lotId, destination?.lotId]);
    if (grave.occupantCount < 1) throw new TributarioS9Error("A sepultura de origem não possui ocupação a liberar.");
    if (input.movementType === "EXUMACAO") {
      const occupantCount = Math.max(0, grave.occupantCount - 1);
      await tx.taxGrave.update({ where: { id: grave.id }, data: { occupantCount, status: occupantCount === 0 && grave.status === "OCUPADA" ? "LIVRE" : grave.status } });
      await cemeteryHistory(tx, actor, "SEPULTURA", grave.id, "occupantCount", grave.occupantCount, occupantCount);
      await refreshCemeteryLotStatus(tx, actor, grave.lotId);
      await tx.taxDeceased.update({ where: { id: input.deceasedId }, data: { status: "EXUMADO", graveId: null } });
      await tx.cemeteryProcess.updateMany({ where: { deceasedId: input.deceasedId, processType: "SEPULTAMENTO", status: "SEPULTADO" }, data: { status: "EXUMADO" } });
      const movement = await tx.taxBurialMovement.create({ data: { deceasedId: input.deceasedId, graveId: grave.id, fromGraveId: grave.id, movementType: "EXUMACAO", destinationType: "EXUMACAO", destinationDescription: input.destinationDescription?.trim() || null, notes: input.notes?.trim() || null, createdByUsuarioId: actor.usuarioId } });
      await recordCemeteryFeeEvent(tx, { eventType: movement.movementType, sourceType: "MOVIMENTO", sourceId: movement.id });
      await request.record(movement.id, actor.usuarioId);
      return movement;
    }
    const requiresInternalGrave = input.movementType === "OUTRO_LOTE";
    if (requiresInternalGrave && !input.toGraveId) throw new TributarioS9Error("A transferência para outro lote exige uma sepultura de destino.");
    const ossuary = input.ossuaryId ? await tx.cemeteryOssuary.findUnique({ where: { id: input.ossuaryId } }) : null;
    if (input.toGraveId && (!destination || !destination.active || !graveHasVacancy(destination))) throw new TributarioS9Error("Sepultura de destino inexistente, inativa ou sem vaga.");
    if (destination?.lotId && !await tx.cemeteryLot.count({ where: { id: destination.lotId, active: true } })) throw new TributarioS9Error("O lote de destino está inativo.");
    if (input.movementType === "OSSUARIO" && (!ossuary || !ossuary.active || ossuary.occupantCount >= ossuary.capacity)) throw new TributarioS9Error("Selecione um ossuário ativo com vaga.");
    if (ossuary && ossuary.cemeteryId !== grave.cemeteryId) throw new TributarioS9Error("O ossuário deve pertencer ao cemitério de origem.");
    if (!destination && !ossuary && !input.destinationDescription?.trim()) throw new TributarioS9Error("Descreva o destino da transferência.");
    const originCount = Math.max(0, grave.occupantCount - 1);
    await tx.taxGrave.update({ where: { id: grave.id }, data: { occupantCount: originCount, status: originCount === 0 && grave.status === "OCUPADA" ? "LIVRE" : grave.status } });
    await cemeteryHistory(tx, actor, "SEPULTURA", grave.id, "occupantCount", grave.occupantCount, originCount);
    if (destination) {
      const occupantCount = destination.occupantCount + 1;
      await tx.taxGrave.update({ where: { id: destination.id }, data: { occupantCount, status: occupantCount >= destination.capacity ? "OCUPADA" : destination.status } });
      await cemeteryHistory(tx, actor, "SEPULTURA", destination.id, "occupantCount", destination.occupantCount, occupantCount);
    }
    if (ossuary) await tx.cemeteryOssuary.update({ where: { id: ossuary.id }, data: { occupantCount: { increment: 1 } } });
    await refreshCemeteryLotStatus(tx, actor, grave.lotId);
    await refreshCemeteryLotStatus(tx, actor, destination?.lotId);
    const nextStatus = input.movementType === "CREMACAO" ? "CREMADO" : input.movementType === "DESAPROPRIACAO" ? "DESAPROPRIADO" : "TRANSFERIDO";
    await tx.taxDeceased.update({ where: { id: input.deceasedId }, data: { status: destination ? "SEPULTADO" : nextStatus, cemeteryId: destination?.cemeteryId ?? deceased.cemeteryId, graveId: destination?.id ?? null } });
    await tx.cemeteryProcess.updateMany({ where: { deceasedId: input.deceasedId, processType: "SEPULTAMENTO", status: "SEPULTADO" }, data: { status: nextStatus } });
    const movement = await tx.taxBurialMovement.create({ data: { deceasedId: input.deceasedId, graveId: destination?.id ?? grave.id, fromGraveId: grave.id, toGraveId: destination?.id ?? null, toOssuaryId: ossuary?.id ?? null, movementType: input.movementType, destinationType: input.movementType, destinationDescription: input.destinationDescription?.trim() || (ossuary ? `Ossuário ${ossuary.code}` : null), notes: input.notes?.trim() || null, createdByUsuarioId: actor.usuarioId } });
    await recordCemeteryFeeEvent(tx, { eventType: movement.movementType, sourceType: "MOVIMENTO", sourceId: movement.id });
    await request.record(movement.id, actor.usuarioId);
    return movement;
  });
  await chargeRecordedCemeteryFees(db, actor, "MOVIMENTO", result.id);
  return result;
}

export async function createCemeteryProcess(db: PrismaClient, actor: Actor, input: { processType: "VELORIO" | "CREMACAO"; deceasedId: string; cemeteryId?: string; chapelId?: string; funeralHomeId?: string; declarantTaxpayerId: string; scheduledAt: Date; notes?: string; requestKey?: string; deceasedTaxpayerId?: string; deathDate?: Date; causeId?: string; doctorName?: string; doctorCrm?: string }) {
  validateWorkflowDate(input.scheduledAt, "Data do agendamento");
  if (!["VELORIO", "CREMACAO"].includes(input.processType)) throw new TributarioS9Error("Tipo de processo inválido.");
  return db.$transaction(async (tx) => {
    const request = await workflowRequest(tx, "createCemeteryProcess", input.requestKey, input);
    if (request.replayId) return tx.cemeteryProcess.findUniqueOrThrow({ where: { id: request.replayId } });
    await lockWorkflowRows(tx, "TaxDeceased", [input.deceasedId]);
    let deceased = input.deceasedId ? await tx.taxDeceased.findUnique({ where: { id: input.deceasedId } }) : null;
    if (!input.deceasedId) {
      if (!input.deceasedTaxpayerId || !input.deathDate || !input.causeId || !input.cemeteryId || !input.doctorName?.trim() || !input.doctorCrm?.trim()) throw new TributarioS9Error("Informe pessoa física, data do óbito, causa, cemitério e médico/CRM para o novo registro funerário.");
      validateWorkflowDate(input.deathDate, "Data do óbito");
      await lockWorkflowRows(tx, "Taxpayer", [input.deceasedTaxpayerId]);
      const taxpayer = await tx.taxpayer.findUnique({ where: { id: input.deceasedTaxpayerId }, include: { person: true } });
      if (!taxpayer?.person || taxpayer.status !== "Ativo") throw new TributarioS9Error("Pessoa física ativa do Cadastro Único é obrigatória.");
      deceased = await tx.taxDeceased.findFirst({ where: { deceasedTaxpayerId: taxpayer.id, status: { not: "CANCELADO" }, OR: [{ groups: { path: ["_workflow", "burialType"], equals: "NORMAL" } }, { processes: { some: { burialType: "NORMAL" } } }] } });
      if (deceased && deceased.deathDate.toISOString().slice(0,10) !== input.deathDate.toISOString().slice(0,10)) throw new TributarioS9Error("Data do óbito diverge do registro existente.");
      if (!deceased) deceased = await tx.taxDeceased.create({ data: { fullName: taxpayer.person.fullName, birthDate: taxpayer.person.birthDate, deathDate: input.deathDate, cemeteryId: input.cemeteryId, deceasedTaxpayerId: taxpayer.id, declarantTaxpayerId: input.declarantTaxpayerId, taxpayerId: input.declarantTaxpayerId, causeId: input.causeId, funeralHomeId: input.funeralHomeId || null, doctorName: input.doctorName.trim(), doctorCrm: input.doctorCrm.trim(), status: "REGISTRADO", groups: json({ ...Object.fromEntries(DEATH_GROUPS.map(g => [g, null])), _version: "OBITO_11_GRUPOS_V1", _workflow: { burialType: "NORMAL" } }), createdByUsuarioId: actor.usuarioId } });
    }
    if (!deceased) throw new TributarioS9Error("Falecido não encontrado.");
    if (["CREMADO", "EXUMADO", "DESAPROPRIADO", "TRANSFERIDO"].includes(deceased.status)) throw new TributarioS9Error("Falecido não disponível para novo processo.");
    const metadata = (deceased.groups as { _workflow?: { burialType?: string; exceptionReason?: string } })._workflow;
    if (metadata?.burialType === "MEMBRO") throw new TributarioS9Error("Velório e cremação de pessoa exigem registro de falecido, não de membro.");
    if (!deceased.causeId && !(deceased.unidentified && metadata?.exceptionReason?.trim())) throw new TributarioS9Error("Causa do óbito obrigatória para o processo funerário.");
    if (await tx.cemeteryProcess.count({ where: { deceasedId: deceased.id, processType: input.processType, status: { in: ["AGENDADO", "EM_REALIZACAO"] } } })) throw new TributarioS9Error("Já existe processo deste tipo em aberto.");
    const cemeteryId = input.cemeteryId || deceased.cemeteryId;
    if (input.chapelId && !await tx.cemeteryChapel.count({ where: { id: input.chapelId, cemeteryId, active: true } })) throw new TributarioS9Error("Capela ativa fora do cemitério informado.");
    if (input.processType === "VELORIO" && !input.chapelId) throw new TributarioS9Error("Velório exige capela.");
    const funeralHomeId = input.funeralHomeId || deceased.funeralHomeId;
    if (!funeralHomeId || !await tx.taxFuneralHome.count({ where: { id: funeralHomeId, active: true } })) throw new TributarioS9Error("Funerária ativa é obrigatória.");
    await validateTaxpayer(tx, input.declarantTaxpayerId, "O declarante responsável");
    const debtSnapshot = await declarantDebtSnapshot(tx, input.declarantTaxpayerId);
    const process = await tx.cemeteryProcess.create({ data: { receiptCode: code(input.processType === "VELORIO" ? "VEL" : "CRE"), processType: input.processType, status: "AGENDADO", deceasedId: deceased.id, cemeteryId, chapelId: input.chapelId || null, funeralHomeId, declarantTaxpayerId: input.declarantTaxpayerId, declarantDebtSnapshot: json(debtSnapshot), scheduledAt: input.scheduledAt, notes: input.notes?.trim() || null, createdByUsuarioId: actor.usuarioId } });
    await request.record(process.id, actor.usuarioId);
    return process;
  });
}

export async function advanceCemeteryProcess(db: PrismaClient, actor: Actor, input: { processId: string; status: "EM_REALIZACAO" | "SEPULTADO" | "CREMADO" | "ENCERRADO" | "CANCELADO"; requestKey?: string }) {
  const result = await db.$transaction(async (tx) => {
    const request = await workflowRequest(tx, "advanceCemeteryProcess", input.requestKey, input);
    if (request.replayId) return tx.cemeteryProcess.findUniqueOrThrow({ where: { id: request.replayId } });
    const reference = await tx.cemeteryProcess.findUnique({ where: { id: input.processId }, select: { deceasedId: true } });
    if (!reference) throw new TributarioS9Error("Processo funerário não encontrado.");
    await lockWorkflowRows(tx, "TaxDeceased", [reference.deceasedId]);
    await lockWorkflowRows(tx, "CemeteryProcess", [input.processId]);
    const location = await tx.taxDeceased.findUniqueOrThrow({ where: { id: reference.deceasedId } });
    const scheduled = await tx.cemeteryProcess.findUniqueOrThrow({ where: { id: input.processId } });
    await lockWorkflowRows(tx, "TaxGrave", [scheduled.graveId, location.status === "SEPULTADO" ? location.graveId : null]);
    const process = await tx.cemeteryProcess.findUnique({ where: { id: input.processId }, include: { deceased: true, grave: true } });
    if (!process) throw new TributarioS9Error("Processo funerário não encontrado.");
    if (!["AGENDADO", "EM_REALIZACAO"].includes(process.status)) throw new TributarioS9Error("O processo não está disponível para esta transição.");
    if (!["EM_REALIZACAO", "SEPULTADO", "CREMADO", "ENCERRADO", "CANCELADO"].includes(input.status) || (input.status === "EM_REALIZACAO" && process.status !== "AGENDADO")) throw new TributarioS9Error("Transição inválida.");
    if (input.status === "ENCERRADO" && process.processType !== "VELORIO") throw new TributarioS9Error("Somente velório pode ser encerrado.");
    if (input.status === "SEPULTADO") {
      if (process.processType !== "SEPULTAMENTO" || !process.grave || !process.grave.active || !graveHasVacancy(process.grave)) throw new TributarioS9Error("O sepultamento não possui uma sepultura ativa com vaga.");
      if (!["AGENDADO", "EM_REALIZACAO"].includes(process.deceased.status)) throw new TributarioS9Error("A pessoa não está disponível para sepultamento.");
      const metadata = (process.deceased.groups as { _workflow?: { exceptionReason?: string; memberOwnerDeceased?: boolean } })._workflow;
      validateBurialIdentity({ burialType: process.burialType, unidentified: process.deceased.unidentified, deceasedTaxpayerId: process.deceased.deceasedTaxpayerId, exceptionReason: metadata?.exceptionReason });
      const exception = process.deceased.unidentified && metadata?.exceptionReason?.trim();
      if ((!process.funeralHomeId || !process.deceased.causeId || !process.chapelId) && !exception) throw new TributarioS9Error("Funerária, causa do óbito e capela são obrigatórias para finalizar.");
      if (process.funeralHomeId && !await tx.taxFuneralHome.count({ where: { id: process.funeralHomeId, active: true } })) throw new TributarioS9Error("Funerária inativa.");
      if (process.chapelId && !await tx.cemeteryChapel.count({ where: { id: process.chapelId, cemeteryId: process.cemeteryId ?? process.deceased.cemeteryId, active: true } })) throw new TributarioS9Error("Capela inativa ou fora do cemitério.");
      if (process.grave.lotId && !await tx.cemeteryLot.count({ where: { id: process.grave.lotId, active: true } })) throw new TributarioS9Error("O lote da sepultura está inativo.");
      const occupantCount = process.grave.occupantCount + 1;
      await tx.taxGrave.update({ where: { id: process.grave.id }, data: { occupantCount, status: occupantCount >= process.grave.capacity ? "OCUPADA" : process.grave.status } });
      await cemeteryHistory(tx, actor, "SEPULTURA", process.grave.id, "occupantCount", process.grave.occupantCount, occupantCount);
      await refreshCemeteryLotStatus(tx, actor, process.grave.lotId);
      await tx.taxDeceased.update({ where: { id: process.deceasedId }, data: { status: "SEPULTADO", graveId: process.grave.id } });
      await tx.taxBurialMovement.create({ data: { deceasedId: process.deceasedId, graveId: process.grave.id, toGraveId: process.grave.id, movementType: "SEPULTAMENTO", movementDate: new Date(), notes: `Finalização do agendamento ${process.receiptCode}.`, createdByUsuarioId: actor.usuarioId } });
      if (process.burialType !== "MEMBRO" || metadata?.memberOwnerDeceased === true) await applyDeceasedRegistryUpdate(tx, process.deceased);
    }
    if (input.status === "CREMADO") {
      if (process.processType !== "CREMACAO") throw new TributarioS9Error("Somente processos de cremação podem ser finalizados como cremados.");
      if (["CREMADO", "EXUMADO", "TRANSFERIDO", "DESAPROPRIADO"].includes(process.deceased.status)) throw new TributarioS9Error("A pessoa não está disponível para cremação.");
      const metadata = (process.deceased.groups as { _workflow?: { burialType?: string; exceptionReason?: string; memberOwnerDeceased?: boolean } })._workflow;
      validateBurialIdentity({ burialType: metadata?.burialType, unidentified: process.deceased.unidentified, deceasedTaxpayerId: process.deceased.deceasedTaxpayerId, exceptionReason: metadata?.exceptionReason });
      if (!process.funeralHomeId || !await tx.taxFuneralHome.count({ where: { id: process.funeralHomeId, active: true } })) throw new TributarioS9Error("Funerária ativa obrigatória para finalizar cremação.");
      if (!process.deceased.causeId && !(process.deceased.unidentified && metadata?.exceptionReason?.trim())) throw new TributarioS9Error("Causa do óbito obrigatória para finalizar cremação.");
      if (process.deceased.status === "SEPULTADO" && process.deceased.graveId) {
        const origin = await tx.taxGrave.findUnique({ where: { id: process.deceased.graveId } });
        if (origin) {
          if (origin.occupantCount < 1) throw new TributarioS9Error("A sepultura de origem não possui ocupação a liberar.");
          const occupantCount = Math.max(0, origin.occupantCount - 1);
          await tx.taxGrave.update({ where: { id: origin.id }, data: { occupantCount, status: occupantCount === 0 && origin.status === "OCUPADA" ? "LIVRE" : origin.status } });
          await cemeteryHistory(tx, actor, "SEPULTURA", origin.id, "occupantCount", origin.occupantCount, occupantCount);
          await refreshCemeteryLotStatus(tx, actor, origin.lotId);
          await tx.taxBurialMovement.create({ data: { deceasedId: process.deceasedId, graveId: origin.id, fromGraveId: origin.id, movementType: "CREMACAO", destinationType: "CREMACAO", notes: `Cremação finalizada no processo ${process.receiptCode}.`, createdByUsuarioId: actor.usuarioId } });
        }
      }
      await tx.taxDeceased.update({ where: { id: process.deceasedId }, data: { status: "CREMADO", graveId: null } });
      await tx.cemeteryProcess.updateMany({ where: { deceasedId: process.deceasedId, processType: "SEPULTAMENTO", status: { in: ["AGENDADO", "EM_REALIZACAO"] } }, data: { status: "CANCELADO" } });
      await tx.cemeteryProcess.updateMany({ where: { deceasedId: process.deceasedId, processType: "SEPULTAMENTO", status: "SEPULTADO" }, data: { status: "CREMADO" } });
      if (metadata?.burialType !== "MEMBRO" || metadata?.memberOwnerDeceased === true) await applyDeceasedRegistryUpdate(tx, process.deceased);
    }
    if (input.status === "CANCELADO" && process.processType === "SEPULTAMENTO" && process.deceased.status === "AGENDADO") await tx.taxDeceased.update({ where: { id: process.deceasedId }, data: { status: "CANCELADO", graveId: null } });
    const updated = await tx.cemeteryProcess.update({ where: { id: process.id }, data: { status: input.status, performedAt: ["SEPULTADO", "CREMADO", "ENCERRADO"].includes(input.status) ? new Date() : undefined } });
    if (["SEPULTADO", "CREMADO", "ENCERRADO"].includes(input.status)) await recordCemeteryFeeEvent(tx, { eventType: updated.processType, sourceType: "PROCESSO", sourceId: updated.id });
    await request.record(updated.id, actor.usuarioId);
    return updated;
  });
  await chargeRecordedCemeteryFees(db, actor, "PROCESSO", result.id);
  return result;
}

export async function attachCemeteryDocument(db: PrismaClient, actor: Actor, input: { targetType: "LOTE" | "SEPULTURA" | "SEPULTAMENTO" | "VELORIO" | "CREMACAO"; targetId: string; documentId: string }) {
  const document = await db.document.findUnique({ where: { id: input.documentId }, select: { id: true } });
  if (!document) throw new TributarioS9Error("Documento GED não encontrado.");
  const exists = input.targetType === "LOTE" ? await db.cemeteryLot.count({ where: { id: input.targetId } }) : input.targetType === "SEPULTURA" ? await db.taxGrave.count({ where: { id: input.targetId } }) : await db.cemeteryProcess.count({ where: { id: input.targetId, processType: input.targetType } });
  if (!exists) throw new TributarioS9Error("Registro de destino do anexo não encontrado.");
  return db.cemeteryAttachment.create({ data: { targetType: input.targetType, targetId: input.targetId, documentId: input.documentId, createdByUsuarioId: actor.usuarioId } });
}

export async function createCemeteryFeeRule(db: PrismaClient, input: { cemeteryId?: string; eventType: string; label: string; formula: "VALOR_FIXO" | "BASE_X_QUANTIDADE"; baseAmount: number; validFrom?: Date }) {
  const baseAmount = money(input.baseAmount);
  if (!input.eventType.trim() || !input.label.trim() || baseAmount.lessThanOrEqualTo(0)) throw new TributarioS9Error("Evento, descrição e valor-base positivo são obrigatórios.");
  return db.cemeteryFeeRule.create({ data: { cemeteryId: input.cemeteryId || null, eventType: input.eventType.trim().toUpperCase(), label: input.label.trim(), formula: input.formula, baseAmount, validFrom: input.validFrom ?? new Date() } });
}

export async function grantConcession(db: PrismaClient, actor: Actor, input: { graveId: string; holderName: string; taxpayerId?: string; concessionType: "TEMPORARIA" | "INDETERMINADA"; endsAt?: Date }) {
  if (!input.holderName.trim()) throw new TributarioS9Error("Titular da concessão é obrigatório.");
  if (input.concessionType === "TEMPORARIA" && !input.endsAt) throw new TributarioS9Error("Concessão temporária exige término.");
  return db.taxGraveConcession.create({ data: { graveId: input.graveId, holderName: input.holderName.trim(), taxpayerId: input.taxpayerId || null, concessionType: input.concessionType, endsAt: input.endsAt || null, createdByUsuarioId: actor.usuarioId } });
}

// Guia da taxa de sepultamento/exumação/movimentação pelo motor tributário (TRI-426/427/430).
export async function issueCemeteryFee(db: PrismaClient, actor: Actor, input: { taxpayerId: string; amount?: number; dueDate: Date; movementId?: string; concessionId?: string; feeRuleId?: string; quantity?: number; label?: string }) {
  validateWorkflowDate(input.dueDate, "Vencimento");
  if (input.movementId && input.concessionId) throw new TributarioS9Error("Vincule apenas um fato gerador à taxa.");
  const rule = input.feeRuleId ? await db.cemeteryFeeRule.findUnique({ where: { id: input.feeRuleId } }) : null;
  if (input.feeRuleId && (!rule || !rule.active || rule.validFrom > new Date() || (rule.validUntil && rule.validUntil < new Date()))) throw new TributarioS9Error("A fórmula de taxa selecionada não está vigente.");
  if (!rule && input.amount === undefined) throw new TributarioS9Error("Informe o valor ou selecione uma fórmula de taxa.");
  const fee = rule ? cemeteryFeeAmount({ formula: rule.formula as "VALOR_FIXO" | "BASE_X_QUANTIDADE", baseAmount: rule.baseAmount, quantity: input.quantity }) : money(input.amount!);
  if (fee.lessThanOrEqualTo(0)) throw new TributarioS9Error("Valor da taxa inválido.");
  return db.$transaction(async tx => {
    let previousAssessmentId: string | null = null;
    if (input.movementId || input.concessionId) {
      const sourceType = input.movementId ? "MOVIMENTO" : "CONCESSAO";
      const sourceId = (input.movementId || input.concessionId)!;
      await lockWorkflowRows(tx, input.movementId ? "TaxBurialMovement" : "TaxGraveConcession", [sourceId]);
      const source = input.movementId ? await tx.taxBurialMovement.findUnique({ where: { id: sourceId }, include: { deceased: true } }) : await tx.taxGraveConcession.findUnique({ where: { id: sourceId } });
      if (!source) throw new TributarioS9Error("Fato gerador da taxa não encontrado.");
      if ("movementType" in source && source.movementType === "SEPULTAMENTO") throw new TributarioS9Error("Emita a taxa pelo evento único do processo de sepultamento.");
      const taxpayerId = "deceased" in source ? source.deceased?.declarantTaxpayerId ?? source.deceased?.taxpayerId : source.taxpayerId;
      if (taxpayerId && taxpayerId !== input.taxpayerId) throw new TributarioS9Error("O contribuinte não corresponde ao fato gerador.");
      const automatic = await tx.cemeteryFeeEvent.findFirst({ where: { sourceType, sourceId } });
      if (automatic && !automatic.assessmentId) throw new TributarioS9Error("Reprocesse o evento automático na área de taxas; não crie cobrança paralela.");
      previousAssessmentId = automatic?.assessmentId ?? source.feeAssessmentId;
    }
    if (previousAssessmentId) {
      const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: previousAssessmentId } });
      const guide = await tx.taxGuide.findFirstOrThrow({ where: { assessmentId: assessment.id, status: { not: "Cancelada" } } });
      if (assessment.taxpayerId !== input.taxpayerId || !money(assessment.finalValueDecimal ?? assessment.originalValue).eq(fee)) throw new TributarioS9Error("O fato gerador já possui cobrança com outros dados.");
      return { assessment, guide };
    }
    const tax = await tx.tax.findFirst({ where: { name: "Taxa de Sepultamento", isActive: true } });
    if (!tax) throw new TributarioS9Error("Cadastre a Taxa de Sepultamento antes de emitir a guia.");
    const transactionalDb = { $transaction: async <T>(callback: (client: Prisma.TransactionClient) => Promise<T>) => callback(tx) } as unknown as PrismaClient;
    const year = input.dueDate.getUTCFullYear();
    const assessment = await createTaxAssessment(transactionalDb, fullActor(actor), { year, taxId: tax.id, taxpayerId: input.taxpayerId, taxableBase: fee, rate: 100, competence: new Date() });
    const guide = await generateTaxGuide(transactionalDb, fullActor(actor), { assessmentId: assessment.id, dueDate: input.dueDate });
    if (input.movementId) await tx.taxBurialMovement.update({ where: { id: input.movementId }, data: { feeAssessmentId: assessment.id } });
    if (input.concessionId) await tx.taxGraveConcession.update({ where: { id: input.concessionId }, data: { feeAssessmentId: assessment.id } });
    return { assessment, guide };
  }, { timeout: 60000 });
}

// Taxa de cemitério não paga segue para dívida ativa (TRI-436).
export async function enrollCemeteryFeeInDebt(db: PrismaClient, actor: Actor, assessmentId: string) {
  const debt = await enrollAssessmentInActiveDebt(db, fullActor(actor), assessmentId);
  await db.$transaction(async (tx) => {
    await debtEvent(tx, actor, debt.id, "INSCRICAO", "Taxa de cemitério inscrita em dívida ativa.", { assessmentId });
  });
  return debt;
}

export function cemeteryOccupancy(graves: { capacity: number; occupantCount: number }[]) {
  return occupancyStats(graves);
}

export function concessionCurrentSituation(concession: { concessionType: string; status: string; endsAt?: Date | string | null }, now = new Date()) {
  return concessionSituation(concession, now);
}

// S9-E — BI com dados reais da base, filtros e drill-down (TRI-437..445).
export async function tributarioBi(db: PrismaClient, filters: { year?: number; taxName?: string; debtStatus?: string }) {
  const year = filters.year;
  const [assessments, payments, debts, agreements, legacyPlans, cases, protestItems, declarations, activities] = await Promise.all([
    db.taxAssessment.findMany({ where: { ...(year ? { year } : {}), ...(filters.taxName ? { tax: { name: filters.taxName } } : {}) }, select: { finalValueDecimal: true, originalValueDecimal: true, originalValue: true, status: true, year: true, taxpayerId: true, tax: { select: { name: true } }, realEstate: { select: { fiscalZone: true, propertyUse: true } } }, take: 2000 }),
    db.taxPayment.findMany({ where: { status: "Confirmado", ...(year ? { guide: { assessment: { year } } } : {}) }, select: { amountPaidDecimal: true, amountPaid: true, paymentDate: true, paymentMethod: true, guide: { select: { assessment: { select: { year: true, tax: { select: { name: true } } } } } } }, take: 2000 }),
    db.activeDebt.findMany({ where: { ...(year ? { year } : {}), ...(filters.debtStatus ? { status: filters.debtStatus } : {}) }, select: { updatedValueDecimal: true, updatedValue: true, status: true, originDebtType: true, year: true, cdaNumber: true, taxpayerId: true }, orderBy: { updatedAt: "desc" }, take: 1000 }),
    db.taxInstallmentAgreement.findMany({ select: { status: true, totalAgreementDecimal: true, balanceDecimal: true, paidDecimal: true }, take: 1000 }),
    db.debtInstallment.findMany({ select: { status: true, totalValueDecimal: true, totalValue: true }, take: 1000 }),
    db.taxExecutionCase.findMany({ select: { status: true, internalProtocol: true, activeDebtId: true }, take: 500 }),
    db.taxProtestItem.findMany({ select: { status: true, batchId: true, activeDebtId: true }, take: 1000 }),
    db.taxDeclaration.findMany({ where: { status: { notIn: ["CANCELADA", "SUBSTITUIDA"] }, ...(year ? { competence: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } : {}) }, select: { competence: true, issValueDecimal: true, activityId: true }, take: 2000 }),
    db.taxServiceActivity.findMany({ select: { id: true, code: true } }),
  ]);
  const activityNames = new Map(activities.map((row) => [row.id, row.code ?? row.id]));
  const previsto = assessments.reduce((sum, row) => sum.plus(new Prisma.Decimal(String(row.finalValueDecimal ?? row.originalValueDecimal ?? row.originalValue ?? 0))), new Prisma.Decimal(0));
  const realizado = payments.reduce((sum, row) => sum.plus(new Prisma.Decimal(String(row.amountPaidDecimal ?? row.amountPaid ?? 0))), new Prisma.Decimal(0));
  const rate = previsto.greaterThan(0) ? Number(realizado.div(previsto).mul(100).toFixed(2)) : 0;
  return {
    previsto: Number(previsto.toFixed(2)),
    realizado: Number(realizado.toFixed(2)),
    collectionRate: rate,
    byTax: sumBy(assessments, (row) => row.tax.name, (row) => row.finalValueDecimal ?? row.originalValueDecimal ?? row.originalValue),
    paidByTax: sumBy(payments, (row) => row.guide.assessment.tax.name, (row) => row.amountPaidDecimal ?? row.amountPaid),
    paymentTrend: trendByMonth(payments.map((row) => ({ date: row.paymentDate, value: row.amountPaidDecimal ?? row.amountPaid }))),
    debtsByStatus: sumBy(debts, (row) => row.status, (row) => row.updatedValueDecimal ?? row.updatedValue),
    debtsByOrigin: sumBy(debts, (row) => row.originDebtType, (row) => row.updatedValueDecimal ?? row.updatedValue),
    agreementsByStatus: sumBy(agreements, (row) => row.status, (row) => row.totalAgreementDecimal),
    agreementsBalance: Number(agreements.reduce((sum, row) => sum.plus(row.balanceDecimal), new Prisma.Decimal(0)).toFixed(2)),
    legacyPlansByStatus: sumBy(legacyPlans, (row) => row.status, (row) => row.totalValueDecimal ?? row.totalValue),
    executionByStatus: sumBy(cases, (row) => row.status, () => 0),
    protestByStatus: sumBy(protestItems, (row) => row.status, () => 0),
    iptuByZone: sumBy(assessments.filter((row) => row.realEstate), (row) => row.realEstate?.fiscalZone ?? "SEM ZONA", (row) => row.finalValueDecimal ?? row.originalValueDecimal ?? row.originalValue),
    iptuByUse: sumBy(assessments.filter((row) => row.realEstate), (row) => row.realEstate?.propertyUse ?? "SEM USO", (row) => row.finalValueDecimal ?? row.originalValueDecimal ?? row.originalValue),
    issTrend: trendByMonth(declarations.map((row) => ({ date: row.competence, value: row.issValueDecimal }))),
    issByActivity: sumBy(declarations, (row) => activityNames.get(row.activityId) ?? row.activityId, (row) => row.issValueDecimal),
    drillDebts: debts.slice(0, 20).map((row) => ({ cda: row.cdaNumber ?? "SEM CDA", origin: row.originDebtType, status: row.status, value: Number(row.updatedValueDecimal ?? row.updatedValue), taxpayerId: row.taxpayerId })),
    counts: { assessments: assessments.length, payments: payments.length, debts: debts.length, agreements: agreements.length, cases: cases.length, protestItems: protestItems.length, declarations: declarations.length },
  };
}
