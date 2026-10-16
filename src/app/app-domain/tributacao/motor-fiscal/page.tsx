import { Prisma } from "@prisma/client";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxAssessmentAccessFilter, taxAssessmentCompensatedValue } from "@/lib/tributacao/scope";
import MotorFiscalClient from "./MotorFiscalClient";
import { CreditMovementReversalForm } from "./CreditMovementReversalForm";
import { AuthorizedCompensationForm } from "./AuthorizedCompensationForm";
import { AssessmentBenefitForm } from "./AssessmentBenefitForm";
import { TaxAccountingProfileForm } from "./TaxAccountingProfileForm";

export const dynamic = "force-dynamic";

function taxpayerName(taxpayer: { person: { fullName: string } | null; company: { corporateName: string } | null }) {
  return taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? "Contribuinte sem nome";
}

function object(value: Prisma.JsonValue) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {}; }

export default async function MotorFiscalPage() {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO");
  const allowed = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const assessmentAccess = taxAssessmentAccessFilter(allowed);
  const registryAccess: Prisma.TaxRegistryEntryWhereInput = allowed ? { OR: allowed.map((budgetUnitId) => ({ data: { path: ["budgetUnitId"], equals: budgetUnitId } })) } : {};
  if (allowed && !allowed.length) registryAccess.id = { in: [] };
  const assessmentIds = allowed ? (await prisma.taxAssessment.findMany({ where: assessmentAccess, select: { id: true } })).map((assessment) => assessment.id) : undefined;
  const [taxes, taxpayers, parameters, assessments, guides, events, creditEvents, credits, refunds, agreements, reconciliations, bankAccounts, revenueNatures, resourceSources, processes, documents] = await Promise.all([
    prisma.tax.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.taxpayer.findMany({ where: { status: "Ativo" }, include: { person: true, company: true, realEstates: { select: { id: true, municipalInsc: true } }, economicRegistrations: { select: { id: true, municipalInsc: true } } }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.taxParameter.findMany({ include: { tax: true }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }], take: 200 }),
    prisma.taxAssessment.findMany({ where: assessmentAccess, include: { tax: true, taxpayer: { include: { person: true, company: true } }, guides: { include: { payments: { where: { status: "Confirmado" } } } } }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.taxGuide.findMany({ where: { assessment: assessmentAccess }, include: { assessment: { include: { tax: true, taxpayer: { include: { person: true, company: true } } } }, payments: { where: { status: "Confirmado" } } }, orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.taxIntegrationEvent.findMany({ where: { integrationCode: { in: ["FISCAL_ENGINE", "PIX_ADAPTER", "BANK_RETURN", "ACCOUNTING", "TAX_CREDIT"] } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "TAX_ASSESSMENT", category: "CREDIT_EVENT", status: "ATIVO", ...(assessmentIds ? { entityId: { in: assessmentIds } } : {}) }, orderBy: { createdAt: "asc" } }),
    prisma.taxRegistryEntry.findMany({ where: { ...registryAccess, category: "TAX_CREDIT" }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.taxRegistryEntry.findMany({ where: { ...registryAccess, category: "REFUND_REQUEST" }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.taxRegistryEntry.findMany({ where: { entityType: "COLLECTION_AGREEMENT", category: "AGREEMENT", status: "ATIVO" }, orderBy: { title: "asc" } }),
    prisma.taxRegistryEntry.findMany({ where: { category: "RECONCILIATION" }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.bankAccount.findMany({ where: { isActive: true, ...(allowed ? { budgetUnitId: { in: allowed } } : {}) }, orderBy: { bankName: "asc" }, select: { id: true, bankName: true, agency: true, accountNumber: true } }),
    prisma.revenueNature.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.resourceSource.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.process.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, protocolNumber: true } }),
    prisma.document.findMany({ where: { status: "Válido" }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, title: true } }),
  ]);
  const compensated = new Map(await Promise.all(assessments.map(async (assessment) => [assessment.id, Number(await taxAssessmentCompensatedValue(prisma, assessment.id))] as const)));
  const authorizedOrigins = new Set([...assessments.map((row) => row.id), ...guides.map((row) => row.id), ...credits.map((row) => row.id), ...refunds.map((row) => row.id)]);
  const scopedEvents = allowed ? events.filter((event) => {
    const payload = object(event.payload);
    return [payload.guideId, payload.assessmentId, payload.creditId, payload.requestId].some((id) => typeof id === "string" && authorizedOrigins.has(id));
  }) : events;
  const visibleEventIds = new Set(scopedEvents.map((event) => event.id));
  const visibleEvents = allowed ? events.filter((event) => visibleEventIds.has(event.id) || (event.integrationCode === "ACCOUNTING" && typeof object(event.payload).sourceId === "string" && visibleEventIds.has(String(object(event.payload).sourceId)))) : events;
  const assessmentRows = assessments.map((assessment) => {
    const total = Number(assessment.finalValueDecimal ?? assessment.originalValueDecimal ?? assessment.originalValue);
    const paid = assessment.guides.flatMap((guide) => guide.payments).reduce((sum, payment) => sum + Number(payment.amountPaidDecimal ?? payment.amountPaid), 0);
    const extinct = creditEvents.filter((entry) => entry.entityId === assessment.id).reduce((sum, entry) => { const data = object(entry.data); return data.reducesAssessmentValue !== true && ["EXTINCAO_NAO_FINANCEIRA", "COMPENSACAO"].includes(String(data.eventType)) ? sum + Number(data.amount ?? 0) : sum; }, compensated.get(assessment.id) ?? 0);
    return { id: assessment.id, number: assessment.assessmentNumber ?? assessment.id, taxId: assessment.taxId, tax: assessment.tax.name, taxpayerId: assessment.taxpayerId, taxpayer: taxpayerName(assessment.taxpayer), year: assessment.year, competence: assessment.competence?.toISOString() ?? null, base: Number(assessment.taxableBaseDecimal ?? 0), principal: Number(assessment.originalValueDecimal ?? assessment.originalValue), correction: Number(assessment.correctionValueDecimal ?? 0), interest: Number(assessment.interestValueDecimal ?? 0), penalty: Number(assessment.penaltyValueDecimal ?? 0), total, paid, balance: Math.max(total - paid - extinct, 0), status: assessment.status, realEstateId: assessment.realEstateId, economicRegistrationId: assessment.economicRegistrationId };
  });
  const reversibleMovements = await prisma.taxRegistryEntry.findMany({ where: { AND: [registryAccess, { OR: [{ category: "CREDIT_MOVEMENT", status: "EFETIVADO" }, { category: "REFUND_REQUEST", status: { in: ["PENDENTE_APROVACAO", "APROVADA_AGUARDANDO_TESOURARIA", "RESTITUIDA"] } }] }] }, orderBy: { createdAt: "desc" }, take: 200 });
  const now = new Date();
  const benefitRules = await prisma.taxBenefitRule.findMany({ where: { active: true, effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }] }, orderBy: { code: "asc" } });
  const [profileUnits, profileCatalogs, accountingProfiles] = await Promise.all([
    prisma.planningEntityUnit.findMany({ where: allowed ? { budgetUnitId: { in: allowed } } : {}, include: { budgetUnit: true, governmentEntity: true }, orderBy: { budgetUnitId: "asc" } }),
    prisma.planningCatalogVersion.findMany({ where: { status: "PUBLISHED" }, include: { entries: { where: { kind: "ACCOUNT", canonicalId: { not: "" }, NOT: { canonicalId: { startsWith: "UNMAPPED:" } } }, orderBy: { code: "asc" } } }, orderBy: { year: "desc" } }),
    prisma.taxRegistryEntry.findMany({ where: { ...registryAccess, entityType: "TAX", category: { in: ["ACCOUNTING_PROFILE", "DEBT_ACCOUNTING_PROFILE"] }, status: "ATIVO" }, orderBy: [{ entityId: "asc" }, { version: "desc" }] }),
  ]);
  return <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <TaxAccountingProfileForm taxes={taxes.map(item => ({ id: item.id, label: item.name }))} units={profileUnits.map(item => ({ id: item.budgetUnitId, label: `${item.governmentEntity.name} · ${item.budgetUnit.name}` }))} catalogs={profileCatalogs.map(item => ({ id: item.id, label: item.label, accounts: item.entries.filter(entry => { const attributes = object(entry.attributes); return attributes.operational === true && attributes.pocOnly === false && attributes.informationNature === "P" && attributes.postingAllowed === true; }).map(entry => ({ id: entry.canonicalId!, label: `${entry.code} · ${entry.name}`, nature: String(object(entry.attributes).balanceNature) })) })).filter(item => item.accounts.length > 0)} profiles={accountingProfiles.map(item => ({ id: item.id, category: item.category, label: `${item.title} · ${profileUnits.find(unit => unit.budgetUnitId === object(item.data).budgetUnitId)?.budgetUnit.name ?? object(item.data).budgetUnitId}`, taxId: item.entityId, budgetUnitId: String(object(item.data).budgetUnitId), from: item.effectiveFrom.toISOString().slice(0, 10), until: item.effectiveUntil?.toISOString().slice(0, 10) ?? null, version: item.version }))} />
    <AssessmentBenefitForm rules={benefitRules.map((rule) => ({ id: rule.id, label: `${rule.code} · ${rule.name} · ${rule.legalReference}` }))} assessments={assessmentRows.filter((entry) => entry.balance > 0 && !["Cancelado", "Pago", "Extinto", "Suspenso", "Dívida Ativa"].includes(entry.status)).map((entry) => ({ id: entry.id, label: `${entry.number} · ${entry.taxpayer}`, balance: entry.balance }))} documents={documents.map((entry) => ({ id: entry.id, label: entry.title }))} />
    <CreditMovementReversalForm movements={reversibleMovements.map((movement) => ({ id: movement.id, label: `${movement.title} · ${object(movement.data).amount ?? ""} · ${movement.entityId}` }))} />
    <AuthorizedCompensationForm credits={credits.filter((entry) => entry.status === "DISPONIVEL").map((entry) => ({ id: entry.id, label: `${entry.title} · ${object(entry.data).available ?? ""} · ${entry.entityId}` }))} assessments={assessmentRows.filter((entry) => entry.balance > 0 && !["Cancelado", "Pago", "Suspenso", "Dívida Ativa"].includes(entry.status)).map((entry) => ({ id: entry.id, label: `${entry.number} · ${entry.taxpayer}` }))} documents={documents.map((entry) => ({ id: entry.id, label: entry.title }))} />
    <MotorFiscalClient
    taxes={taxes.map((item) => ({ id: item.id, name: item.name }))}
    taxpayers={taxpayers.map((item) => ({ id: item.id, name: taxpayerName(item), realEstates: item.realEstates, registrations: item.economicRegistrations }))}
    parameters={parameters.map((item) => ({ id: item.id, taxId: item.taxId, tax: item.tax.name, code: item.code, name: item.name, type: item.calculationType, configuration: item.configuration, effectiveFrom: item.effectiveFrom.toISOString(), effectiveUntil: item.effectiveUntil?.toISOString() ?? null, active: item.isActive }))}
    assessments={assessmentRows}
    guides={guides.map((guide) => { const total = Number(guide.totalValueDecimal ?? guide.totalValue); const paid = guide.payments.reduce((sum, payment) => sum + Number(payment.amountPaidDecimal ?? payment.amountPaid), 0); return { id: guide.id, number: guide.guideNumber ?? guide.id, assessmentId: guide.assessmentId, assessmentNumber: guide.assessment.assessmentNumber ?? guide.assessmentId, tax: guide.assessment.tax.name, taxpayer: taxpayerName(guide.assessment.taxpayer), total, paid, balance: Math.max(total - paid, 0), dueDate: guide.dueDate.toISOString(), status: guide.status }; })}
    events={visibleEvents.map((event) => ({ id: event.id, integration: event.integrationCode, type: event.eventType, key: event.idempotencyKey, status: event.status, reference: event.externalReference, result: event.result, date: event.createdAt.toISOString() }))}
    credits={credits.map((entry) => ({ id: entry.id, taxpayerId: entry.entityId, title: entry.title, status: entry.status, data: object(entry.data), date: entry.createdAt.toISOString() }))}
    refunds={refunds.map((entry) => ({ id: entry.id, taxpayerId: entry.entityId, title: entry.title, status: entry.status, data: object(entry.data), date: entry.createdAt.toISOString() }))}
    agreements={agreements.map((entry) => ({ id: entry.id, code: entry.entityId, name: entry.title, data: object(entry.data) }))}
    reconciliations={reconciliations.map((entry) => ({ id: entry.id, agreementId: entry.entityId, title: entry.title, status: entry.status, data: object(entry.data), date: entry.createdAt.toISOString() }))}
    bankAccounts={bankAccounts.map((item) => ({ id: item.id, label: `${item.bankName} · ${item.agency}/${item.accountNumber}` }))}
    revenueNatures={revenueNatures.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))}
    resourceSources={resourceSources.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }))}
    processes={processes}
    documents={documents}
  /></div>;
}
