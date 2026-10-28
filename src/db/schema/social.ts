import { boolean, date, doublePrecision, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { exactNumeric } from "../decimal";

// Physical names and SQL types match the installed SUAS schema. This module
// describes existing tables only; it does not authorize schema synchronization.
const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () => timestamp("createdAt", { precision: 3 }).notNull().defaultNow();
const updatedAt = () => timestamp("updatedAt", { precision: 3 }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());
const day = (name: string) => date(name, { mode: "date" });

export const socialCatalogEntries = pgTable("SocialCatalogEntry", {
  id: id(), kind: text("kind").notNull(), name: text("name").notNull(), description: text("description"),
  allowedUnitTypes: text("allowedUnitTypes").array().notNull().default([]), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("SocialCatalogEntry_kind_name_key").on(t.kind, t.name), index("SocialCatalogEntry_kind_isActive_idx").on(t.kind, t.isActive)]);

export const socialMinimumWages = pgTable("SocialMinimumWage", {
  id: id(), validFrom: day("validFrom").notNull(), value: exactNumeric("value", { precision: 14, scale: 2 }).notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("SocialMinimumWage_validFrom_key").on(t.validFrom)]);

export const socialUnits = pgTable("SocialUnit", {
  id: id(), identificationCode: text("identificationCode"), implementationDate: day("implementationDate"), streetAddress: text("streetAddress"), municipality: text("municipality"),
  latitude: doublePrecision("latitude"), longitude: doublePrecision("longitude"), name: text("name").notNull(), type: text("type").notNull(), phone: text("phone"), email: text("email"),
  isActive: boolean("isActive").notNull().default(true), isConfidential: boolean("isConfidential").notNull().default(false), addressId: text("addressId"), realEstateId: text("realEstateId"), managerId: text("managerId"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("SocialUnit_identificationCode_key").on(t.identificationCode), uniqueIndex("SocialUnit_addressId_key").on(t.addressId)]);

export const socialNetworkOrganizations = pgTable("SocialNetworkOrganization", {
  id: id(), name: text("name").notNull(), taxId: text("taxId"), organizationType: text("organizationType").notNull(), address: text("address"), phone: text("phone"), email: text("email"),
  usesCounterReference: boolean("usesCounterReference").notNull().default(true), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const socialReferrals = pgTable("SocialReferral", {
  id: id(), unitId: text("unitId").notNull(), personId: text("personId"), familyId: text("familyId"), destinationOrganizationId: text("destinationOrganizationId").notNull(), reasonId: text("reasonId").notNull(), priorityTypeId: text("priorityTypeId"),
  referenceProfessional: text("referenceProfessional"), objective: text("objective").notNull(), observations: text("observations"), referredAt: day("referredAt").notNull(), createdBy: text("createdBy").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
  status: text("status").notNull().default("OPEN"), counterReferenceAt: day("counterReferenceAt"), counterReferenceProfessional: text("counterReferenceProfessional"), counterReferenceDescription: text("counterReferenceDescription"), counterReferenceBy: text("counterReferenceBy"),
}, t => [index("SocialReferral_unitId_referredAt_idx").on(t.unitId, t.referredAt), index("SocialReferral_personId_familyId_idx").on(t.personId, t.familyId)]);

export const socialPersonProfiles = pgTable("SocialPersonProfile", {
  id: id(), personId: text("personId").notNull(), nis: text("nis"), genderIdentity: text("genderIdentity"), sexualOrientation: text("sexualOrientation"), workSituation: text("workSituation"), occupation: text("occupation"), workplace: text("workplace"),
  admittedAt: day("admittedAt"), lastReviewedAt: day("lastReviewedAt").notNull().defaultNow(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("SocialPersonProfile_personId_key").on(t.personId), uniqueIndex("SocialPersonProfile_nis_key").on(t.nis)]);

export const socialPersonFacts = pgTable("SocialPersonFact", {
  id: id(), personId: text("personId").notNull(), catalogId: text("catalogId").notNull(), unitId: text("unitId").notNull(), kind: text("kind").notNull(), identifiedAt: day("identifiedAt").notNull(), observations: text("observations"),
  endedAt: day("endedAt"), endingReason: text("endingReason"), createdBy: text("createdBy").notNull(), endedBy: text("endedBy"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [index("SocialPersonFact_personId_kind_endedAt_idx").on(t.personId, t.kind, t.endedAt), index("SocialPersonFact_unitId_idx").on(t.unitId)]);

export const socialFinancialEntries = pgTable("SocialFinancialEntry", {
  id: id(), personId: text("personId").notNull(), catalogId: text("catalogId").notNull(), unitId: text("unitId").notNull(), kind: text("kind").notNull(), competence: day("competence").notNull(), value: exactNumeric("value", { precision: 14, scale: 2 }).notNull(),
  employmentDescription: text("employmentDescription"), observations: text("observations"), cancelledAt: timestamp("cancelledAt", { precision: 3 }), cancellationReason: text("cancellationReason"), createdBy: text("createdBy").notNull(), cancelledBy: text("cancelledBy"), createdAt: createdAt(),
}, t => [index("SocialFinancialEntry_personId_competence_kind_idx").on(t.personId, t.competence, t.kind), index("SocialFinancialEntry_unitId_idx").on(t.unitId)]);

export const socialProfessionalLinks = pgTable("SocialProfessionalLink", {
  id: id(), employeeId: text("employeeId").notNull(), unitId: text("unitId").notNull(), jobTitle: text("jobTitle").notNull(), specialty: text("specialty"), startsAt: day("startsAt").notNull(), endsAt: day("endsAt"),
  isActive: boolean("isActive").notNull().default(true), individualScope: text("individualScope").notNull().default("UNIT"), familyScope: text("familyScope").notNull().default("UNIT"), workingDays: integer("workingDays").array().notNull().default([1, 2, 3, 4, 5]),
  workStart: text("workStart").notNull().default("08:00"), workEnd: text("workEnd").notNull().default("17:00"), includeInRma: boolean("includeInRma").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("SocialProfessionalLink_employeeId_unitId_key").on(t.employeeId, t.unitId), index("SocialProfessionalLink_unitId_isActive_idx").on(t.unitId, t.isActive)]);

export const socialFamilies = pgTable("SocialFamily", {
  id: id(), familyCode: text("familyCode"), nis: text("nis"), income: doublePrecision("income"), perCapitaIncome: doublePrecision("perCapitaIncome"), vulnerabilities: text("vulnerabilities"), status: text("status").notNull().default("Ativo"),
  masterFamilyId: text("masterFamilyId"), representativeId: text("representativeId").notNull(), addressId: text("addressId"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("SocialFamily_familyCode_key").on(t.familyCode), uniqueIndex("SocialFamily_masterFamilyId_key").on(t.masterFamilyId), uniqueIndex("SocialFamily_representativeId_key").on(t.representativeId)]);

export const socialFamilyMembers = pgTable("SocialFamilyMember", {
  id: id(), kinship: text("kinship").notNull(), isDependent: boolean("isDependent").notNull().default(true), familyId: text("familyId").notNull(), personId: text("personId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("SocialFamilyMember_personId_key").on(t.personId)]);

export const socialAttendances = pgTable("SocialAttendance", {
  id: id(), involvedProfessionalIds: text("involvedProfessionalIds").array().notNull().default([]), date: timestamp("date", { precision: 3 }).notNull().defaultNow(), type: text("type").notNull(), description: text("description").notNull(), referrals: text("referrals"),
  secrecyLevel: text("secrecyLevel").notNull().default("Normal"), isActive: boolean("isActive").notNull().default(true), familyId: text("familyId").notNull(), personId: text("personId"), unitId: text("unitId").notNull(), professionalId: text("professionalId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const socialVisits = pgTable("SocialVisit", {
  id: id(), unitId: text("unitId"), scheduledDate: timestamp("scheduledDate", { precision: 3 }).notNull(), realizedDate: timestamp("realizedDate", { precision: 3 }), objective: text("objective").notNull(), report: text("report"),
  status: text("status").notNull().default("Agendada"), familyId: text("familyId").notNull(), professionalId: text("professionalId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const socialBenefits = pgTable("SocialBenefit", {
  id: id(), dispensingMode: text("dispensingMode").notNull().default("QUANTITY"), requiresApproval: boolean("requiresApproval").notNull().default(false), quotaControlled: boolean("quotaControlled").notNull().default(false), maxPerRequest: integer("maxPerRequest").notNull().default(1),
  authorizerEmployeeId: text("authorizerEmployeeId"), name: text("name").notNull(), description: text("description"), isRecurrent: boolean("isRecurrent").notNull().default(false), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const socialBenefitStocks = pgTable("SocialBenefitStock", {
  id: id(), benefitId: text("benefitId").notNull(), unitId: text("unitId").notNull(), quantity: integer("quantity").notNull().default(0), updatedAt: updatedAt(),
}, t => [uniqueIndex("SocialBenefitStock_benefitId_unitId_key").on(t.benefitId, t.unitId)]);

export const socialBenefitStockMovements = pgTable("SocialBenefitStockMovement", {
  id: id(), benefitId: text("benefitId").notNull(), unitId: text("unitId").notNull(), direction: text("direction").notNull(), quantity: integer("quantity").notNull(), supplierName: text("supplierName"), invoiceNumber: text("invoiceNumber"), invoiceDate: day("invoiceDate"),
  invoiceValue: exactNumeric("invoiceValue", { precision: 14, scale: 2 }), requestItemId: text("requestItemId"), createdBy: text("createdBy").notNull(), createdAt: createdAt(),
}, t => [uniqueIndex("SocialBenefitStockMovement_requestItemId_key").on(t.requestItemId), index("SocialBenefitStockMovement_benefitId_unitId_createdAt_idx").on(t.benefitId, t.unitId, t.createdAt)]);

export const socialBenefitQuotas = pgTable("SocialBenefitQuota", {
  id: id(), benefitId: text("benefitId").notNull(), unitId: text("unitId").notNull(), startsAt: day("startsAt").notNull(), endsAt: day("endsAt").notNull(), total: integer("total").notNull(), consumed: integer("consumed").notNull().default(0), createdAt: createdAt(),
}, t => [index("SocialBenefitQuota_benefitId_unitId_startsAt_endsAt_idx").on(t.benefitId, t.unitId, t.startsAt, t.endsAt)]);

export const socialBenefitRequests = pgTable("SocialBenefitRequest", {
  id: id(), familyId: text("familyId").notNull(), unitId: text("unitId").notNull(), personId: text("personId"), reason: text("reason").notNull(), createdBy: text("createdBy").notNull(), createdAt: createdAt(), cancelledAt: timestamp("cancelledAt", { precision: 3 }), cancellationReason: text("cancellationReason"),
}, t => [index("SocialBenefitRequest_unitId_createdAt_idx").on(t.unitId, t.createdAt)]);

export const socialBenefitRequestItems = pgTable("SocialBenefitRequestItem", {
  id: id(), requestId: text("requestId").notNull(), benefitId: text("benefitId").notNull(), quantity: integer("quantity").notNull(), value: exactNumeric("value", { precision: 14, scale: 2 }), status: text("status").notNull().default("PENDING"),
  approvalRequired: boolean("approvalRequired").notNull(), dispensingMode: text("dispensingMode").notNull(), quotaControlled: boolean("quotaControlled").notNull(), authorizerEmployeeId: text("authorizerEmployeeId"), evaluatedBy: text("evaluatedBy"), evaluatedAt: timestamp("evaluatedAt", { precision: 3 }),
  assessment: text("assessment"), deliveredBy: text("deliveredBy"), deliveredAt: timestamp("deliveredAt", { precision: 3 }), deliveryReason: text("deliveryReason"),
}, t => [index("SocialBenefitRequestItem_status_authorizerEmployeeId_idx").on(t.status, t.authorizerEmployeeId)]);

export const socialBenefitConcessions = pgTable("SocialBenefitConcession", {
  id: id(), date: timestamp("date", { precision: 3 }).notNull().defaultNow(), quantity: integer("quantity").notNull().default(1), value: doublePrecision("value"), status: text("status").notNull().default("Concedido"), benefitId: text("benefitId").notNull(), familyId: text("familyId").notNull(),
  personId: text("personId"), professionalId: text("professionalId").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const socialPrograms = pgTable("SocialProgram", {
  id: id(), name: text("name").notNull(), description: text("description"), sphere: text("sphere").notNull().default("Municipal"), isActive: boolean("isActive").notNull().default(true), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const cadUnicoRecords = pgTable("CadUnicoRecord", {
  id: id(), nis: text("nis").notNull(), cpf: text("cpf").notNull(), nomeCompleto: text("nomeCompleto").notNull(), rendaPerCapita: exactNumeric("rendaPerCapita", { precision: 18, scale: 2 }).notNull(), composicaoFamiliar: integer("composicaoFamiliar").notNull().default(1),
  endereco: text("endereco"), municipio: text("municipio").notNull(), uf: text("uf").notNull(), statusCadastral: text("statusCadastral").notNull().default("ATUALIZADO"), dataAtualizacao: timestamp("dataAtualizacao", { precision: 3 }).notNull().defaultNow(), createdAt: createdAt(),
}, t => [uniqueIndex("CadUnicoRecord_nis_key").on(t.nis)]);

export const suasProntuarioRma = pgTable("SuasProntuarioRma", {
  id: id(), nis: text("nis").notNull(), nomeCidadao: text("nomeCidadao").notNull(), unidadeAtendimento: text("unidadeAtendimento").notNull(), tipoAtendimento: text("tipoAtendimento").notNull(), detalhesRma: text("detalhesRma").notNull(), tecnicoResponsavel: text("tecnicoResponsavel").notNull(),
  dataAtendimento: timestamp("dataAtendimento", { precision: 3 }).notNull().defaultNow(), status: text("status").notNull().default("FINALIZADO"), createdAt: createdAt(),
});
