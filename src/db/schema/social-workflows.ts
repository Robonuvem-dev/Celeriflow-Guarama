import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { exactNumeric } from "../decimal";
import { people } from "./people";
import { employees, roles } from "./administration";
import { documents } from "./registry";
import { socialBenefits, socialBenefitRequests, socialFamilies, socialPrograms, socialReferrals, socialUnits } from "./social";

const id = () => text("id").primaryKey().$defaultFn(createId);
const day = (name: string) => date(name, { mode: "string" });
const instant = (name: string) => timestamp(name, { precision: 3 });
const tracked = () => ({ createdAt: instant("createdAt").notNull().defaultNow(), updatedAt: instant("updatedAt").notNull().defaultNow().$onUpdateFn(() => new Date()) });
const unit = () => text("unitId").notNull().references(() => socialUnits.id);
const person = (name: string) => text(name).references(() => people.id);
const family = () => text("familyId").references(() => socialFamilies.id);
export const socialPocDatasets = pgTable("SocialPocDataset", { id: id(), referenceDate: day("referenceDate").notNull(), createdAt: instant("createdAt").notNull().defaultNow() });
export const socialWorkflowRevisions = pgTable("SocialWorkflowRevision", { id: id(), area: text("area").notNull(), recordId: text("recordId").notNull(), values: jsonb("values").$type<Record<string, string>>().notNull(), actorId: text("actorId").notNull(), createdAt: instant("createdAt").notNull().defaultNow() }, t => [index("SocialWorkflowRevision_record_idx").on(t.area, t.recordId, t.createdAt)]);

export const socialUnitRegistrations = pgTable("SocialUnitRegistration", {
  unitId: text("unitId").primaryKey().references(() => socialUnits.id), cnpj: text("cnpj"), legalName: text("legalName").notNull(), stateRegistration: text("stateRegistration"), unitNumber: text("unitNumber").notNull(), ...tracked(),
});
export const socialProfessionalRegistrations = pgTable("SocialProfessionalRegistration", {
  employeeId: text("employeeId").primaryKey().references(() => employees.id), roleId: text("roleId").references(() => roles.id), council: text("council"), registration: text("registration"), ...tracked(),
});
export const socialBeneficiaryRegistrations = pgTable("SocialBeneficiaryRegistration", {
  personId: text("personId").primaryKey().references(() => people.id), unitId: unit(), religion: text("religion"), birthCertificate: text("birthCertificate"), registeredAt: day("registeredAt").notNull(), ...tracked(),
});
export const socialBenefitClassifications = pgTable("SocialBenefitClassification", {
  benefitId: text("benefitId").primaryKey().references(() => socialBenefits.id), sphere: text("sphere").notNull(), ...tracked(),
});
export const socialFamilyRegistrations = pgTable("SocialFamilyRegistration", {
  familyId: text("familyId").primaryKey().references(() => socialFamilies.id), unitId: unit(), ...tracked(),
});
export const socialProgramEnrollments = pgTable("SocialProgramEnrollment", {
  id: id(), unitId: unit(), familyId: family(), personId: person("personId"), programId: text("programId").notNull().references(() => socialPrograms.id), registeredAt: day("registeredAt").notNull(), includedAt: day("includedAt").notNull(), excludedAt: day("excludedAt"), benefitValue: exactNumeric("benefitValue", { precision: 14, scale: 2 }).notNull(), benefitNumber: text("benefitNumber"), createdBy: text("createdBy").notNull(), ...tracked(),
}, t => [index("SocialProgramEnrollment_subject_idx").on(t.familyId, t.personId)]);
export const socialRequestDetails = pgTable("SocialRequestDetails", {
  requestId: text("requestId").primaryKey().references(() => socialBenefitRequests.id), professionalId: text("professionalId").notNull().references(() => employees.id), requestedAt: day("requestedAt").notNull(), applicantId: person("applicantId").notNull(), recipientId: person("recipientId").notNull(), deliveryType: text("deliveryType").notNull(), ...tracked(),
});
export const socialReferralDetails = pgTable("SocialReferralDetails", {
  referralId: text("referralId").primaryKey().references(() => socialReferrals.id), professionalId: text("professionalId").notNull().references(() => employees.id), referralType: text("referralType").notNull(), destinationUnitId: text("destinationUnitId").references(() => socialUnits.id), ...tracked(),
});
export const socialFollowups = pgTable("SocialFollowup", {
  id: id(), unitId: unit(), familyId: family(), personId: person("personId"), professionalId: text("professionalId").notNull().references(() => employees.id), service: text("service").notNull(), startsAt: day("startsAt").notNull(), endsAt: day("endsAt"), diagnosis: text("diagnosis").notNull(), objectives: text("objectives").notNull(), actions: text("actions").notNull(), reviewAt: day("reviewAt"), status: text("status").notNull().default("ACTIVE"), createdBy: text("createdBy").notNull(), ...tracked(),
}, t => [index("SocialFollowup_unit_dates_idx").on(t.unitId, t.startsAt, t.endsAt)]);
export const socialFollowupNotes = pgTable("SocialFollowupNote", {
  id: id(), followupId: text("followupId").notNull().references(() => socialFollowups.id), occurredAt: day("occurredAt").notNull(), description: text("description").notNull(), nextReviewAt: day("nextReviewAt"), createdBy: text("createdBy").notNull(), ...tracked(),
});
export const socialConditionalities = pgTable("SocialConditionality", {
  id: id(), unitId: unit(), personId: person("personId").notNull(), programId: text("programId").notNull().references(() => socialPrograms.id), kind: text("kind").notNull(), dueAt: day("dueAt").notNull(), occurredAt: day("occurredAt"), effect: text("effect").notNull(), suspensionFrom: day("suspensionFrom"), suspensionUntil: day("suspensionUntil"), status: text("status").notNull(), observations: text("observations").notNull(), createdBy: text("createdBy").notNull(), ...tracked(),
});
export type SocialQuestion = { key: string; label: string; type: "SHORT" | "LONG" | "CHECKBOX" | "SINGLE" | "MULTIPLE"; required: boolean; options: string[] };
export const socialQuestionnaires = pgTable("SocialQuestionnaire", {
  id: id(), unitId: unit(), title: text("title").notNull(), version: integer("version").notNull(), previousId: text("previousId"), questions: jsonb("questions").$type<SocialQuestion[]>().notNull(), isActive: boolean("isActive").notNull().default(true), createdBy: text("createdBy").notNull(), ...tracked(),
});
export const socialQuestionnaireResponses = pgTable("SocialQuestionnaireResponse", {
  id: id(), questionnaireId: text("questionnaireId").notNull().references(() => socialQuestionnaires.id), familyId: family(), personId: person("personId"), answeredAt: day("answeredAt").notNull(), answers: jsonb("answers").$type<Record<string, string | string[] | boolean>>().notNull(), createdBy: text("createdBy").notNull(), ...tracked(),
});
export const socialScfvGroups = pgTable("SocialScfvGroup", {
  id: id(), unitId: unit(), realizationUnitId: text("realizationUnitId").notNull().references(() => socialUnits.id), name: text("name").notNull(), serviceType: text("serviceType").notNull(), ageMin: integer("ageMin").notNull(), ageMax: integer("ageMax").notNull(), registeredAt: day("registeredAt").notNull(), startsAt: day("startsAt").notNull(), endsAt: day("endsAt").notNull(), professionalId: text("professionalId").notNull().references(() => employees.id), referenceProfessionalId: text("referenceProfessionalId").notNull().references(() => employees.id), advisorId: text("advisorId").notNull().references(() => employees.id), facilitatorId: text("facilitatorId").notNull().references(() => employees.id), weekdays: integer("weekdays").array().notNull(), startTime: text("startTime").notNull(), endTime: text("endTime").notNull(), isActive: boolean("isActive").notNull().default(true), createdBy: text("createdBy").notNull(), ...tracked(),
});
export const socialScfvEnrollments = pgTable("SocialScfvEnrollment", {
  id: id(), groupId: text("groupId").notNull().references(() => socialScfvGroups.id), personId: person("personId").notNull(), enrolledAt: day("enrolledAt").notNull(), leftAt: day("leftAt"), exitReason: text("exitReason"), createdBy: text("createdBy").notNull(), ...tracked(),
}, t => [index("SocialScfvEnrollment_group_person_idx").on(t.groupId, t.personId)]);
export const socialScfvEvents = pgTable("SocialScfvEvent", {
  id: id(), groupId: text("groupId").notNull().references(() => socialScfvGroups.id), title: text("title").notNull(), occursAt: day("occursAt").notNull(), planning: text("planning").notNull(), report: text("report").notNull().default(""), status: text("status").notNull().default("PLANNED"), createdBy: text("createdBy").notNull(), ...tracked(),
});
export const socialScfvAttendance = pgTable("SocialScfvAttendance", {
  id: id(), eventId: text("eventId").notNull().references(() => socialScfvEvents.id), enrollmentId: text("enrollmentId").notNull().references(() => socialScfvEnrollments.id), present: boolean("present").notNull(), justification: text("justification"), createdBy: text("createdBy").notNull(), ...tracked(),
}, t => [uniqueIndex("SocialScfvAttendance_event_enrollment_key").on(t.eventId, t.enrollmentId)]);
export const socialAttachments = pgTable("SocialAttachment", {
  id: id(), unitId: unit(), eventId: text("eventId").references(() => socialScfvEvents.id), personId: person("personId"), documentId: text("documentId").notNull().references(() => documents.id), caption: text("caption").notNull(), createdBy: text("createdBy").notNull(), ...tracked(),
});
export const socialMessages = pgTable("SocialMessage", {
  id: id(), unitId: unit(), personId: person("personId").notNull(), programEnrollmentId: text("programEnrollmentId").notNull().references(() => socialProgramEnrollments.id), phone: text("phone").notNull(), body: text("body").notNull(), dueAt: day("dueAt").notNull(), status: text("status").notNull().default("AWAITING_PROVIDER"), dedupeKey: text("dedupeKey").notNull(), externalId: text("externalId"), lastError: text("lastError"), sentAt: instant("sentAt"), deliveredAt: instant("deliveredAt"), createdBy: text("createdBy").notNull(), ...tracked(),
}, t => [uniqueIndex("SocialMessage_dedupe_key").on(t.dedupeKey)]);
export const socialImportBatches = pgTable("SocialImportBatch", {
  id: id(), unitId: unit(), filename: text("filename").notNull(), sha256: text("sha256").notNull(), layout: text("layout").notNull(), status: text("status").notNull().default("PREVIEW"), accepted: integer("accepted").notNull(), rejected: integer("rejected").notNull(), createdBy: text("createdBy").notNull(), appliedAt: instant("appliedAt"), ...tracked(),
}, t => [uniqueIndex("SocialImportBatch_unit_hash_layout_key").on(t.unitId, t.sha256, t.layout)]);
export type SocialImportRow = { line: number; cpf: string; nis: string; name: string; familyCode: string; kinship: string; birthDate: string; income: string; phone: string; address: string; municipality: string; uf: string; errors: string[] };
export const socialImportRows = pgTable("SocialImportRow", {
  id: id(), batchId: text("batchId").notNull().references(() => socialImportBatches.id), line: integer("line").notNull(), payload: jsonb("payload").$type<SocialImportRow>().notNull(), personId: person("personId"), ...tracked(),
}, t => [uniqueIndex("SocialImportRow_batch_line_key").on(t.batchId, t.line)]);
