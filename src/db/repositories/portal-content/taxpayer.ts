import { and, asc, desc, eq, gt, inArray, isNull, lte, ne, or } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { citizenTaxpayerAccesses, processCitizenAccesses } from "@/db/schema/citizen-access";
import { taxpayers, companies, documents } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { economicRegistrations, taxAssessments, taxes, taxGuides } from "@/db/schema/taxation-core";
import { taxRegistryEntries, taxLicenses } from "@/db/schema/taxation-registry";
import { itbiDeclarations, itbiParties } from "@/db/schema/tax-itbi";
import { portalOccasionalRequests } from "@/db/schema/portal-fiscal";
import { pageTaxCertificates } from "@/db/schema/taxation-pages";
import { documentClasses, documentSignatures, documentVersions } from "@/db/schema/document-workflow";
import { prizeDraws, prizeExecutions, prizeWinners, prizeCoupons } from "@/db/schema/tax-collection-operations";

export function portalTaxpayerGrants(db: DatabaseExecutor, actorId: string, now?: Date) {
  return db.select().from(citizenTaxpayerAccesses).where(and(eq(citizenTaxpayerAccesses.usuarioId, actorId), eq(citizenTaxpayerAccesses.accessType, "TITULAR"), eq(citizenTaxpayerAccesses.status, "ATIVO"), isNull(citizenTaxpayerAccesses.revokedAt), now ? lte(citizenTaxpayerAccesses.grantedAt, now) : undefined));
}

export function portalTaxpayerOptions(db: DatabaseExecutor, ids: string[]) {
  return db.select({ id: taxpayers.id, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(taxpayers)
    .leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId))
    .where(and(inArray(taxpayers.id, ids), eq(taxpayers.status, "Ativo")));
}

export function portalEconomicRegistrations(db: DatabaseExecutor, ids: string[]) {
  return db.select({ id: economicRegistrations.id, taxpayerId: economicRegistrations.taxpayerId, municipalInsc: economicRegistrations.municipalInsc, status: economicRegistrations.status, updatedAt: economicRegistrations.updatedAt, taxpayer: { companyName: companies.corporateName, personName: people.fullName } }).from(economicRegistrations)
    .innerJoin(taxpayers, eq(taxpayers.id, economicRegistrations.taxpayerId)).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId))
    .where(inArray(economicRegistrations.taxpayerId, ids)).orderBy(asc(economicRegistrations.municipalInsc));
}

export async function portalLicenseOptions(db: DatabaseExecutor, ids: string[]) {
  const registrations = await db.select({ id: economicRegistrations.id, municipalInsc: economicRegistrations.municipalInsc, updatedAt: economicRegistrations.updatedAt }).from(economicRegistrations).where(and(inArray(economicRegistrations.taxpayerId, ids), eq(economicRegistrations.status, "Ativo")));
  const [entries, profiles, licenses] = await Promise.all([
    db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "LICENSE_POLICY"), eq(taxRegistryEntries.category, "LICENSE_POLICY"))).orderBy(desc(taxRegistryEntries.version)),
    db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "ECONOMIC_REGISTRATION"), inArray(taxRegistryEntries.entityId, registrations.map(row => row.id)), eq(taxRegistryEntries.category, "ECONOMIC_PROFILE"))).orderBy(desc(taxRegistryEntries.version)),
    db.select({ id: taxLicenses.id, licenseType: taxLicenses.licenseType, status: taxLicenses.status, qrCode: taxLicenses.qrCode, validUntil: taxLicenses.validUntil }).from(taxLicenses).where(inArray(taxLicenses.taxpayerId, ids)).orderBy(desc(taxLicenses.createdAt)),
  ]);
  return { registrations, entries, profiles, licenses };
}

export function portalItbiOptions(db: DatabaseExecutor, actorId: string, now: Date) {
  const grants = db.select({ processId: processCitizenAccesses.processId }).from(processCitizenAccesses).where(and(eq(processCitizenAccesses.usuarioId, actorId), isNull(processCitizenAccesses.revokedAt), lte(processCitizenAccesses.grantedAt, now), or(isNull(processCitizenAccesses.expiresAt), gt(processCitizenAccesses.expiresAt, now))));
  return db.select({ id: itbiDeclarations.id, declarationNumber: itbiDeclarations.declarationNumber, protocolNumber: itbiDeclarations.protocolNumber, status: itbiDeclarations.status }).from(itbiDeclarations).where(inArray(itbiDeclarations.processId, grants)).orderBy(desc(itbiDeclarations.createdAt));
}

export async function portalGuide(db: DatabaseExecutor, id: string, damIds: string[], itbiIds: string[], nfseIds: string[]) {
  const [itbi] = await db.select({ id: itbiDeclarations.id }).from(itbiDeclarations).innerJoin(itbiParties, eq(itbiParties.declarationId, itbiDeclarations.id)).where(and(eq(itbiDeclarations.guideId, id), inArray(itbiParties.taxpayerId, itbiIds))).limit(1);
  const [nfse] = itbi ? [] : await db.select({ id: portalOccasionalRequests.id }).from(portalOccasionalRequests).where(and(eq(portalOccasionalRequests.guideId, id), inArray(portalOccasionalRequests.providerTaxpayerId, nfseIds))).limit(1);
  const [guide] = await db.select({ guideNumber: taxGuides.guideNumber, barcode: taxGuides.barcode, dueDate: taxGuides.dueDate, status: taxGuides.status, totalValueDecimal: taxGuides.totalValueDecimal, assessment: { assessmentNumber: taxAssessments.assessmentNumber, taxName: taxes.name } }).from(taxGuides).innerJoin(taxAssessments, eq(taxAssessments.id, taxGuides.assessmentId)).innerJoin(taxes, eq(taxes.id, taxAssessments.taxId))
    .where(and(eq(taxGuides.id, id), ne(taxGuides.status, "Cancelada"), !itbi && !nfse ? inArray(taxAssessments.taxpayerId, damIds) : undefined)).limit(1);
  return guide && { ...guide, assessment: { assessmentNumber: guide.assessment.assessmentNumber, tax: { name: guide.assessment.taxName } } };
}

export async function portalCertificateVersion(db: DatabaseExecutor, id: string, ids: string[], now: Date) {
  const [certificate] = await db.select({ id: pageTaxCertificates.id }).from(pageTaxCertificates).where(and(eq(pageTaxCertificates.documentId, id), inArray(pageTaxCertificates.taxpayerId, ids), eq(pageTaxCertificates.status, "Emitida"), gt(pageTaxCertificates.validUntil, now))).limit(1);
  if (!certificate) return { authorized: false as const, version: null };
  const [row] = await db.select({ version: documentVersions, signaturePolicy: documentClasses.signaturePolicy }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).leftJoin(documentClasses, eq(documentClasses.id, documents.documentClassId))
    .where(and(eq(documentVersions.documentId, id), inArray(documentVersions.status, ["FINAL", "SIGNED"]), inArray(documents.status, ["Válido", "Assinado"]))).orderBy(desc(documentVersions.versionNumber)).limit(1);
  if (!row) return { authorized: true as const, version: null };
  const signatures = await db.select().from(documentSignatures).where(eq(documentSignatures.documentVersionId, row.version.id));
  return { authorized: true as const, version: { ...row.version, signatures, document: { documentClass: row.signaturePolicy === null ? null : { signaturePolicy: row.signaturePolicy } } } };
}

export async function publicPrizeDraw(db: DatabaseExecutor, slug: string) {
  const [draw] = await db.select().from(prizeDraws).where(eq(prizeDraws.slug, slug)).limit(1);
  if (!draw) return null;
  const executions = await db.select().from(prizeExecutions).where(eq(prizeExecutions.drawId, draw.id));
  const winners = await db.select({ winner: prizeWinners, coupon: prizeCoupons }).from(prizeWinners).innerJoin(prizeCoupons, eq(prizeCoupons.id, prizeWinners.couponId)).where(inArray(prizeWinners.executionId, executions.map(row => row.id)));
  return { ...draw, executions: executions.map(execution => ({ ...execution, winners: winners.filter(row => row.winner.executionId === execution.id).map(row => ({ ...row.winner, coupon: row.coupon })) })) };
}
