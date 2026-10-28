import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { Decimal, exactNumeric } from "../decimal";
import type { JsonValue } from "../json";

// Local runtime mappings only. The independent PostgreSQL catalog and the 156
// historical migrations remain the DDL authority; these are not registered for DDL.
const id = () => text("id").primaryKey().$defaultFn(createId);
const date = (name: string) => timestamp(name, { precision: 3 });
const createdAt = () => date("createdAt").notNull().defaultNow();
const updatedAt = () => date("updatedAt").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
const money = (name: string) => exactNumeric(name, { precision: 18, scale: 2 });
const zero = (name: string) => money(name).notNull().default(new Decimal(0));
const rate = (name: string) => exactNumeric(name, { precision: 9, scale: 6 });
const json = (name: string) => jsonb(name).$type<JsonValue>();

export const simplesImportBatches = pgTable("SimplesImportBatch", {
  id: id(), sourceType: text("sourceType").notNull(), originMode: text("originMode").notNull().default("CONTROLLED_INTERNAL"), fileName: text("fileName").notNull(), checksum: text("checksum").notNull(), competence: text("competence"), status: text("status").notNull().default("PROCESSADO"), totalRows: integer("totalRows").notNull().default(0), acceptedRows: integer("acceptedRows").notNull().default(0), rejectedRows: integer("rejectedRows").notNull().default(0), payload: json("payload").notNull(), errorSummary: json("errorSummary"), createdByUsuarioId: text("createdByUsuarioId"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const simplesFiscalRecords = pgTable("SimplesFiscalRecord", {
  id: id(), importBatchId: text("importBatchId").notNull(), taxpayerId: text("taxpayerId").notNull(), competence: text("competence").notNull(), recordType: text("recordType").notNull(), nationalRevenueDecimal: zero("nationalRevenueDecimal"), declaredServiceDecimal: zero("declaredServiceDecimal"), taxableBaseDecimal: zero("taxableBaseDecimal"), rate: rate("rate"), municipalIssDecimal: zero("municipalIssDecimal"), confirmedPaymentDecimal: zero("confirmedPaymentDecimal"), activityCode: text("activityCode"), paymentCode: text("paymentCode"), isEstimate: boolean("isEstimate").notNull().default(false), rawData: json("rawData").notNull(), status: text("status").notNull().default("VALIDO"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const simplesOptionPeriods = pgTable("SimplesOptionPeriod", {
  id: id(), taxpayerId: text("taxpayerId").notNull(), regime: text("regime").notNull(), startDate: date("startDate").notNull(), endDate: date("endDate"), sourceBatchId: text("sourceBatchId"), status: text("status").notNull().default("ATIVO"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const simplesDivergences = pgTable("SimplesDivergence", {
  id: id(), taxpayerId: text("taxpayerId").notNull(), competence: text("competence").notNull(), divergenceType: text("divergenceType").notNull(), status: text("status").notNull().default("ABERTA"), nfseServiceDecimal: zero("nfseServiceDecimal"), declaredServiceDecimal: zero("declaredServiceDecimal"), revenueDifferenceDecimal: zero("revenueDifferenceDecimal"), municipalIssDecimal: zero("municipalIssDecimal"), confirmedPaymentDecimal: zero("confirmedPaymentDecimal"), paymentDifferenceDecimal: zero("paymentDifferenceDecimal"), details: json("details").notNull(), dteMessageId: text("dteMessageId"), lastProcessedAt: date("lastProcessedAt").notNull().defaultNow(), resolvedAt: date("resolvedAt"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const simplesRegularizationEvents = pgTable("SimplesRegularizationEvent", {
  id: id(), divergenceId: text("divergenceId").notNull(), eventType: text("eventType").notNull(), description: text("description").notNull(), payload: json("payload"), actorUsuarioId: text("actorUsuarioId"), createdAt: createdAt(),
});
export const simplesExclusionCases = pgTable("SimplesExclusionCase", {
  id: id(), taxpayerId: text("taxpayerId").notNull(), competence: text("competence").notNull(), reason: text("reason").notNull(), calendarRevenueDecimal: money("calendarRevenueDecimal").notNull(), legalLimitDecimal: money("legalLimitDecimal").notNull(), status: text("status").notNull().default("PREPARADA"), documentId: text("documentId"), dteMessageId: text("dteMessageId"), exportContent: text("exportContent"), externalReceipt: text("externalReceipt"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const simplesPaymentAllocations = pgTable("SimplesPaymentAllocation", {
  id: id(), importBatchId: text("importBatchId").notNull(), taxpayerId: text("taxpayerId").notNull(), competence: text("competence").notNull(), revenueCode: text("revenueCode").notNull(), taxpayerRegime: text("taxpayerRegime").notNull(), nationalDasDecimal: zero("nationalDasDecimal"), municipalComponentDecimal: money("municipalComponentDecimal").notNull(), confirmedDecimal: money("confirmedDecimal").notNull(), differenceDecimal: money("differenceDecimal").notNull(), createdAt: createdAt(),
});

export const desifInstitutions = pgTable("DesifFinancialInstitution", {
  id: id(), taxpayerId: text("taxpayerId"), name: text("name").notNull(), baseCnpj: text("baseCnpj").notNull(), status: text("status").notNull().default("ATIVA"), validFrom: date("validFrom").notNull(), validUntil: date("validUntil"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const desifAgencies = pgTable("DesifAgency", {
  id: id(), institutionId: text("institutionId").notNull(), economicRegistrationId: text("economicRegistrationId"), code: text("code").notNull(), name: text("name").notNull(), fullCnpj: text("fullCnpj").notNull(), municipalRegistration: text("municipalRegistration"), status: text("status").notNull().default("ATIVA"), validFrom: date("validFrom").notNull(), validUntil: date("validUntil"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const desifCosifAccounts = pgTable("DesifCosifAccount", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), level: integer("level").notNull(), nature: text("nature").notNull(), validFrom: date("validFrom").notNull(), validUntil: date("validUntil"), active: boolean("active").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const desifPgccPlans = pgTable("DesifPgccPlan", {
  id: id(), institutionId: text("institutionId").notNull(), version: text("version").notNull(), status: text("status").notNull().default("ATIVO"), source: text("source").notNull().default("INSTITUICAO"), validFrom: date("validFrom").notNull(), validUntil: date("validUntil"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const desifPgccAccounts = pgTable("DesifPgccAccount", {
  id: id(), planId: text("planId").notNull(), code: text("code").notNull(), name: text("name").notNull(), description: text("description"), desifTaxCode: text("desifTaxCode"), serviceItem: text("serviceItem"), active: boolean("active").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const desifPgccCosifLinks = pgTable("DesifPgccCosifLink", {
  id: id(), pgccAccountId: text("pgccAccountId").notNull(), cosifAccountId: text("cosifAccountId").notNull(), validFrom: date("validFrom").notNull(), validUntil: date("validUntil"), createdAt: createdAt(),
});
export const desifSubtitles = pgTable("DesifSubtitle", {
  id: id(), pgccAccountId: text("pgccAccountId").notNull(), code: text("code").notNull(), name: text("name").notNull(), serviceItem: text("serviceItem"), taxRate: rate("taxRate").notNull().default(new Decimal(0)), validFrom: date("validFrom").notNull(), validUntil: date("validUntil"), active: boolean("active").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const desifTariffs = pgTable("DesifTariff", {
  id: id(), institutionId: text("institutionId").notNull(), code: text("code").notNull(), name: text("name").notNull(), amountDecimal: money("amountDecimal").notNull(), validFrom: date("validFrom").notNull(), validUntil: date("validUntil"), active: boolean("active").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const desifPackages = pgTable("DesifPackage", {
  id: id(), institutionId: text("institutionId").notNull(), code: text("code").notNull(), name: text("name").notNull(), validFrom: date("validFrom").notNull(), validUntil: date("validUntil"), active: boolean("active").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const desifPackageItems = pgTable("DesifPackageItem", {
  id: id(), packageId: text("packageId").notNull(), tariffId: text("tariffId").notNull(), quantity: integer("quantity").notNull().default(1), createdAt: createdAt(),
});
export const desifImportBatches = pgTable("DesifImportBatch", {
  id: id(), institutionId: text("institutionId").notNull(), agencyId: text("agencyId"), competence: text("competence").notNull(), moduleType: text("moduleType").notNull(), fileName: text("fileName").notNull(), checksum: text("checksum").notNull(), abrasfVersion: text("abrasfVersion").notNull(), originMode: text("originMode").notNull().default("CONTROLLED_INTERNAL"), status: text("status").notNull().default("RECEBIDO"), signaturePolicy: text("signaturePolicy").notNull().default("NAO_CONFIGURADA"), signatureStatus: text("signatureStatus").notNull().default("NAO_VERIFICADA"), payload: json("payload").notNull(), inconsistencies: json("inconsistencies"), validationSummary: json("validationSummary"), receiptNumber: text("receiptNumber"), receivedAt: date("receivedAt").notNull().defaultNow(), validatedAt: date("validatedAt"), processedAt: date("processedAt"), createdByUsuarioId: text("createdByUsuarioId"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const desifAssessments = pgTable("DesifAssessment", {
  id: id(), importBatchId: text("importBatchId").notNull(), agencyId: text("agencyId").notNull(), subtitleId: text("subtitleId").notNull(), competence: text("competence").notNull(), revenueDecimal: money("revenueDecimal").notNull(), deductionDecimal: zero("deductionDecimal"), taxableBaseDecimal: money("taxableBaseDecimal").notNull(), rate: rate("rate").notNull(), grossTaxDecimal: money("grossTaxDecimal").notNull(), creditDecimal: zero("creditDecimal"), debitAdjustmentDecimal: zero("debitAdjustmentDecimal"), taxDueDecimal: money("taxDueDecimal").notNull(), status: text("status").notNull().default("APURADA"), calculationSnapshot: json("calculationSnapshot").notNull(), taxAssessmentId: text("taxAssessmentId"), guideId: text("guideId"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const desifTrialBalances = pgTable("DesifTrialBalance", {
  id: id(), importBatchId: text("importBatchId").notNull(), agencyId: text("agencyId").notNull(), pgccAccountId: text("pgccAccountId").notNull(), competence: text("competence").notNull(), openingBalanceDecimal: zero("openingBalanceDecimal"), creditsDecimal: zero("creditsDecimal"), debitsDecimal: zero("debitsDecimal"), calculatedCloseDecimal: zero("calculatedCloseDecimal"), declaredCloseDecimal: zero("declaredCloseDecimal"), differenceDecimal: zero("differenceDecimal"), inconsistency: text("inconsistency"), createdAt: createdAt(),
});
export const desifPackageMovements = pgTable("DesifPackageMovement", {
  id: id(), importBatchId: text("importBatchId").notNull(), agencyId: text("agencyId").notNull(), packageId: text("packageId").notNull(), competence: text("competence").notNull(), accountHolderQuantity: integer("accountHolderQuantity").notNull(), potentialRevenueDecimal: money("potentialRevenueDecimal").notNull(), collectedRevenueDecimal: money("collectedRevenueDecimal").notNull(), differenceDecimal: money("differenceDecimal").notNull(), assessmentImpactDecimal: money("assessmentImpactDecimal").notNull(), details: json("details").notNull(), createdAt: createdAt(),
});
export const desifFiscalCases = pgTable("DesifFiscalCase", {
  id: id(), institutionId: text("institutionId").notNull(), agencyId: text("agencyId"), assessmentId: text("assessmentId"), competence: text("competence").notNull(), findingType: text("findingType").notNull(), findingDescription: text("findingDescription").notNull(), status: text("status").notNull().default("ABERTA"), processId: text("processId"), serviceOrderNumber: text("serviceOrderNumber"), tiafDocumentId: text("tiafDocumentId"), mapDocumentId: text("mapDocumentId"), infractionId: text("infractionId"), dteMessageId: text("dteMessageId"), guideId: text("guideId"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const desifFiscalEvents = pgTable("DesifFiscalEvent", {
  id: id(), fiscalCaseId: text("fiscalCaseId").notNull(), eventType: text("eventType").notNull(), description: text("description").notNull(), payload: json("payload"), actorUsuarioId: text("actorUsuarioId"), createdAt: createdAt(),
});

export const collectionPortfolios = pgTable("TaxCollectionPortfolio", {
  id: id(), name: text("name").notNull(), profileId: text("profileId"), selectionMode: text("selectionMode").notNull().default("MANUAL"), status: text("status").notNull().default("ATIVA"), selectionSnapshot: json("selectionSnapshot").notNull(), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const collectionPortfolioItems = pgTable("TaxCollectionPortfolioItem", {
  id: id(), portfolioId: text("portfolioId").notNull(), taxpayerId: text("taxpayerId").notNull(), sourceType: text("sourceType").notNull(), sourceId: text("sourceId").notNull(), originalDecimal: money("originalDecimal").notNull(), outstandingDecimal: money("outstandingDecimal").notNull(), dueDate: date("dueDate"), status: text("status").notNull().default("PENDENTE"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const collectionActions = pgTable("TaxCollectionAction", {
  id: id(), portfolioId: text("portfolioId").notNull(), portfolioItemId: text("portfolioItemId"), taxpayerId: text("taxpayerId").notNull(), actionType: text("actionType").notNull(), modality: text("modality").notNull(), channel: text("channel").notNull(), status: text("status").notNull().default("AGENDADA"), scheduledAt: date("scheduledAt").notNull(), performedAt: date("performedAt"), resultCode: text("resultCode"), resultDescription: text("resultDescription"), nextActionAt: date("nextActionAt"), evidenceDocumentId: text("evidenceDocumentId"), dteMessageId: text("dteMessageId"), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const collectionActionEvents = pgTable("TaxCollectionActionEvent", {
  id: id(), actionId: text("actionId").notNull(), eventType: text("eventType").notNull(), description: text("description").notNull(), payload: json("payload"), actorUsuarioId: text("actorUsuarioId"), createdAt: createdAt(),
});
export const installmentRules = pgTable("TaxInstallmentRule", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), legalReference: text("legalReference").notNull(), minInstallments: integer("minInstallments").notNull().default(1), maxInstallments: integer("maxInstallments").notNull(), minQuotaDecimal: money("minQuotaDecimal").notNull(), discountConfiguration: json("discountConfiguration").notNull(), feeConfiguration: json("feeConfiguration").notNull(), breakConfiguration: json("breakConfiguration").notNull(), dueDayOptions: json("dueDayOptions").notNull(), effectiveFrom: date("effectiveFrom").notNull(), effectiveUntil: date("effectiveUntil"), active: boolean("active").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const installmentAgreements = pgTable("TaxInstallmentAgreement", {
  id: id(), agreementNumber: text("agreementNumber").notNull(), taxpayerId: text("taxpayerId").notNull(), ruleId: text("ruleId").notNull(), parentAgreementId: text("parentAgreementId"), agreementType: text("agreementType").notNull().default("ORIGINAL"), status: text("status").notNull().default("ATIVO"), installmentCount: integer("installmentCount").notNull(), dueDay: integer("dueDay").notNull(), originalDebtDecimal: money("originalDebtDecimal").notNull(), discountDecimal: zero("discountDecimal"), feesDecimal: zero("feesDecimal"), totalAgreementDecimal: money("totalAgreementDecimal").notNull(), paidDecimal: zero("paidDecimal"), balanceDecimal: money("balanceDecimal").notNull(), simulationSnapshot: json("simulationSnapshot").notNull(), termDocumentId: text("termDocumentId"), createdByUsuarioId: text("createdByUsuarioId").notNull(), adheredAt: date("adheredAt").notNull().defaultNow(), brokenAt: date("brokenAt"), reactivatedAt: date("reactivatedAt"), cancelledAt: date("cancelledAt"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const installmentDebts = pgTable("TaxInstallmentDebt", {
  id: id(), agreementId: text("agreementId").notNull(), sourceType: text("sourceType").notNull(), sourceId: text("sourceId").notNull(), originLabel: text("originLabel").notNull(), originalAmountDecimal: money("originalAmountDecimal").notNull(), revisedAmountDecimal: money("revisedAmountDecimal"), createdAt: createdAt(),
});
export const installmentQuotas = pgTable("TaxInstallmentQuota", {
  id: id(), agreementId: text("agreementId").notNull(), quotaNumber: integer("quotaNumber").notNull(), dueDate: date("dueDate").notNull(), originalDecimal: money("originalDecimal").notNull(), paidDecimal: zero("paidDecimal"), balanceDecimal: money("balanceDecimal").notNull(), status: text("status").notNull().default("ABERTA"), guideId: text("guideId"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const installmentPaymentAllocations = pgTable("TaxInstallmentPaymentAllocation", {
  id: id(), agreementId: text("agreementId").notNull(), quotaId: text("quotaId").notNull(), paymentKey: text("paymentKey").notNull(), amountDecimal: money("amountDecimal").notNull(), paymentDate: date("paymentDate").notNull(), paymentMode: text("paymentMode").notNull().default("FORA_DA_PARCELA"), createdAt: createdAt(),
});
export const installmentEvents = pgTable("TaxInstallmentEvent", {
  id: id(), agreementId: text("agreementId").notNull(), eventType: text("eventType").notNull(), description: text("description").notNull(), payload: json("payload"), actorUsuarioId: text("actorUsuarioId"), createdAt: createdAt(),
});
export const taxpayerPortalAccesses = pgTable("TaxpayerPortalAccess", {
  id: id(), usuarioId: text("usuarioId").notNull(), taxpayerId: text("taxpayerId").notNull(), accessType: text("accessType").notNull().default("TITULAR"), scopes: json("scopes").notNull(), status: text("status").notNull().default("ATIVO"), grantedByUsuarioId: text("grantedByUsuarioId").notNull(), grantedAt: date("grantedAt").notNull().defaultNow(), revokedAt: date("revokedAt"),
});
export const benefitRules = pgTable("TaxBenefitRule", {
  id: id(), code: text("code").notNull(), name: text("name").notNull(), benefitType: text("benefitType").notNull(), legalReference: text("legalReference").notNull(), eligibility: json("eligibility").notNull(), calculation: json("calculation").notNull(), effectiveFrom: date("effectiveFrom").notNull(), effectiveUntil: date("effectiveUntil"), active: boolean("active").notNull().default(true), createdByUsuarioId: text("createdByUsuarioId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const benefitGrants = pgTable("TaxBenefitGrant", {
  id: id(), ruleId: text("ruleId").notNull(), taxpayerId: text("taxpayerId").notNull(), sourceType: text("sourceType").notNull(), sourceId: text("sourceId").notNull(), originalAmountDecimal: money("originalAmountDecimal").notNull(), creditDecimal: zero("creditDecimal"), reductionDecimal: zero("reductionDecimal"), renunciationDecimal: zero("renunciationDecimal"), finalAmountDecimal: money("finalAmountDecimal").notNull(), status: text("status").notNull().default("CONCEDIDO"), calculationSnapshot: json("calculationSnapshot").notNull(), grantedByUsuarioId: text("grantedByUsuarioId").notNull(), grantedAt: date("grantedAt").notNull().defaultNow(), createdAt: createdAt(),
});
export const prizeDraws = pgTable("TaxPrizeDraw", {
  id: id(), slug: text("slug").notNull(), name: text("name").notNull(), year: integer("year").notNull(), drawNumber: integer("drawNumber").notNull(), status: text("status").notNull().default("RASCUNHO"), scheduledAt: date("scheduledAt").notNull(), eligibilityRules: json("eligibilityRules").notNull(), requiresPayment: boolean("requiresPayment").notNull().default(false), taxpayerTypes: json("taxpayerTypes").notNull(), winnerCount: integer("winnerCount").notNull().default(1), technicalSeed: text("technicalSeed").notNull(), officialActReference: text("officialActReference"), createdByUsuarioId: text("createdByUsuarioId").notNull(), executedAt: date("executedAt"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const prizeCoupons = pgTable("TaxPrizeCoupon", {
  id: id(), drawId: text("drawId").notNull(), couponNumber: text("couponNumber").notNull(), taxpayerId: text("taxpayerId").notNull(), sourceDocumentType: text("sourceDocumentType").notNull(), sourceDocumentId: text("sourceDocumentId").notNull(), eligibilitySnapshot: json("eligibilitySnapshot").notNull(), status: text("status").notNull().default("ELEGIVEL"), issuedAt: date("issuedAt").notNull().defaultNow(),
});
export const prizeExecutions = pgTable("TaxPrizeExecution", {
  id: id(), drawId: text("drawId").notNull(), executionNumber: integer("executionNumber").notNull(), algorithm: text("algorithm").notNull(), seedHash: text("seedHash").notNull(), inputHash: text("inputHash").notNull(), resultHash: text("resultHash").notNull(), status: text("status").notNull().default("CONCLUIDA"), executedAt: date("executedAt").notNull().defaultNow(), executedByUsuarioId: text("executedByUsuarioId").notNull(),
});
export const prizeWinners = pgTable("TaxPrizeWinner", {
  id: id(), executionId: text("executionId").notNull(), couponId: text("couponId").notNull(), position: integer("position").notNull(), resultKey: text("resultKey").notNull(), createdAt: createdAt(),
});

export const vafExercises = pgTable("VafExercise", {
  id: id(), year: integer("year").notNull(), label: text("label"), active: boolean("active").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const vafAccountants = pgTable("VafAccountant", {
  id: id(), cpfCnpj: text("cpfCnpj").notNull(), name: text("name").notNull(), email: text("email"), phone: text("phone"), active: boolean("active").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const vafCompanies = pgTable("VafCompany", {
  id: id(), cnpj: text("cnpj").notNull(), corporateName: text("corporateName").notNull(), tradeName: text("tradeName"), stateInsc: text("stateInsc"), address: text("address"), phone: text("phone"), email: text("email"), cnae: text("cnae"), taxRegime: text("taxRegime"), accountantId: text("accountantId"), active: boolean("active").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const vafRules = pgTable("VafRule", {
  id: id(), exerciseId: text("exerciseId").notNull(), cfop: text("cfop").notNull(), cfopDescription: text("cfopDescription"), composesVaf: boolean("composesVaf").notNull().default(true), formula: text("formula").notNull(), formulaVersion: text("formulaVersion").notNull().default("1"), contrapartidaCfop: text("contrapartidaCfop"), contrapartidaRule: text("contrapartidaRule"), effectiveFrom: date("effectiveFrom").notNull(), effectiveUntil: date("effectiveUntil"), situation: text("situation").notNull().default("VIGENTE"), createdAt: createdAt(), updatedAt: updatedAt(),
});
const vafImportColumns = () => ({ id: id(), companyId: text("companyId").notNull(), exerciseId: text("exerciseId").notNull(), competency: text("competency").notNull(), version: text("version").notNull().default("1"), fileName: text("fileName").notNull(), fileHash: text("fileHash").notNull(), rawData: json("rawData").notNull(), parsedData: json("parsedData"), status: text("status").notNull().default("IMPORTADO"), importedBy: text("importedBy").notNull(), importedAt: date("importedAt").notNull().defaultNow(), processedAt: date("processedAt"), parentImportId: text("parentImportId") });
export const vafEfdImports = pgTable("VafEfdImport", vafImportColumns());
export const vafGiaImports = pgTable("VafGiaImport", vafImportColumns());
export const vafMonthlySummaries = pgTable("VafMonthlySummary", {
  id: id(), exerciseId: text("exerciseId").notNull(), companyId: text("companyId").notNull(), competency: text("competency").notNull(), cfop: text("cfop").notNull(), cfopDescription: text("cfopDescription"), efdSaida: zero("efdSaida"), efdEntrada: zero("efdEntrada"), giaSaida: zero("giaSaida"), giaEntrada: zero("giaEntrada"), composesVaf: boolean("composesVaf").notNull().default(true), vafCalculated: zero("vafCalculated"), formulaApplied: text("formulaApplied"), divergences: json("divergences"), sourcePriority: text("sourcePriority").notNull().default("EFD"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const vafResults = pgTable("VafResult", {
  id: id(), exerciseId: text("exerciseId").notNull(), companyId: text("companyId").notNull(), competency: text("competency").notNull(), sourceType: text("sourceType").notNull(), saidaElegivel: zero("saidaElegivel"), entradaElegivel: zero("entradaElegivel"), vafValue: zero("vafValue"), participation: rate("participation").notNull().default(new Decimal(0)), rank: integer("rank"), isSimples: boolean("isSimples").notNull().default(false), simplesData: json("simplesData"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const vafCompanyIndices = pgTable("VafCompanyIndex", {
  id: id(), exerciseId: text("exerciseId").notNull(), companyId: text("companyId").notNull(), competency: text("competency").notNull(), indexProvisorio: rate("indexProvisorio"), indexDefinitivo: rate("indexDefinitivo"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const vafMunicipalIndices = pgTable("VafMunicipalIndex", {
  id: id(), exerciseId: text("exerciseId").notNull(), competency: text("competency").notNull(), indexProvisorio: rate("indexProvisorio"), indexDefinitivo: rate("indexDefinitivo"), totalVafProvisorio: money("totalVafProvisorio"), totalVafDefinitivo: money("totalVafDefinitivo"), createdAt: createdAt(), updatedAt: updatedAt(),
});
export const vafRepasses = pgTable("VafRepasse", {
  id: id(), exerciseId: text("exerciseId").notNull(), competency: text("competency").notNull(), weekNumber: integer("weekNumber"), municipalValue: money("municipalValue").notNull(), stateTotalValue: money("stateTotalValue").notNull(), sourceFile: text("sourceFile"), importedAt: date("importedAt").notNull().defaultNow(), version: text("version").notNull().default("1"), parentRepasseId: text("parentRepasseId"),
});
export const vafProtocols = pgTable("VafProtocol", {
  id: id(), protocolNumber: text("protocolNumber").notNull(), companyId: text("companyId"), accountantId: text("accountantId"), documentType: text("documentType").notNull(), competency: text("competency").notNull(), exerciseId: text("exerciseId").notNull(), status: text("status").notNull().default("RECEBIDO"), receivedAt: date("receivedAt").notNull().defaultNow(), processedAt: date("processedAt"), metadata: json("metadata"),
});
export const vafNotifications = pgTable("VafNotification", {
  id: id(), companyId: text("companyId"), accountantId: text("accountantId"), type: text("type").notNull(), title: text("title").notNull(), content: text("content").notNull(), competency: text("competency"), exerciseId: text("exerciseId"), status: text("status").notNull().default("ENVIADA"), sentAt: date("sentAt").notNull().defaultNow(), readAt: date("readAt"), emailSent: boolean("emailSent").notNull().default(false), emailSentAt: date("emailSentAt"), metadata: json("metadata"),
});
export const vafActivities = pgTable("VafActivity", {
  id: id(), exerciseId: text("exerciseId").notNull(), companyId: text("companyId").notNull(), competency: text("competency").notNull(), activityType: text("activityType").notNull(), title: text("title").notNull(), description: text("description"), status: text("status").notNull().default("ABERTA"), assignedTo: text("assignedTo"), openedAt: date("openedAt").notNull().defaultNow(), forwardedAt: date("forwardedAt"), readAt: date("readAt"), analyzedAt: date("analyzedAt"), closedAt: date("closedAt"), metadata: json("metadata"),
});
export const vafEstimates = pgTable("VafEstimate", {
  id: id(), exerciseId: text("exerciseId").notNull(), companyId: text("companyId"), competency: text("competency").notNull(), method: text("method").notNull(), realizedMonths: integer("realizedMonths").notNull(), realizedValue: money("realizedValue").notNull(), estimatedValue: money("estimatedValue").notNull(), hypothesis: text("hypothesis"), createdBy: text("createdBy").notNull(), createdAt: createdAt(),
});
export const vafCrossChecks = pgTable("VafCrossCheck", {
  id: id(), exerciseId: text("exerciseId").notNull(), companyId: text("companyId").notNull(), competency: text("competency").notNull(), cfop: text("cfop").notNull(), checkType: text("checkType").notNull(), description: text("description").notNull(), severity: text("severity").notNull().default("ALERTA"), efdValue: money("efdValue"), giaValue: money("giaValue"), expectedValue: money("expectedValue"), difference: money("difference"), status: text("status").notNull().default("ABERTA"), resolvedAt: date("resolvedAt"), resolvedBy: text("resolvedBy"), createdAt: createdAt(),
});
export const vafCfopEntries = pgTable("VafCfopEntry", {
  id: id(), exerciseId: text("exerciseId").notNull(), companyId: text("companyId").notNull(), competency: text("competency").notNull(), cfop: text("cfop").notNull(), cfopDescription: text("cfopDescription"), operationType: text("operationType").notNull(), efdValue: zero("efdValue"), giaValue: zero("giaValue"), composesVaf: boolean("composesVaf").notNull().default(true), onlyContabil: boolean("onlyContabil").notNull().default(false), divergence: json("divergence"), formulaDetail: text("formulaDetail"), createdAt: createdAt(),
});
