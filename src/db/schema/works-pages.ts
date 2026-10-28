import { boolean, date, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { exactNumeric } from "../decimal";
import type { JsonValue } from "../json";

// Read mappings for the page projections. Physical names/nullability/precision
// checked against database-before-2026-10-28T01-26-00.861Z/catalog.json.
const id = () => text("id").primaryKey();
const instant = (name: string) => timestamp(name, { precision: 3 });
const day = (name: string) => date(name, { mode: "date" });
const json = (name: string) => jsonb(name).$type<JsonValue>();
const area = (name: string) => exactNumeric(name, { precision: 14, scale: 4 });

export const pageDistributions = pgTable("ConstructionDistributionVersion", {
  id: id(), departmentId: text("departmentId").notNull(), version: integer("version").notNull(), strategy: text("strategy").notNull(), employeeId: text("employeeId"), publishedBy: text("publishedBy").notNull(), publishedAt: instant("publishedAt").notNull(),
});
export const pageConsultations = pgTable("ConstructionConsultation", {
  id: id(), caseId: text("caseId").notNull(), requestKey: text("requestKey").notNull(), requestedBy: text("requestedBy").notNull(), sourceDepartmentId: text("sourceDepartmentId").notNull(), targetDepartmentId: text("targetDepartmentId").notNull(), question: text("question").notNull(), dueAt: instant("dueAt").notNull(), createdAt: instant("createdAt").notNull(),
});
export const pageConsultationResponses = pgTable("ConstructionConsultationResponse", {
  id: id(), consultationId: text("consultationId").notNull(), employeeId: text("employeeId").notNull(), actorId: text("actorId").notNull(), opinion: text("opinion").notNull(), createdAt: instant("createdAt").notNull(),
});
export const pageExtractions = pgTable("ConstructionPlanExtraction", {
  id: id(), caseId: text("caseId").notNull(), requestKey: text("requestKey").notNull(), filename: text("filename").notNull(), sourceUrl: text("sourceUrl").notNull(), sourceHash: text("sourceHash").notNull(), engine: text("engine").notNull(), model: text("model").notNull(), status: text("status").notNull(), pages: json("pages").notNull(), measurements: json("measurements").notNull(), comparison: json("comparison").notNull(), limitations: json("limitations").notNull(), createdBy: text("createdBy").notNull(), createdAt: instant("createdAt").notNull(),
});
export const pageReplacements = pgTable("ConstructionAnalystReplacement", {
  id: id(), caseId: text("caseId").notNull(), requestKey: text("requestKey").notNull(), previousAnalystId: text("previousAnalystId"), previousAssignedId: text("previousAssignedId"), replacementEmployeeId: text("replacementEmployeeId").notNull(), departmentId: text("departmentId").notNull(), reason: text("reason").notNull(), createdBy: text("createdBy").notNull(), createdAt: instant("createdAt").notNull(),
});
export const pageFederalExports = pgTable("ConstructionFederalExport", {
  id: id(), requestKey: text("requestKey").notNull(), scope: text("scope").notNull(), period: text("period").notNull(), version: integer("version").notNull(), layout: text("layout").notNull(), payload: text("payload").notNull(), hashSha256: text("hashSha256").notNull(), validationSnapshot: json("validationSnapshot").notNull(), rectifiesId: text("rectifiesId"), reason: text("reason"), createdBy: text("createdBy").notNull(), createdAt: instant("createdAt").notNull(),
});
export const pageFederalItems = pgTable("ConstructionFederalExportItem", {
  id: id(), exportId: text("exportId").notNull(), caseId: text("caseId").notNull(),
});
export const pageFederalReceipts = pgTable("ConstructionFederalExportReceipt", {
  id: id(), exportId: text("exportId").notNull(), protocol: text("protocol").notNull(), destination: text("destination").notNull(), submittedAt: instant("submittedAt").notNull(), evidenceUrl: text("evidenceUrl").notNull(), evidenceHash: text("evidenceHash").notNull(), notes: text("notes").notNull(), createdBy: text("createdBy").notNull(), createdAt: instant("createdAt").notNull(),
});
export const pageInspections = pgTable("ConstructionInspection", {
  id: id(), caseId: text("caseId").notNull(), requestKey: text("requestKey").notNull(), inspectionTypeId: text("inspectionTypeId").notNull(), sequence: integer("sequence").notNull(), requestedAt: instant("requestedAt").notNull(), scheduledAt: day("scheduledAt"), inspectedAt: day("inspectedAt"), status: text("status").notNull(), requestNotes: text("requestNotes").notNull(), resultNotes: text("resultNotes"), definitionSnapshot: json("definitionSnapshot").notNull(), evidenceSnapshot: json("evidenceSnapshot").notNull(), requestedBy: text("requestedBy").notNull(), inspectedBy: text("inspectedBy"), resultRequestKey: text("resultRequestKey"), correctionDeadline: instant("correctionDeadline"), requirementNote: text("requirementNote"), correctionSnapshot: json("correctionSnapshot"), reinspectionOfId: text("reinspectionOfId"),
});
export const pageCompletions = pgTable("ConstructionCompletion", {
  id: id(), caseId: text("caseId").notNull(), requestKey: text("requestKey").notNull(), number: text("number").notNull(), kind: text("kind").notNull(), completedAt: day("completedAt").notNull(), area: area("area").notNull(), cumulativeArea: area("cumulativeArea").notNull(), remainingArea: area("remainingArea").notNull(), notes: text("notes").notNull(), evidenceSnapshot: json("evidenceSnapshot").notNull(), debtSnapshot: json("debtSnapshot").notNull(), occupancyDocumentId: text("occupancyDocumentId"), createdBy: text("createdBy").notNull(), createdAt: instant("createdAt").notNull(),
});
export const pageInspectionPlans = pgTable("ConstructionInspectionPlan", {
  id: id(), caseId: text("caseId").notNull(), requestKey: text("requestKey").notNull(), reviewId: text("reviewId").notNull(), inspectionTypes: json("inspectionTypes").notNull(), definitionSnapshot: json("definitionSnapshot").notNull(), createdBy: text("createdBy").notNull(), createdAt: instant("createdAt").notNull(),
});
export const pageLifecycleStarts = pgTable("ConstructionLifecycleStart", {
  id: id(), caseId: text("caseId").notNull(), requestKey: text("requestKey").notNull(), startedAt: day("startedAt").notNull(), notes: text("notes").notNull(), evidenceSnapshot: json("evidenceSnapshot").notNull(), createdBy: text("createdBy").notNull(), createdAt: instant("createdAt").notNull(),
});
export const pageServiceRequests = pgTable("ConstructionServiceRequest", {
  id: id(), requestKey: text("requestKey").notNull(), caseId: text("caseId").notNull(), identityId: text("identityId").notNull(), kind: text("kind").notNull(), status: text("status").notNull(), revision: integer("revision").notNull(), notes: text("notes").notNull(), payload: json("payload").notNull(), evidenceSnapshot: json("evidenceSnapshot").notNull(), createdAt: instant("createdAt").notNull(), resolvedAt: instant("resolvedAt"), resolvedBy: text("resolvedBy"), resolution: text("resolution"),
});
export const pageTaxRules = pgTable("ConstructionTaxRuleVersion", {
  id: id(), kind: text("kind").notNull(), version: integer("version").notNull(), taxId: text("taxId").notNull(), startsAt: day("startsAt").notNull(), endsAt: day("endsAt"), fixedAmount: exactNumeric("fixedAmount", { precision: 18, scale: 2 }).notNull(), amountPerSquareMeter: exactNumeric("amountPerSquareMeter", { precision: 18, scale: 4 }).notNull(), legalBasis: text("legalBasis").notNull(), guideInstructions: text("guideInstructions").notNull(), demonstration: boolean("demonstration").notNull(), publishedBy: text("publishedBy").notNull(), publishedAt: instant("publishedAt").notNull(),
});
export const pageFees = pgTable("ConstructionFee", {
  id: id(), caseId: text("caseId").notNull(), kind: text("kind").notNull(), revision: integer("revision").notNull(), cycleKey: text("cycleKey").notNull(), requestKey: text("requestKey").notNull(), ruleId: text("ruleId").notNull(), taxpayerId: text("taxpayerId").notNull(), realEstateId: text("realEstateId").notNull(), assessmentId: text("assessmentId"), amount: exactNumeric("amount", { precision: 18, scale: 2 }).notNull(), calculationSnapshot: json("calculationSnapshot").notNull(), exemptionReason: text("exemptionReason"), createdBy: text("createdBy").notNull(), createdAt: instant("createdAt").notNull(),
});
export const pageEnforcementCases = pgTable("ConstructionEnforcementCase", {
  id: id(), requestKey: text("requestKey").notNull(), requestHash: text("requestHash").notNull(), processId: text("processId").notNull(), realEstateId: text("realEstateId").notNull(), permitCaseId: text("permitCaseId"), locationType: text("locationType").notNull(), permitStatus: text("permitStatus").notNull(), reason: text("reason").notNull(), cadastralSnapshot: json("cadastralSnapshot").notNull(), assignedEmployeeId: text("assignedEmployeeId"), status: text("status").notNull(), revision: integer("revision").notNull(), isDemonstration: boolean("isDemonstration").notNull(), createdBy: text("createdBy").notNull(), createdAt: instant("createdAt").notNull(),
});
export const pageEnforcementActs = pgTable("ConstructionEnforcementAct", {
  id: id(), caseId: text("caseId").notNull(), requestKey: text("requestKey").notNull(), requestHash: text("requestHash").notNull(), number: text("number").notNull(), kind: text("kind").notNull(), visitId: text("visitId"), relatedActId: text("relatedActId"), reason: text("reason").notNull(), legalBasis: text("legalBasis").notNull(), issuedAt: instant("issuedAt").notNull(), deadlineAt: instant("deadlineAt"), employeeId: text("employeeId").notNull(), departmentId: text("departmentId").notNull(), staffRoleId: text("staffRoleId").notNull(), createdBy: text("createdBy").notNull(), createdAt: instant("createdAt").notNull(),
});
export const pageEnforcementVisits = pgTable("ConstructionEnforcementVisit", {
  id: id(), caseId: text("caseId").notNull(), requestKey: text("requestKey").notNull(), requestHash: text("requestHash").notNull(), visitedAt: instant("visitedAt").notNull(), findings: text("findings").notNull(), employeeId: text("employeeId").notNull(), departmentId: text("departmentId").notNull(), staffRoleId: text("staffRoleId").notNull(), createdBy: text("createdBy").notNull(), createdAt: instant("createdAt").notNull(),
});
export const pageEnforcementAssignments = pgTable("ConstructionEnforcementAssignment", {
  id: id(), caseId: text("caseId").notNull(), requestKey: text("requestKey").notNull(), requestHash: text("requestHash").notNull(), previousEmployeeId: text("previousEmployeeId"), employeeId: text("employeeId").notNull(), departmentId: text("departmentId").notNull(), staffRoleId: text("staffRoleId").notNull(), reason: text("reason").notNull(), createdBy: text("createdBy").notNull(), createdAt: instant("createdAt").notNull(),
});
export const pageEnforcementAcknowledgements = pgTable("ConstructionEnforcementAcknowledgement", {
  id: id(), actId: text("actId").notNull(), requestKey: text("requestKey").notNull(), requestHash: text("requestHash").notNull(), acknowledgedAt: instant("acknowledgedAt").notNull(), method: text("method").notNull(), recipient: text("recipient").notNull(), notes: text("notes").notNull(), createdBy: text("createdBy").notNull(), createdAt: instant("createdAt").notNull(),
});
export const pageEnforcementEvidence = pgTable("ConstructionEnforcementEvidence", {
  id: id(), documentId: text("documentId").notNull(), visitId: text("visitId"), actId: text("actId"), acknowledgementId: text("acknowledgementId"), kind: text("kind").notNull(), versionSnapshot: json("versionSnapshot").notNull(), createdAt: instant("createdAt").notNull(),
});
