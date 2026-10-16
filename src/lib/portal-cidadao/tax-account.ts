import { Prisma, type PrismaClient } from "@prisma/client";
import { AccessError } from "@/lib/platform/tenant-context";
import { taxAssessmentCompensatedValue } from "@/lib/tributacao/scope";

export async function authorizedTaxpayerIds(db: PrismaClient, actorId: string, scope: string) {
  const grants = await db.taxpayerPortalAccess.findMany({ where: { usuarioId: actorId, accessType: "TITULAR", status: "ATIVO", revokedAt: null, grantedAt: { lte: new Date() } }, select: { taxpayerId: true, scopes: true } });
  const ids = grants.filter((item) => Array.isArray(item.scopes) && item.scopes.includes(scope)).map((item) => item.taxpayerId);
  const active = ids.length ? await db.taxpayer.findMany({ where: { id: { in: ids }, status: "Ativo", OR: [{ person: { status: "Ativo" } }, { company: { status: "Ativo" } }] }, select: { id: true } }) : [];
  return active.map((item) => item.id);
}

export async function readTaxpayerAccount(db: PrismaClient, actorId: string, taxpayerId: string, year?: number) {
  const access = await db.taxpayerPortalAccess.findFirst({ where: { usuarioId: actorId, taxpayerId, accessType: "TITULAR", status: "ATIVO", revokedAt: null, grantedAt: { lte: new Date() } } });
  if (!access || !Array.isArray(access.scopes)) throw new AccessError("Sem vínculo vigente com o contribuinte.", 403);
  const allowed = (scope: string) => Array.isArray(access.scopes) && access.scopes.includes(scope);
  const taxpayer = await db.taxpayer.findFirst({ where: { id: taxpayerId, status: "Ativo" }, select: { id: true, municipalInsc: true, person: { select: { fullName: true, status: true } }, company: { select: { corporateName: true, status: true } } } });
  if (!taxpayer || taxpayer.person?.status === "Inativo" || taxpayer.company?.status === "Inativo") throw new AccessError("Contribuinte indisponível.", 403);
  const assessments = allowed("EXTRATO") || allowed("DAM") ? await db.taxAssessment.findMany({ where: { taxpayerId, ...(year ? { year } : {}) }, select: { id: true, assessmentNumber: true, year: true, status: true, originalValueDecimal: true, finalValueDecimal: true, tax: { select: { name: true } }, guides: { select: { id: true, guideNumber: true, dueDate: true, totalValueDecimal: true, status: true, payments: { where: { status: "Confirmado" }, select: { amountPaidDecimal: true } } } } }, orderBy: [{ year: "desc" }, { id: "asc" }] }) : [];
  const statement = await Promise.all(assessments.map(async (item) => {
    const payments = item.guides.flatMap((guide) => guide.payments);
    const total = item.finalValueDecimal || item.originalValueDecimal;
    const paid = payments.some((entry) => !entry.amountPaidDecimal) ? null : payments.reduce((sum, entry) => sum.add(entry.amountPaidDecimal!), new Prisma.Decimal(0));
    const compensated = await taxAssessmentCompensatedValue(db, item.id);
    return { ...item, paid: paid?.toFixed(2) || null, remaining: total && paid ? Prisma.Decimal.max(0, total.sub(paid).sub(compensated)).toFixed(2) : null, total: total?.toFixed(2) || null };
  }));
  const sourceProperties = allowed("IMOVEL") || allowed("IPTU") ? await db.realEstate.findMany({ where: { taxpayerId }, select: { id: true, municipalInsc: true, streetName: true, number: true, neighborhood: { select: { name: true } }, landArea: true, builtArea: true } }) : [];
  const properties = sourceProperties.map((item) => ({ id: item.id, municipalInsc: item.municipalInsc, street: item.streetName || "Não informado", number: item.number, district: item.neighborhood?.name || "Não informado", landArea: item.landArea, buildingArea: item.builtArea }));
  const companies = allowed("EMPRESA") ? await db.economicRegistration.findMany({ where: { taxpayerId }, select: { id: true, municipalInsc: true, primaryCnae: true, taxRegime: true, status: true } }) : [];
  const certificates = allowed("CERTIDOES") ? await db.taxCertificate.findMany({ where: { taxpayerId }, select: { id: true, certificateType: true, status: true, validUntil: true, authCode: true, documentId: true }, orderBy: { createdAt: "desc" } }) : [];
  const licenses = allowed("ALVARAS") ? await db.license.findMany({ where: { taxpayerId }, select: { id: true, licenseType: true, status: true, issueDate: true, validUntil: true } }) : [];
  const debts = allowed("DIVIDA") ? await db.activeDebt.findMany({ where: { taxpayerId, ...(year ? { year } : {}) }, select: { id: true, cdaNumber: true, year: true, status: true, updatedValueDecimal: true }, orderBy: { year: "desc" } }) : [];
  const installments = allowed("PARCELAMENTO") ? await db.debtInstallment.findMany({ where: { taxpayerId }, select: { id: true, totalValueDecimal: true, installmentsCount: true, status: true } }) : [];
  return { taxpayer, scopes: access.scopes, statement, properties, companies, certificates, licenses, debts, installments };
}
