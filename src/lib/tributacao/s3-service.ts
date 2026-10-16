import { Prisma, type PrismaClient } from "@prisma/client";
import { attributeItbiHistory } from "./itbi-history";
import { createHash, randomBytes } from "node:crypto";
import { calculateItbi, canDeleteDteMessage, dteDeadline, nextPowerOfAttorneyStatus, TributarioS3Error } from "./s3-engine";
import { generateTaxGuideInTransaction, type TaxActor } from "./index";
import { resolveTaxAssessmentScope, resolveTaxFinancialYear, taxAssessmentCompensatedValue, taxScopeSnapshot } from "./scope";
import { recognizeTaxAssessmentInTransaction } from "./accrual-accounting";
import { assertAccountingPeriodOpen } from "@/lib/financeiro";
import { evaluateConfiguredPropertyValuation, propertyValuationRuleSchema } from "./property-valuation";
import { saveConfiguredFiscalRecordInTransaction } from "./configurable-cadastres";
import { assertNoPendingItbiAdjustments } from "./itbi-process-channel";
import { evaluateItbiEntryPolicy } from "./itbi-entry-policy";

type Db = PrismaClient | Prisma.TransactionClient;

async function itbiScope(db: Db, actor: TaxActor, snapshot?: Prisma.JsonValue) {
  const stored = taxScopeSnapshot(snapshot);
  const candidates = typeof stored.taxId === "string" ? [] : await db.tax.findMany({ where: { name: { equals: "ITBI", mode: "insensitive" }, isActive: true } });
  if (typeof stored.taxId !== "string" && candidates.length !== 1) throw new TributarioS3Error("Concilie um único tributo ITBI ativo antes de operar declarações.");
  const tax = typeof stored.taxId === "string" ? await db.tax.findUnique({ where: { id: stored.taxId } }) : candidates[0];
  if (!tax?.isActive || tax.name.toUpperCase() !== "ITBI") throw new TributarioS3Error("Configure o tributo ITBI ativo antes de operar declarações.");
  return { tax, scope: await resolveTaxAssessmentScope(db, actor, tax.id, snapshot) };
}

function required(value: string, label: string) {
  const text = value.trim();
  if (!text) throw new TributarioS3Error(`${label} é obrigatório.`);
  return text;
}

async function nextDocumentNumber(tx: Prisma.TransactionClient, documentType: string, prefix: string) {
  const year = new Date().getUTCFullYear();
  const sequence = await tx.taxDocumentSequence.upsert({
    where: { year_documentType: { year, documentType } },
    create: { year, documentType, currentValue: 1 },
    update: { currentValue: { increment: 1 } },
  });
  return `${prefix}-${year}-${String(sequence.currentValue).padStart(7, "0")}`;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function secretHash(value: string) { return createHash("sha256").update(value).digest("hex"); }

export async function ensureTributarioS3Defaults(db: PrismaClient) {
  await Promise.all([
    db.itbiTransactionType.upsert({
      where: { code: "COMPRA_VENDA" },
      create: { code: "COMPRA_VENDA", name: "Compra e venda", rate: 2, damStage: "APROVACAO", cadastralUpdateMode: "CONFIGURAVEL", legalBasis: "Parâmetro demonstrativo: alíquota persistida de 2%." },
      update: {},
    }),
    db.itbiTransactionType.upsert({
      where: { code: "CESSAO_DIREITOS" },
      create: { code: "CESSAO_DIREITOS", name: "Cessão de direitos", rate: 2, damStage: "APROVACAO", cadastralUpdateMode: "MANUAL", legalBasis: "Regra demonstrativa sujeita à legislação municipal." },
      update: {},
    }),
    db.dteCategory.upsert({ where: { code: "INTIMACAO" }, create: { code: "INTIMACAO", name: "Intimação fiscal", retentionRequired: true, defaultDeadlineDays: 5 }, update: {} }),
    db.dteCategory.upsert({ where: { code: "AVISO" }, create: { code: "AVISO", name: "Aviso informativo", retentionRequired: false, defaultDeadlineDays: 5 }, update: {} }),
    db.dteCategory.upsert({ where: { code: "DOCUMENTO" }, create: { code: "DOCUMENTO", name: "Documento fiscal", retentionRequired: true, defaultDeadlineDays: 5 }, update: {} }),
  ]);
}

async function propertyDebts(db: Db, realEstateId: string, scope: { governmentEntityId: string | null; budgetUnitId: string | null }) {
  const assessments = await db.taxAssessment.findMany({
    where: { realEstateId, status: { notIn: ["Cancelado", "Extinto", "Suspenso"] } },
    include: { guides: { include: { payments: { where: { status: "Confirmado" } } } } },
  });
  let blockingTaxDebt = new Prisma.Decimal(0);
  for (const assessment of assessments) {
    const origin = taxScopeSnapshot(assessment.calculationSnapshot);
    if (!origin.governmentEntityId || !origin.budgetUnitId) throw new TributarioS3Error("Concilie a origem dos créditos imobiliários legados antes da conferência de débitos.");
    if (origin.governmentEntityId !== scope.governmentEntityId || origin.budgetUnitId !== scope.budgetUnitId) continue;
    const constituted = assessment.finalValueDecimal ?? assessment.originalValueDecimal;
    const payments = assessment.guides.flatMap(guide => guide.payments);
    if (!constituted || payments.some(payment => !payment.amountPaidDecimal)) throw new TributarioS3Error("Concilie os valores Decimal dos créditos e recebimentos imobiliários.");
    const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Prisma.Decimal(0));
    const compensated = await taxAssessmentCompensatedValue(db, assessment.id);
    blockingTaxDebt = blockingTaxDebt.plus(Prisma.Decimal.max(constituted.minus(paid).minus(compensated), 0));
  }
  const entries = await db.taxRegistryEntry.findMany({ where: { entityType: "REAL_ESTATE", entityId: realEstateId, category: "NON_TAX_PROPERTY_DEBT", status: { in: ["ATIVO", "PENDENTE"] } } });
  const nonTaxDebtAmount = entries.reduce((total, entry) => {
    const data = taxScopeSnapshot(entry.data);
    if (!data.governmentEntityId || !data.budgetUnitId) throw new TributarioS3Error("Concilie a origem do débito não tributário do imóvel.");
    if (data.governmentEntityId !== scope.governmentEntityId || data.budgetUnitId !== scope.budgetUnitId) return total;
    const amount = new Prisma.Decimal(String(data.amount));
    if (!amount.isFinite() || amount.lt(0)) throw new TributarioS3Error("Débito não tributário possui valor inválido.");
    return total.plus(amount);
  }, new Prisma.Decimal(0));
  return { blockingTaxDebt, nonTaxDebtAmount };
}

export async function createItbiDeclaration(db: PrismaClient, actor: TaxActor, input: {
  transactionTypeId: string; realEstateId: string; processId: string; registryOffice: string; transmittedFractionPercent: number;
  declaredPropertyValue: number; sellerTaxpayerId: string; buyers: { taxpayerId: string; sharePercent: number }[];
  responsibleTaxpayerId?: string; responsibilityType?: "SOLIDARIO" | "SUBSIDIARIO"; isLeasehold?: boolean; leaseholdDetails?: string;
  cadastralUpdateMode: "MANUAL" | "AUTO_ON_APPROVAL" | "AUTO_ON_PAYMENT";
  debtorTaxpayerId?: string; dueDate?: string; valuationRuleId?: string;
  sellers?: { taxpayerId: string; sharePercent: number }[];
  forms?: { catalogId: string; values: Record<string, unknown>; documentIds: string[] }[];
}) {
  return db.$transaction((tx) => createItbiDeclarationInTransaction(tx, actor, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
}

export async function createItbiDeclarationInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, input: {
  transactionTypeId: string; realEstateId: string; processId: string; registryOffice: string; transmittedFractionPercent: number;
  declaredPropertyValue: number; sellerTaxpayerId: string; buyers: { taxpayerId: string; sharePercent: number }[];
  responsibleTaxpayerId?: string; responsibilityType?: "SOLIDARIO" | "SUBSIDIARIO"; isLeasehold?: boolean; leaseholdDetails?: string;
  cadastralUpdateMode: "MANUAL" | "AUTO_ON_APPROVAL" | "AUTO_ON_PAYMENT";
  debtorTaxpayerId?: string; dueDate?: string; valuationRuleId?: string;
  sellers?: { taxpayerId: string; sharePercent: number }[];
  forms?: { catalogId: string; values: Record<string, unknown>; documentIds: string[] }[];
}) {
    await attributeItbiHistory(tx, actor);
    await tx.$queryRaw`SELECT id FROM "RealEstate" WHERE id=${input.realEstateId} FOR SHARE`;
    const [transactionType, property, process] = await Promise.all([
      tx.itbiTransactionType.findFirst({ where: { id: input.transactionTypeId, isActive: true } }),
      tx.realEstate.findUnique({ where: { id: input.realEstateId } }),
      tx.process.findUnique({ where: { id: input.processId } }),
    ]);
    if (!transactionType) throw new TributarioS3Error("Selecione um tipo de transmissão ativo.");
    if (!property) throw new TributarioS3Error("Imóvel não encontrado.");
    if (!process) throw new TributarioS3Error("Selecione um processo/protocolo existente.");
    const { tax, scope } = await itbiScope(tx, actor);
    const propertyProfile = await tx.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: property.id, category: "PROPERTY_PROFILE" }, orderBy: { version: "desc" } });
    const propertyOrigin = taxScopeSnapshot(propertyProfile?.data);
    if (propertyProfile && (propertyOrigin.governmentEntityId !== scope.governmentEntityId || propertyOrigin.budgetUnitId !== scope.budgetUnitId) || !propertyProfile && actor.allowedBudgetUnitIds) throw new TributarioS3Error("Imóvel fora da origem do ITBI ou sem perfil imobiliário conciliado.");
    const typeOrigin = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ITBI_TRANSACTION_TYPE", entityId: transactionType.id, category: "PARAMETER_SCOPE" } });
    if (!typeOrigin && actor.allowedBudgetUnitIds) throw new TributarioS3Error("Modalidade legada sem origem conciliada para o acesso autorizado.");
    if (typeOrigin) {
      const stored = taxScopeSnapshot(typeOrigin.data);
      if (stored.budgetUnitId !== scope.budgetUnitId || stored.governmentEntityId !== scope.governmentEntityId) throw new TributarioS3Error("Modalidade de transmissão pertence a outra origem municipal.");
    }
    if (!Number.isFinite(input.declaredPropertyValue) || input.declaredPropertyValue <= 0) throw new TributarioS3Error("Informe um valor declarado positivo.");
    const sellers = input.sellers ?? [{ taxpayerId: input.sellerTaxpayerId, sharePercent: 100 }];
    if (!sellers.length || sellers.length>100 || new Set(sellers.map(seller=>seller.taxpayerId)).size!==sellers.length || sellers.some(seller=>!Number.isFinite(seller.sharePercent) || seller.sharePercent<=0 || seller.sharePercent>100) || !sellers.reduce((sum,seller)=>sum.plus(seller.sharePercent),new Prisma.Decimal(0)).eq(100)) throw new TributarioS3Error("Transmitentes distintos devem repartir 100% da fração transmitida.");
    if (new Prisma.Decimal(input.transmittedFractionPercent).decimalPlaces() > 6 || [...input.buyers,...sellers].some(party => new Prisma.Decimal(party.sharePercent).decimalPlaces() > 6)) throw new TributarioS3Error("Fração e participações admitem até seis casas decimais.");
    const debtorTaxpayerId = input.debtorTaxpayerId ?? input.buyers[0]?.taxpayerId;
    if (!debtorTaxpayerId || ![...sellers.map(seller=>seller.taxpayerId), ...input.buyers.map(buyer => buyer.taxpayerId)].includes(debtorTaxpayerId)) throw new TributarioS3Error("Selecione o devedor entre transmitente e adquirentes.");
    if (input.dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || !Number.isFinite(new Date(`${input.dueDate}T12:00:00.000Z`).valueOf()) || new Date(`${input.dueDate}T12:00:00.000Z`).toISOString().slice(0, 10) !== input.dueDate)) throw new TributarioS3Error("Vencimento do ITBI inválido.");
    let calculationValue: number | Prisma.Decimal = input.declaredPropertyValue;
    let valuationMemory: Prisma.InputJsonValue | null = null;
    if (input.valuationRuleId) {
      const rule = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: input.valuationRuleId } });
      if (rule.category !== "PROPERTY_VALUATION_RULE" || rule.entityId !== tax.id) throw new TributarioS3Error("Selecione uma regra de avaliação do ITBI.");
      const configuration = propertyValuationRuleSchema.parse(rule.data);
      const stored = taxScopeSnapshot(rule.data);
      if (stored.budgetUnitId !== scope.budgetUnitId || stored.governmentEntityId !== scope.governmentEntityId || configuration.year !== new Date().getUTCFullYear()) throw new TributarioS3Error("A regra de avaliação não pertence ao ente/UG e exercício da declaração.");
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`PROPERTY_VALUATION_RULE:${rule.title}`},0))::text`;
      const latest = await tx.taxRegistryEntry.findFirst({ where: { entityType: "TAX", entityId: tax.id, category: rule.category, title: rule.title }, orderBy: { version: "desc" } });
      if (latest?.id !== rule.id) throw new TributarioS3Error("A regra de avaliação foi substituída. Recarregue a declaração.");
      await tx.$queryRaw`SELECT id FROM "RealEstate" WHERE id=${property.id} FOR SHARE`;
      const valuationProperty = await tx.realEstate.findUniqueOrThrow({ where: { id: property.id } });
      if (valuationProperty.landArea === null || valuationProperty.builtArea === null) throw new TributarioS3Error("Informe as áreas do imóvel antes da avaliação configurada.");
      const valuation = await evaluateConfiguredPropertyValuation(tx, configuration, { id: valuationProperty.id, landArea: valuationProperty.landArea, builtArea: valuationProperty.builtArea }, scope);
      calculationValue = valuation.value;
      valuationMemory = json({ ruleId: rule.id, ruleVersion: rule.version, ...valuation.memory });
    }
    if (!["MANUAL", "AUTO_ON_APPROVAL", "AUTO_ON_PAYMENT"].includes(input.cadastralUpdateMode)) throw new TributarioS3Error("Selecione o gatilho de atualização cadastral.");
    if (new Set(input.buyers.map(buyer => buyer.taxpayerId)).size !== input.buyers.length) throw new TributarioS3Error("Adquirentes duplicados na mesma transmissão.");
    const partyIds = [...sellers.map(seller=>seller.taxpayerId), ...input.buyers.map((buyer) => buyer.taxpayerId), input.responsibleTaxpayerId].filter(Boolean) as string[];
    const taxpayers = await tx.taxpayer.count({ where: { id: { in: [...new Set(partyIds)] }, status: "Ativo" } });
    if (taxpayers !== new Set(partyIds).size) throw new TributarioS3Error("Uma das partes não é contribuinte ativo.");
    if (input.buyers.some((buyer) => sellers.some(seller=>seller.taxpayerId===buyer.taxpayerId))) throw new TributarioS3Error("Transmitente e adquirente devem ser partes distintas.");
    const calculation = calculateItbi({ propertyValue: calculationValue, transmittedFractionPercent: input.transmittedFractionPercent, ratePercent: transactionType.rate, buyerSharesPercent: input.buyers.map((buyer) => buyer.sharePercent) });
    const debts = await propertyDebts(tx, property.id, scope);
    const entryPolicy = await evaluateItbiEntryPolicy(tx, scope, { transactionTypeId: transactionType.id, propertyStatus: property.status, profile: propertyProfile?.data ?? null, declaredValue: new Prisma.Decimal(input.declaredPropertyValue), valuation: calculation.propertyValue, taxDebt: debts.blockingTaxDebt, nonTaxDebt: debts.nonTaxDebtAmount, fraction: calculation.fraction, leasehold: Boolean(input.isLeasehold) });
    const declarationNumber = await nextDocumentNumber(tx, "ITBI_DECLARATION", "ITBI");
    const declaration = await tx.itbiDeclaration.create({ data: {
      declarationNumber, transactionTypeId: transactionType.id, realEstateId: property.id, processId: process.id, protocolNumber: process.protocolNumber,
      registryOffice: required(input.registryOffice, "Cartório"), transmissionScope: calculation.fraction.equals(100) ? "INTEGRAL" : "PARCIAL",
      transmittedFraction: calculation.fraction, declaredPropertyValue: new Prisma.Decimal(input.declaredPropertyValue).toDecimalPlaces(2), taxableBase: calculation.taxableBase,
      appliedRate: calculation.rate, taxAmount: calculation.taxAmount, blockingTaxDebt: debts.blockingTaxDebt, nonTaxDebtAmount: debts.nonTaxDebtAmount,
      calculationSnapshot: json({ ...scope, taxId: tax.id, debtorTaxpayerId, dueDate: input.dueDate ?? null, valuationMemory, declaredPropertyValue: String(input.declaredPropertyValue), legalBasis: transactionType.legalBasis, requiresDebtClearance: transactionType.requiresDebtClearance, formula: "valorImovel × fracaoTransmitida × aliquota", propertyValue: calculation.propertyValue.toFixed(2), fractionPercent: calculation.fraction.toString(), taxableBase: calculation.taxableBase.toFixed(2), ratePercent: calculation.rate.toString(), taxAmount: calculation.taxAmount.toFixed(2), allocations: calculation.allocations.map((allocation, index) => ({ taxpayerId: input.buyers[index].taxpayerId, sharePercent: allocation.sharePercent.toString(), transmittedValue: allocation.transmittedValue.toFixed(2), taxAmount: allocation.taxAmount.toFixed(2) })) }),
      isLeasehold: Boolean(input.isLeasehold), leaseholdDetails: input.leaseholdDetails?.trim() || null, cadastralUpdateMode: input.cadastralUpdateMode === "AUTO_ON_APPROVAL" ? "AUTO_ON_PAYMENT" : input.cadastralUpdateMode,
      createdByUsuarioId: actor.usuarioId,
      parties: { create: [
        ...sellers.map((seller,index)=>({ taxpayerId: seller.taxpayerId, role: "TRANSMITENTE", participationPercent: seller.sharePercent, sortOrder: index })),
        ...input.buyers.map((buyer, index) => ({ taxpayerId: buyer.taxpayerId, role: "ADQUIRENTE", participationPercent: buyer.sharePercent, sortOrder: index + 1 })),
        ...(input.responsibleTaxpayerId ? [{ taxpayerId: input.responsibleTaxpayerId, role: "RESPONSAVEL", liabilityType: input.responsibilityType ?? "SOLIDARIO", sortOrder: 99 }] : []),
      ] },
      events: { create: [
        { eventType: "DECLARACAO_CRIADA", description: "Declaração criada com cálculo persistido.", actorUsuarioId: actor.usuarioId, payload: json({ protocolNumber: process.protocolNumber, entryPolicy }) },
        ...entryPolicy.warnings.map(warning => ({ eventType: "AVISO_INCLUSAO", description: `${warning.code}: ${warning.message}`, actorUsuarioId: actor.usuarioId, payload: json({ ...entryPolicy, warning }) })),
      ] },
    }, include: { parties: true } });
    for (const warning of entryPolicy.warnings) await tx.taxRegistryEntry.create({ data: { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_PROCESS_MESSAGE", title: "Aviso configurado na inclusão", actorUsuarioId: actor.usuarioId, processId: process.id, data: { ...scope, kind: "ENTRY_WARNING", text: `${warning.code}: ${warning.message}`, policyId: entryPolicy.policyId, policyVersion: entryPolicy.policyVersion, external: false } } });
    if (input.forms && (input.forms.length>50 || new Set(input.forms.map(form=>form.catalogId)).size!==input.forms.length)) throw new TributarioS3Error("Informe até 50 formulários distintos na declaração.");
    for (const form of input.forms ?? []) await saveConfiguredFiscalRecordInTransaction(tx,actor,{catalogId:form.catalogId,entityType:"ITBI_DECLARATION",entityId:declaration.id,expectedVersion:0,active:true,values:form.values,documentIds:form.documentIds,processId:process.id,frontage:null});
    return declaration;
}

export async function transmitItbiDeclaration(db: PrismaClient, actor: TaxActor, declarationId: string) {
  return db.$transaction(async (tx) => {
    await attributeItbiHistory(tx, actor);
    await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${declarationId} FOR UPDATE`;
    const declaration = await tx.itbiDeclaration.findUnique({ where: { id: declarationId }, include: { transactionType: true, parties: true } });
    if (!declaration || declaration.status !== "RASCUNHO") throw new TributarioS3Error("Somente declaração em rascunho pode ser transmitida.");
    const { scope } = await itbiScope(tx, actor, declaration.calculationSnapshot);
    if (!declaration.processId) throw new TributarioS3Error("A transmissão exige processo/protocolo vinculado.");
    const storedClearance = taxScopeSnapshot(declaration.calculationSnapshot).requiresDebtClearance;
    const debts = await propertyDebts(tx, declaration.realEstateId, scope);
    if ((typeof storedClearance === "boolean" ? storedClearance : declaration.transactionType.requiresDebtClearance) && debts.blockingTaxDebt.greaterThan(0)) throw new TributarioS3Error(`O imóvel possui ${debts.blockingTaxDebt.toFixed(2)} em débitos tributários pendentes.`);
    const buyer = declaration.parties.find((party) => party.role === "ADQUIRENTE");
    if (!buyer) throw new TributarioS3Error("A declaração não possui adquirente.");
    await tx.taxServiceRequest.create({ data: { serviceType: "ITBI", status: "EM_ANALISE_INTERNA", taxpayerId: buyer.taxpayerId, processId: declaration.processId, notes: `Declaração ${declaration.declarationNumber}` } });
    const updated = await tx.itbiDeclaration.update({ where: { id: declaration.id }, data: { status: "PROTOCOLADA", blockingTaxDebt: debts.blockingTaxDebt, nonTaxDebtAmount: debts.nonTaxDebtAmount, events: { create: { eventType: "DECLARACAO_PROTOCOLADA", description: `Transmitida no protocolo ${declaration.protocolNumber}.`, actorUsuarioId: actor.usuarioId, payload: { blockingTaxDebt: debts.blockingTaxDebt.toFixed(2), nonTaxDebtAmount: debts.nonTaxDebtAmount.toFixed(2) } } } } });
    return updated;
  });
}

export async function analyzeItbiDeclaration(db: PrismaClient, actor: TaxActor, input: { declarationId: string; approved: boolean; notes: string }) {
  return db.$transaction(tx => analyzeItbiInTransaction(tx, actor, input));
}

export async function analyzeItbiInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, input: { declarationId: string; approved: boolean; notes: string }) {
    await attributeItbiHistory(tx, actor);
    await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${input.declarationId} FOR UPDATE`;
    const declaration = await tx.itbiDeclaration.findUnique({ where: { id: input.declarationId }, include: { parties: true, transactionType: true } });
    if (!declaration || !["PROTOCOLADA", "EM_ANALISE"].includes(declaration.status)) throw new TributarioS3Error("A declaração não está disponível para análise.");
    const { tax, scope } = await itbiScope(tx, actor, declaration.calculationSnapshot);
    const now = new Date();
    if (!input.approved) return tx.itbiDeclaration.update({ where: { id: declaration.id }, data: { status: "INDEFERIDA", analysisNotes: required(input.notes, "Motivo"), analyzedAt: now, events: { create: { eventType: "ANALISE_INDEFERIDA", description: input.notes.trim(), actorUsuarioId: actor.usuarioId } } } });
    await assertNoPendingItbiAdjustments(tx, declaration.id);
    const buyer = declaration.parties.find((party) => party.role === "ADQUIRENTE");
    if (!buyer) throw new TributarioS3Error("A declaração não possui adquirente.");
    const year = now.getUTCFullYear();
    const snapshot = taxScopeSnapshot(declaration.calculationSnapshot);
    const debts = await propertyDebts(tx, declaration.realEstateId, scope);
    const clearanceRequired = typeof snapshot.requiresDebtClearance === "boolean" ? snapshot.requiresDebtClearance : declaration.transactionType.requiresDebtClearance;
    if (clearanceRequired && debts.blockingTaxDebt.gt(0)) throw new TributarioS3Error("O imóvel possui débitos tributários impeditivos na conferência da aprovação.");
    const debtorTaxpayerId = typeof snapshot.debtorTaxpayerId === "string" ? snapshot.debtorTaxpayerId : buyer.taxpayerId;
    if (!declaration.parties.some(party => ["TRANSMITENTE", "ADQUIRENTE"].includes(party.role) && party.taxpayerId === debtorTaxpayerId)) throw new TributarioS3Error("Devedor da declaração não corresponde às partes da transmissão.");
    const financialYear = await resolveTaxFinancialYear(tx, year, scope);
    await assertAccountingPeriodOpen(tx, financialYear.id, now);
    const assessmentNumber = await nextDocumentNumber(tx, "ASSESSMENT", "LAN");
    const assessment = await tx.taxAssessment.create({ data: {
      year, assessmentNumber, competence: now, originalValue: Number(declaration.taxAmount), originalValueDecimal: declaration.taxAmount,
      taxableBaseDecimal: declaration.taxableBase, rate: declaration.appliedRate, discountValueDecimal: 0, interestValueDecimal: 0, penaltyValueDecimal: 0,
      correctionValueDecimal: 0, finalValueDecimal: declaration.taxAmount, status: "Lançado", calculationSnapshot: json({ ...taxScopeSnapshot(declaration.calculationSnapshot), ...scope, financialYearId: financialYear.id, itbiDeclarationId: declaration.id }),
      taxId: tax.id, taxpayerId: debtorTaxpayerId, realEstateId: declaration.realEstateId,
    } });
    await recognizeTaxAssessmentInTransaction(tx, actor, assessment.id);
    return tx.itbiDeclaration.update({ where: { id: declaration.id }, data: {
      status: "APROVADA", assessmentId: assessment.id, analysisNotes: input.notes.trim() || "Análise aprovada.", analyzedAt: now, blockingTaxDebt: debts.blockingTaxDebt, nonTaxDebtAmount: debts.nonTaxDebtAmount,
      cadastralUpdateMode: declaration.cadastralUpdateMode === "AUTO_ON_APPROVAL" ? "AUTO_ON_PAYMENT" : declaration.cadastralUpdateMode,
      cadastralUpdatedAt: null,
      events: { create: { eventType: "ANALISE_APROVADA", description: "Análise aprovada e crédito tributário constituído; atualização automática condicionada ao pagamento.", actorUsuarioId: actor.usuarioId, payload: json({ assessmentId: assessment.id, previousCadastralUpdateMode: declaration.cadastralUpdateMode, cadastralUpdateMode: declaration.cadastralUpdateMode === "AUTO_ON_APPROVAL" ? "AUTO_ON_PAYMENT" : declaration.cadastralUpdateMode }) } },
    } });
}

export async function issueItbiDam(db: PrismaClient, actor: TaxActor, declarationId: string) {
  return db.$transaction(tx => issueItbiDamInTransaction(tx, actor, declarationId), { timeout: 60000 });
}

export async function issueItbiDamInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, declarationId: string) {
    await attributeItbiHistory(tx, actor);
    const origin = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id: declarationId } });
    if (!origin.assessmentId) throw new TributarioS3Error("A declaração deve estar aprovada.");
    await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id=${origin.assessmentId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${declarationId} FOR UPDATE`;
    const declaration = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id: declarationId } });
    const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: origin.assessmentId } });
    await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
    if (declaration.guideId) return tx.taxGuide.findUniqueOrThrow({ where: { id: declaration.guideId } });
    if (!["APROVADA", "DOCUMENTO_EMITIDO"].includes(declaration.status)) throw new TributarioS3Error("A declaração deve estar aprovada e sem DAM ativo.");
    const storedDueDate = taxScopeSnapshot(declaration.calculationSnapshot).dueDate;
    const guide = await generateTaxGuideInTransaction(tx, actor, { assessmentId: assessment.id, dueDate: typeof storedDueDate === "string" ? new Date(`${storedDueDate}T12:00:00.000Z`) : new Date(Date.UTC(assessment.year, 11, 31, 12)) });
    await tx.itbiDeclaration.update({ where: { id: declaration.id }, data: { guideId: guide.id, status: declaration.documentId ? "DOCUMENTO_EMITIDO" : "DAM_EMITIDO", events: { create: { eventType: "DAM_EMITIDO", description: `DAM ${guide.guideNumber ?? guide.id} emitido.`, actorUsuarioId: actor.usuarioId, payload: json({ guideId: guide.id }) } } } });
    return guide;
}

export async function generateItbiDocument(db: PrismaClient, actor: TaxActor, declarationId: string) {
  return db.$transaction(tx => generateItbiDocumentInTransaction(tx, actor, declarationId));
}

export async function generateItbiDocumentInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, declarationId: string) {
    await attributeItbiHistory(tx, actor);
    await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${declarationId} FOR UPDATE`;
    const declaration = await tx.itbiDeclaration.findUnique({ where: { id: declarationId } });
    if (!declaration || !["APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"].includes(declaration.status)) throw new TributarioS3Error("O documento exige declaração aprovada.");
    await itbiScope(tx, actor, declaration.calculationSnapshot);
    if (declaration.documentId) return tx.document.findUniqueOrThrow({ where: { id: declaration.documentId } });
    const document = await tx.document.create({ data: { title: `Documento de transmissão ${declaration.declarationNumber}`, documentType: "ITBI", fileUrl: `/tributacao/itbi/${declaration.id}/documento`, status: "Válido", publicLabel: "Documento interno de ITBI", notes: "Documento municipal. Não substitui o registro civil da propriedade." } });
    await tx.taxRegistryEntry.create({ data: { entityType: "REAL_ESTATE", entityId: declaration.realEstateId, category: "DOCUMENTO", title: document.title, documentId: document.id, processId: declaration.processId, actorUsuarioId: actor.usuarioId, source: "ITBI", data: { declarationId: declaration.id, details: "Comprovante de lançamento de ITBI compartilhado com o cadastro imobiliário." } } });
    await tx.itbiDeclaration.update({ where: { id: declaration.id }, data: { documentId: document.id, status: "DOCUMENTO_EMITIDO", events: { create: { eventType: "DOCUMENTO_EMITIDO", description: "Documento de transmissão registrado no GED.", actorUsuarioId: actor.usuarioId, payload: json({ documentId: document.id }) } } } });
    return document;
}

/** Approval, accrual, DAM and GED proof are a single atomic operation. */
export async function confirmItbiWithDocuments(db: PrismaClient, actor: TaxActor, input: { declarationId: string; notes: string }) {
  return db.$transaction(async tx => {
    const origin = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id: input.declarationId } });
    if (origin.assessmentId) await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id=${origin.assessmentId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${input.declarationId} FOR UPDATE`;
    const declaration = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id: input.declarationId } });
    await itbiScope(tx, actor, declaration.calculationSnapshot);
    if (declaration.assessmentId !== origin.assessmentId) throw new TributarioS3Error("Declaração aprovada durante a confirmação. Repita a operação para recuperar os documentos.");
    if (["PROTOCOLADA", "EM_ANALISE"].includes(declaration.status)) await analyzeItbiInTransaction(tx, actor, { ...input, approved: true });
    else if (!["APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"].includes(declaration.status)) throw new TributarioS3Error("A confirmação exige declaração disponível para análise ou previamente aprovada.");
    const guide = await issueItbiDamInTransaction(tx, actor, declaration.id);
    const document = await generateItbiDocumentInTransaction(tx, actor, declaration.id);
    return { declarationId: declaration.id, guideId: guide.id, documentId: document.id };
  }, { timeout: 60000 });
}

export async function createDteMailbox(db: PrismaClient, input: { taxpayerId: string; establishmentCnpj?: string; emailNoticeEnabled: boolean; smsNoticeEnabled: boolean }) {
  const taxpayer = await db.taxpayer.findFirst({ where: { id: input.taxpayerId, status: "Ativo" }, include: { company: true } });
  if (!taxpayer) throw new TributarioS3Error("Contribuinte ativo não encontrado.");
  const cnpj = input.establishmentCnpj?.replace(/\D/g, "") || taxpayer.company?.cnpj || null;
  const existing = await db.dteMailbox.findFirst({ where: { taxpayerId: taxpayer.id, establishmentCnpj: cnpj } });
  if (existing?.confirmedAt && existing.status === "ATIVA") return { mailbox: await db.dteMailbox.update({ where: { id: existing.id }, data: { emailNoticeEnabled: input.emailNoticeEnabled, smsNoticeEnabled: input.smsNoticeEnabled } }), confirmationToken: null };
  const confirmationToken = randomBytes(24).toString("base64url");
  const confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const mailbox = existing
    ? await db.dteMailbox.update({ where: { id: existing.id }, data: { status: "PENDENTE_CONFIRMACAO", emailNoticeEnabled: input.emailNoticeEnabled, smsNoticeEnabled: input.smsNoticeEnabled, confirmationTokenHash: secretHash(confirmationToken), confirmationExpiresAt } })
    : await db.dteMailbox.create({ data: { taxpayerId: taxpayer.id, establishmentCnpj: cnpj, status: "PENDENTE_CONFIRMACAO", emailNoticeEnabled: input.emailNoticeEnabled, smsNoticeEnabled: input.smsNoticeEnabled, confirmationTokenHash: secretHash(confirmationToken), confirmationExpiresAt } });
  return { mailbox, confirmationToken };
}

export async function confirmDteMailbox(db: PrismaClient, token: string) {
  const tokenHash = secretHash(required(token, "Token de confirmação"));
  const mailbox = await db.dteMailbox.findFirst({ where: { confirmationTokenHash: tokenHash } });
  if (!mailbox?.confirmationExpiresAt || mailbox.confirmationExpiresAt < new Date()) throw new TributarioS3Error("Token de confirmação inválido ou expirado.");
  return db.dteMailbox.update({ where: { id: mailbox.id }, data: { status: "ATIVA", confirmedAt: new Date(), confirmationTokenHash: null, confirmationExpiresAt: null } });
}

export async function createDteAccessGrant(db: PrismaClient, actor: TaxActor, input: { mailboxId: string; authorizedTaxpayerId: string; validUntil: Date }) {
  const [mailbox, authorized] = await Promise.all([
    db.dteMailbox.findFirst({ where: { id: input.mailboxId, status: "ATIVA" } }),
    db.taxpayer.findFirst({ where: { id: input.authorizedTaxpayerId, status: "Ativo" } }),
  ]);
  if (!mailbox) throw new TributarioS3Error("A caixa postal deve estar ativa e confirmada.");
  if (!authorized) throw new TributarioS3Error("Usuário autorizado não encontrado como contribuinte ativo.");
  if (input.validUntil <= new Date()) throw new TributarioS3Error("A validade do código deve ser futura.");
  const accessCode = randomBytes(12).toString("base64url");
  const grant = await db.dteAccessGrant.create({ data: { mailboxId: mailbox.id, authorizedTaxpayerId: authorized.id, codeHash: secretHash(accessCode), codeLast4: accessCode.slice(-4), validUntil: input.validUntil, createdByUsuarioId: actor.usuarioId } });
  return { grant, accessCode };
}

export async function validateDteAccessGrant(db: PrismaClient, input: { accessCode: string; authorizedTaxpayerId: string }) {
  const grant = await db.dteAccessGrant.findFirst({ where: { codeHash: secretHash(required(input.accessCode, "Código de acesso")), authorizedTaxpayerId: input.authorizedTaxpayerId }, include: { mailbox: true } });
  if (!grant || grant.status !== "ATIVO" || grant.revokedAt || grant.validUntil < new Date() || grant.mailbox.status !== "ATIVA") throw new TributarioS3Error("Código inválido, expirado ou revogado para este usuário.");
  return grant.mailbox;
}

export async function revokeDteAccessGrant(db: PrismaClient, id: string) {
  const grant = await db.dteAccessGrant.findUnique({ where: { id } });
  if (!grant || grant.status !== "ATIVO") throw new TributarioS3Error("Código de acesso não está ativo.");
  return db.dteAccessGrant.update({ where: { id }, data: { status: "REVOGADO", revokedAt: new Date() } });
}

export async function sendDteMessages(db: PrismaClient, actor: TaxActor, input: {
  mailboxIds: string[]; categoryId: string; subject: string; body: string; idempotencyBase: string; processId?: string; documentId?: string; signatureRequired?: boolean;
}) {
  const mailboxIds = [...new Set(input.mailboxIds.filter(Boolean))];
  if (!mailboxIds.length) throw new TributarioS3Error("Selecione ao menos uma caixa postal.");
  return db.$transaction(async (tx) => {
    const [category, mailboxes, process, document] = await Promise.all([
      tx.dteCategory.findFirst({ where: { id: input.categoryId, isActive: true } }),
      tx.dteMailbox.findMany({ where: { id: { in: mailboxIds }, status: "ATIVA" } }),
      input.processId ? tx.process.findUnique({ where: { id: input.processId } }) : null,
      input.documentId ? tx.document.findUnique({ where: { id: input.documentId } }) : null,
    ]);
    if (!category) throw new TributarioS3Error("Categoria DTE ativa não encontrada.");
    if (mailboxes.length !== mailboxIds.length) throw new TributarioS3Error("Uma das caixas postais não está ativa.");
    if (input.processId && !process) throw new TributarioS3Error("Processo não encontrado.");
    if (input.documentId && !document) throw new TributarioS3Error("Documento GED não encontrado.");
    if (input.signatureRequired && !document) throw new TributarioS3Error("A pendência de assinatura exige documento GED.");
    const availableAt = new Date();
    const batchKey = mailboxIds.length > 1 ? required(input.idempotencyBase, "Chave do lote") : null;
    const results = [];
    for (const mailbox of mailboxes) {
      const idempotencyKey = `DTE:${required(input.idempotencyBase, "Chave de envio")}:${mailbox.id}`;
      const existing = await tx.dteMessage.findUnique({ where: { idempotencyKey } });
      if (existing) { results.push(existing); continue; }
      const message = await tx.dteMessage.create({ data: {
        mailboxId: mailbox.id, categoryId: category.id, subject: required(input.subject, "Assunto"), body: required(input.body, "Mensagem"), processId: input.processId,
        documentId: input.documentId, batchKey, idempotencyKey, availableAt, deadlineAt: dteDeadline(availableAt, category.defaultDeadlineDays),
        emailNoticeAt: mailbox.emailNoticeEnabled ? availableAt : null, smsNoticeAt: mailbox.smsNoticeEnabled ? availableAt : null,
        signatureRequired: Boolean(input.signatureRequired), signatureStatus: input.signatureRequired ? "PENDENTE" : null, createdByUsuarioId: actor.usuarioId,
        events: { create: [
          { eventType: "DISPONIBILIZADA", description: "Comunicação disponibilizada na caixa postal.", actorUsuarioId: actor.usuarioId },
          ...((mailbox.emailNoticeEnabled || mailbox.smsNoticeEnabled) ? [{ eventType: "AVISO_EXTERNO", description: "Aviso externo registrado sem produzir leitura ou ciência.", actorUsuarioId: actor.usuarioId }] : []),
        ] },
      } });
      results.push(message);
    }
    return results;
  });
}

export async function registerDteReading(db: PrismaClient, actor: TaxActor, messageId: string) {
  return db.$transaction(async (tx) => {
    const message = await tx.dteMessage.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new TributarioS3Error("Mensagem indisponível.");
    if (message.readAt) return message;
    const now = new Date();
    return tx.dteMessage.update({ where: { id: message.id }, data: { readAt: now, status: "LIDA", events: { create: { eventType: "LEITURA", description: "Leitura efetiva registrada no DTE.", actorUsuarioId: actor.usuarioId } } } });
  });
}

export async function acknowledgeDteMessage(db: PrismaClient, actor: TaxActor, messageId: string) {
  return db.$transaction(async (tx) => {
    const message = await tx.dteMessage.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw new TributarioS3Error("Mensagem indisponível.");
    if (message.acknowledgedAt || message.tacitAcknowledgedAt) return message;
    const now = new Date();
    return tx.dteMessage.update({ where: { id: message.id }, data: { readAt: message.readAt ?? now, acknowledgedAt: now, status: "CIENCIA_EXPRESSA", events: { create: { eventType: "CIENCIA_EXPRESSA", description: "Ciência expressa registrada.", actorUsuarioId: actor.usuarioId } } } });
  });
}

export async function applyDteTacitAcknowledgement(db: PrismaClient, actor: TaxActor, messageId: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    const message = await tx.dteMessage.findUnique({ where: { id: messageId } });
    if (!message?.deadlineAt || message.deletedAt) throw new TributarioS3Error("Mensagem indisponível ou sem prazo.");
    if (message.readAt || message.acknowledgedAt || message.tacitAcknowledgedAt) throw new TributarioS3Error("A mensagem já possui leitura ou ciência registrada.");
    if (now < message.deadlineAt) throw new TributarioS3Error("O prazo para ciência tácita ainda não expirou.");
    return tx.dteMessage.update({ where: { id: message.id }, data: { tacitAcknowledgedAt: message.deadlineAt, status: "CIENCIA_TACITA", events: { create: { eventType: "CIENCIA_TACITA", description: "Ciência tácita registrada após expiração do prazo configurado.", actorUsuarioId: actor.usuarioId } } } });
  });
}

export async function deleteDteMessage(db: PrismaClient, actor: TaxActor, messageId: string) {
  return db.$transaction(async (tx) => {
    const message = await tx.dteMessage.findUnique({ where: { id: messageId }, include: { category: true } });
    if (!message || message.deletedAt) throw new TributarioS3Error("Mensagem indisponível.");
    if (!canDeleteDteMessage({ retentionRequired: message.category.retentionRequired, acknowledged: Boolean(message.acknowledgedAt || message.tacitAcknowledgedAt), signatureRequired: message.signatureRequired })) throw new TributarioS3Error("A classificação, ciência ou assinatura exige preservação desta mensagem.");
    return tx.dteMessage.update({ where: { id: message.id }, data: { deletedAt: new Date(), status: "EXCLUIDA", events: { create: { eventType: "EXCLUSAO_LOGICA", description: "Mensagem dispensável removida da caixa; histórico preservado.", actorUsuarioId: actor.usuarioId } } } });
  });
}

export async function createDtePowerOfAttorney(db: PrismaClient, actor: TaxActor, input: {
  actorTaxpayerId: string; grantorTaxpayerId: string; attorneyTaxpayerId: string; establishmentCnpjs: string[]; validUntil?: Date; documentId?: string; legitimacyMode: "AUTHENTICATED_INTERNAL" | "ICP_VALIDATED"; officialCertificateValidated?: boolean; legitimacyEvidence?: string;
}) {
  if (input.actorTaxpayerId !== input.grantorTaxpayerId) throw new TributarioS3Error("Procurador não pode criar nova procuração por substabelecimento.");
  if (input.grantorTaxpayerId === input.attorneyTaxpayerId) throw new TributarioS3Error("Outorgante e procurador devem ser diferentes.");
  if (input.legitimacyMode === "ICP_VALIDATED" && !input.officialCertificateValidated) throw new TributarioS3Error("Não há validação ICP-Brasil oficial para este ato.");
  const cnpjs = [...new Set(input.establishmentCnpjs.map((cnpj) => cnpj.replace(/\D/g, "")).filter((cnpj) => cnpj.length === 14))];
  if (!cnpjs.length) throw new TributarioS3Error("Informe ao menos um CNPJ completo para o escopo.");
  return db.$transaction(async (tx) => {
    const taxpayers = await tx.taxpayer.count({ where: { id: { in: [input.grantorTaxpayerId, input.attorneyTaxpayerId] }, status: "Ativo" } });
    if (taxpayers !== 2) throw new TributarioS3Error("Outorgante ou procurador não está ativo.");
    if (input.documentId && !(await tx.document.findUnique({ where: { id: input.documentId } }))) throw new TributarioS3Error("Instrumento GED não encontrado.");
    return tx.dtePowerOfAttorney.create({ data: {
      grantorTaxpayerId: input.grantorTaxpayerId, attorneyTaxpayerId: input.attorneyTaxpayerId, establishmentCnpjs: json(cnpjs), validUntil: input.validUntil,
      documentId: input.documentId, legitimacyMode: input.legitimacyMode, officialCertificateValidated: Boolean(input.officialCertificateValidated), legitimacyEvidence: input.legitimacyEvidence?.trim() || null,
      createdByUsuarioId: actor.usuarioId, events: { create: { eventType: "CRIADA", description: "Procuração criada e pendente de aceite do procurador.", actorUsuarioId: actor.usuarioId } },
    } });
  });
}

export async function transitionDtePowerOfAttorney(db: PrismaClient, actor: TaxActor, id: string, action: "ACEITAR" | "RECUSAR" | "REVOGAR") {
  return db.$transaction(async (tx) => {
    const power = await tx.dtePowerOfAttorney.findUnique({ where: { id } });
    if (!power) throw new TributarioS3Error("Procuração não encontrada.");
    const status = nextPowerOfAttorneyStatus(power.status, action);
    const now = new Date();
    return tx.dtePowerOfAttorney.update({ where: { id }, data: {
      status, acceptedAt: action === "ACEITAR" ? now : power.acceptedAt, refusedAt: action === "RECUSAR" ? now : power.refusedAt, revokedAt: action === "REVOGAR" ? now : power.revokedAt,
      events: { create: { eventType: action, description: `Procuração ${status.toLowerCase()}; escopo e histórico preservados.`, actorUsuarioId: actor.usuarioId } },
    } });
  });
}
