import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "../ids";
import { exactNumeric } from "../decimal";
import { people } from "./people";
import { employees } from "./administration";
import { socialAttendances, socialFamilies, socialUnits, socialVisits } from "./social";
import { socialMessages } from "./social-workflows";
import type { SocialMunicipalParameters, SocialImportLayout, SocialCaseSections, SocialMonthlySnapshot } from "@/lib/social/municipal-contract";
import type { SocialDocumentTemplate } from "@/lib/social/document-templates";

const id = () => text("id").primaryKey().$defaultFn(createId);
const tracked = () => ({ createdAt: timestamp("createdAt", { precision: 3 }).notNull().defaultNow(), updatedAt: timestamp("updatedAt", { precision: 3 }).notNull().defaultNow().$onUpdateFn(() => new Date()) });
export const socialMunicipalSettings = pgTable("SocialMunicipalSettings", {
  id: text("id").primaryKey(), revision: integer("revision").notNull().default(1), parameters: jsonb("parameters").$type<SocialMunicipalParameters>().notNull(), updatedBy: text("updatedBy").notNull(), ...tracked(),
});
export const socialImportLayouts = pgTable("SocialImportLayout", {
  id: id(), name: text("name").notNull(), version: text("version").notNull(), configuration: jsonb("configuration").$type<SocialImportLayout>().notNull(), isActive: boolean("isActive").notNull().default(true), createdBy: text("createdBy").notNull(), ...tracked(),
}, t => [uniqueIndex("SocialImportLayout_name_version_key").on(t.name, t.version)]);
export const socialCadastreSnapshots = pgTable("SocialCadastreSnapshot", { cpf: text("cpf").primaryKey(), personId: text("personId").notNull().references(() => people.id), unitId: text("unitId").notNull().references(() => socialUnits.id), nis: text("nis"), name: text("name").notNull(), familyCode: text("familyCode").notNull(), perCapitaIncome: exactNumeric("perCapitaIncome",{precision:14,scale:2}).notNull(), composition: integer("composition").notNull(), address: text("address"), municipality: text("municipality").notNull(), uf: text("uf").notNull(), batchId: text("batchId").notNull(), ...tracked() }, t=>[uniqueIndex("SocialCadastreSnapshot_nis_key").on(t.nis)]);
export const socialCaseFiles = pgTable("SocialCaseFile", {
  id: id(), unitId: text("unitId").notNull().references(() => socialUnits.id), familyId: text("familyId").references(() => socialFamilies.id), personId: text("personId").references(() => people.id), professionalId: text("professionalId").notNull().references(() => employees.id), receivedAt: date("receivedAt", { mode: "string" }).notNull(), enteredVia: text("enteredVia").notNull(), initialDemand: text("initialDemand").notNull(), secrecyLevel: text("secrecyLevel").notNull().default("Normal"), status: text("status").notNull().default("ACTIVE"), modelVersion: text("modelVersion").notNull(), sections: jsonb("sections").$type<SocialCaseSections>().notNull(), createdBy: text("createdBy").notNull(), ...tracked(),
}, t => [index("SocialCaseFile_subject_unit_idx").on(t.unitId, t.familyId, t.personId)]);
export const socialVisitAttendances = pgTable("SocialVisitAttendance", { visitId:text("visitId").primaryKey().references(()=>socialVisits.id),attendanceId:text("attendanceId").notNull().references(()=>socialAttendances.id),...tracked() }, t=>[uniqueIndex("SocialVisitAttendance_attendance_key").on(t.attendanceId)]);
export const socialMonthlyStatements = pgTable("SocialMonthlyStatement", {
  id: id(), unitId: text("unitId").notNull().references(() => socialUnits.id), competence: text("competence").notNull(), professionalId: text("professionalId").notNull().references(() => employees.id), status: text("status").notNull(), version: integer("version").notNull().default(1), declaredValues: jsonb("declaredValues").$type<Record<string, number>>().notNull(), observations: text("observations").notNull(), snapshot: jsonb("snapshot").$type<SocialMonthlySnapshot>().notNull(), createdBy: text("createdBy").notNull(), ...tracked(),
}, t => [uniqueIndex("SocialMonthlyStatement_unit_competence_key").on(t.unitId, t.competence)]);
export const socialIssuedDocuments = pgTable("SocialIssuedDocument", {
  id: id(), unitId: text("unitId").notNull().references(() => socialUnits.id), familyId: text("familyId").references(() => socialFamilies.id), personId: text("personId").references(() => people.id), templateCode: text("templateCode").notNull(), model: jsonb("model").$type<SocialDocumentTemplate>().notNull(), values: jsonb("values").$type<Record<string, string>>().notNull(), status: text("status").notNull(), issuedAt: timestamp("issuedAt", { precision: 3 }), createdBy: text("createdBy").notNull(), ...tracked(),
});
export const socialMessageDispatches = pgTable("SocialMessageDispatch", {
  id: id(), messageId: text("messageId").notNull().references(() => socialMessages.id), provider: text("provider").notNull(), parametersRevision: integer("parametersRevision").notNull(), configuration: jsonb("configuration").$type<{baseUrl:string;credentialReference:string;sender:string}>().notNull(), state: text("state").notNull(), externalId: text("externalId"), error: text("error"), createdBy: text("createdBy").notNull(), ...tracked(),
}, t => [uniqueIndex("SocialMessageDispatch_message_key").on(t.messageId), index("SocialMessageDispatch_created_idx").on(t.createdAt)]);
