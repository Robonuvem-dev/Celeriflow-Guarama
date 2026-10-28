import { and, asc, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { citizenTaxpayerAccesses } from "@/db/schema/citizen-access";
import { taxpayers, companies as companyTable, realEstates } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { neighborhoods } from "@/db/schema/localities";
import { economicRegistrations, taxAssessments, taxes, taxGuides } from "@/db/schema/taxation-core";
import { taxLicenses } from "@/db/schema/taxation-registry";
import { pageTaxCertificates, pageActiveDebts } from "@/db/schema/taxation-pages";
import { portalTaxPayments, portalDebtInstallments } from "@/db/schema/portal-fiscal";
import { AccessError } from "@/lib/platform/tenant-context";
import { taxAssessmentCompensatedValue } from "@/lib/tributacao/scope";

export async function authorizedTaxpayerIds(db: DatabaseExecutor, actorId: string, scope: string) {
  const grants = await db.select({ taxpayerId: citizenTaxpayerAccesses.taxpayerId, scopes: citizenTaxpayerAccesses.scopes }).from(citizenTaxpayerAccesses)
    .where(and(eq(citizenTaxpayerAccesses.usuarioId, actorId), eq(citizenTaxpayerAccesses.accessType, "TITULAR"), eq(citizenTaxpayerAccesses.status, "ATIVO"), isNull(citizenTaxpayerAccesses.revokedAt), lte(citizenTaxpayerAccesses.grantedAt, new Date())));
  const ids = grants.filter((item) => Array.isArray(item.scopes) && item.scopes.includes(scope)).map((item) => item.taxpayerId);
  const active = ids.length ? await db.select({ id: taxpayers.id }).from(taxpayers)
    .leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companyTable, eq(companyTable.id, taxpayers.companyId))
    .where(and(inArray(taxpayers.id, ids), eq(taxpayers.status, "Ativo"), or(eq(people.status, "Ativo"), eq(companyTable.status, "Ativo")))) : [];
  return active.map((item) => item.id);
}

export async function readTaxpayerAccount(db: DatabaseExecutor, actorId: string, taxpayerId: string, year?: number) {
  const [access] = await db.select({ scopes: citizenTaxpayerAccesses.scopes }).from(citizenTaxpayerAccesses)
    .where(and(eq(citizenTaxpayerAccesses.usuarioId, actorId), eq(citizenTaxpayerAccesses.taxpayerId, taxpayerId), eq(citizenTaxpayerAccesses.accessType, "TITULAR"), eq(citizenTaxpayerAccesses.status, "ATIVO"), isNull(citizenTaxpayerAccesses.revokedAt), lte(citizenTaxpayerAccesses.grantedAt, new Date()))).limit(1);
  if (!access || !Array.isArray(access.scopes)) throw new AccessError("Sem vínculo vigente com o contribuinte.", 403);
  const allowed = (scope: string) => Array.isArray(access.scopes) && access.scopes.includes(scope);
  const [taxpayer] = await db.select({ id: taxpayers.id, municipalInsc: taxpayers.municipalInsc, person: { fullName: people.fullName, status: people.status }, company: { corporateName: companyTable.corporateName, status: companyTable.status } }).from(taxpayers)
    .leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companyTable, eq(companyTable.id, taxpayers.companyId))
    .where(and(eq(taxpayers.id, taxpayerId), eq(taxpayers.status, "Ativo"))).limit(1);
  if (!taxpayer || taxpayer.person?.status === "Inativo" || taxpayer.company?.status === "Inativo") throw new AccessError("Contribuinte indisponível.", 403);
  const assessmentRows = allowed("EXTRATO") || allowed("DAM") ? await db.select({ id: taxAssessments.id, assessmentNumber: taxAssessments.assessmentNumber, year: taxAssessments.year, status: taxAssessments.status, originalValueDecimal: taxAssessments.originalValueDecimal, finalValueDecimal: taxAssessments.finalValueDecimal, tax: { name: taxes.name } }).from(taxAssessments).innerJoin(taxes, eq(taxes.id, taxAssessments.taxId))
    .where(and(eq(taxAssessments.taxpayerId, taxpayerId), year ? eq(taxAssessments.year, year) : undefined)).orderBy(desc(taxAssessments.year), asc(taxAssessments.id)) : [];
  const guideRows = assessmentRows.length ? await db.select({ assessmentId: taxGuides.assessmentId, id: taxGuides.id, guideNumber: taxGuides.guideNumber, dueDate: taxGuides.dueDate, totalValueDecimal: taxGuides.totalValueDecimal, status: taxGuides.status }).from(taxGuides).where(inArray(taxGuides.assessmentId, assessmentRows.map(row => row.id))) : [];
  const paymentRows = guideRows.length ? await db.select({ guideId: portalTaxPayments.guideId, amountPaidDecimal: portalTaxPayments.amountPaidDecimal }).from(portalTaxPayments).where(and(inArray(portalTaxPayments.guideId, guideRows.map(row => row.id)), eq(portalTaxPayments.status, "Confirmado"))) : [];
  const assessments = assessmentRows.map(row => ({
    ...row,
    guides: guideRows.filter(guide => guide.assessmentId === row.id).map(guide => ({
      id: guide.id, guideNumber: guide.guideNumber, dueDate: guide.dueDate, totalValueDecimal: guide.totalValueDecimal, status: guide.status,
      payments: paymentRows.filter(payment => payment.guideId === guide.id).map(({ amountPaidDecimal }) => ({ amountPaidDecimal })),
    })),
  }));
  const statement = await Promise.all(assessments.map(async (item) => {
    const payments = item.guides.flatMap((guide) => guide.payments);
    const total = item.finalValueDecimal || item.originalValueDecimal;
    const paid = payments.some((entry) => !entry.amountPaidDecimal) ? null : payments.reduce((sum, entry) => sum.add(entry.amountPaidDecimal!), new Decimal(0));
    const compensated = await taxAssessmentCompensatedValue(db, item.id);
    return { ...item, paid: paid?.toFixed(2) || null, remaining: total && paid ? Decimal.max(0, total.sub(paid).sub(compensated)).toFixed(2) : null, total: total?.toFixed(2) || null };
  }));
  const sourceProperties = allowed("IMOVEL") || allowed("IPTU") ? await db.select({ id: realEstates.id, municipalInsc: realEstates.municipalInsc, streetName: realEstates.streetName, number: realEstates.number, neighborhood: { name: neighborhoods.name }, landArea: realEstates.landArea, builtArea: realEstates.builtArea }).from(realEstates).leftJoin(neighborhoods, eq(neighborhoods.id, realEstates.neighborhoodId)).where(eq(realEstates.taxpayerId, taxpayerId)) : [];
  const properties = sourceProperties.map((item) => ({ id: item.id, municipalInsc: item.municipalInsc, street: item.streetName || "Não informado", number: item.number, district: item.neighborhood?.name || "Não informado", landArea: item.landArea, buildingArea: item.builtArea }));
  const companies = allowed("EMPRESA") ? await db.select({ id: economicRegistrations.id, municipalInsc: economicRegistrations.municipalInsc, primaryCnae: economicRegistrations.primaryCnae, taxRegime: economicRegistrations.taxRegime, status: economicRegistrations.status }).from(economicRegistrations).where(eq(economicRegistrations.taxpayerId, taxpayerId)) : [];
  const certificates = allowed("CERTIDOES") ? await db.select({ id: pageTaxCertificates.id, certificateType: pageTaxCertificates.certificateType, status: pageTaxCertificates.status, validUntil: pageTaxCertificates.validUntil, authCode: pageTaxCertificates.authCode, documentId: pageTaxCertificates.documentId }).from(pageTaxCertificates).where(eq(pageTaxCertificates.taxpayerId, taxpayerId)).orderBy(desc(pageTaxCertificates.createdAt)) : [];
  const licenses = allowed("ALVARAS") ? await db.select({ id: taxLicenses.id, licenseType: taxLicenses.licenseType, status: taxLicenses.status, issueDate: taxLicenses.issueDate, validUntil: taxLicenses.validUntil }).from(taxLicenses).where(eq(taxLicenses.taxpayerId, taxpayerId)) : [];
  const debts = allowed("DIVIDA") ? await db.select({ id: pageActiveDebts.id, cdaNumber: pageActiveDebts.cdaNumber, year: pageActiveDebts.year, status: pageActiveDebts.status, updatedValueDecimal: pageActiveDebts.updatedValueDecimal }).from(pageActiveDebts).where(and(eq(pageActiveDebts.taxpayerId, taxpayerId), year ? eq(pageActiveDebts.year, year) : undefined)).orderBy(desc(pageActiveDebts.year)) : [];
  const installments = allowed("PARCELAMENTO") ? await db.select({ id: portalDebtInstallments.id, totalValueDecimal: portalDebtInstallments.totalValueDecimal, installmentsCount: portalDebtInstallments.installmentsCount, status: portalDebtInstallments.status }).from(portalDebtInstallments).where(eq(portalDebtInstallments.taxpayerId, taxpayerId)) : [];
  return { taxpayer, scopes: access.scopes, statement, properties, companies, certificates, licenses, debts, installments };
}
