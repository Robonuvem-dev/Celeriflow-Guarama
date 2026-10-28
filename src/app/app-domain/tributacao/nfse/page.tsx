import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import NfseClient from "./NfseClient";
import { db } from "@/db/client";
import { readNfsePage } from "@/db/repositories/taxation-pages/nfse";
import { listFiscalRegistrations } from "@/db/repositories/taxation-pages/lookups";
export const dynamic = "force-dynamic";
export default async function NfsePage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db;
  const unrestricted = isSystemAdministrator(user);
  const [{ activity, rawInvoices, rawTaxpayers, credentials, events, rpsBatches, dms, occasional, credits, fiscalRows }, registrations] = await Promise.all([
    readNfsePage(database, unrestricted ? undefined : user.allowedBudgetUnitIds),
    listFiscalRegistrations(database, { active: true, order: true }),
  ]);
  if (!activity) throw new Error("Cadastre uma atividade de serviço ativa com alíquota de ISS antes de acessar a NFS-e.");
  const fiscalMap = new Map(fiscalRows.map((row) => [row.invoiceId, row]));
  const taxpayers = rawTaxpayers.map((row) => ({ id: row.id, name: row.company?.corporateName ?? row.person?.fullName ?? row.id, document: row.company?.cnpj ?? row.person?.cpf ?? "" }));
  const nameMap = new Map(taxpayers.map((row) => [row.id, row.name]));
  const invoices = rawInvoices.map((row) => { const fiscal = fiscalMap.get(row.id); return { id: row.id, invoiceNumber: row.invoiceNumber, verificationCode: row.verificationCode, serviceValue: Number(row.serviceValueDecimal ?? row.serviceValue), deductions: Number(row.deductionsDecimal ?? row.deductions), issValue: Number(row.issValueDecimal ?? row.issValue), ownIss: Number(fiscal?.ownIssDecimal ?? 0), retainedIss: Number(fiscal?.retainedIssDecimal ?? 0), competence: row.competence, status: row.status, providerId: row.providerId, providerName: row.provider.company?.corporateName ?? row.provider.person?.fullName ?? row.providerId, takerName: row.taker?.company?.corporateName ?? row.taker?.person?.fullName ?? "—", description: fiscal?.serviceDescription ?? "Registro anterior", economicRegistrationId: fiscal?.economicRegistrationId ?? "", activityId: fiscal?.serviceActivityId ?? activity.id, createdAt: row.createdAt.toISOString() }; });
  return <NfseClient data={{
    invoices, taxpayers,
    registrations: registrations.map((row) => ({ id: row.id, taxpayerId: row.taxpayerId, municipalInsc: row.municipalInsc, cnae: row.primaryCnae ?? "", name: nameMap.get(row.taxpayerId) ?? row.taxpayerId })),
    activity: { id: activity.id, name: activity.name, rate: Number(activity.issRate) },
    credentials: credentials.map((row) => ({ id: row.id, taxpayerId: row.taxpayerId, providerName: nameMap.get(row.taxpayerId) ?? row.taxpayerId, registrationId: row.economicRegistrationId, status: row.status, requestedAt: row.requestedAt.toISOString(), reason: row.decisionReason ?? "", history: row.events.map((event) => `${event.eventType}: ${event.description}`) })),
    events: events.map((row) => ({ id: row.id, invoiceId: row.invoiceId, type: row.eventType, description: row.description, createdAt: row.createdAt.toISOString() })),
    rps: rpsBatches.map((row) => ({ id: row.id, batchNumber: row.batchNumber, protocol: row.protocol, source: row.source, status: row.status, items: row.items.map((item) => ({ id: item.id, number: item.rpsNumber, status: item.status })) })),
    dms: dms.map((row) => ({ id: row.id, protocol: row.protocol, taxpayerName: nameMap.get(row.taxpayerId) ?? row.taxpayerId, competence: row.competence, direction: row.direction, channel: row.channel, status: row.status, noMovement: row.noMovement, ownIss: Number(row.ownIssDecimal), retainedIss: Number(row.retainedIssDecimal) })),
    occasional: occasional.map((row) => ({ id: row.id, requestNumber: row.requestNumber, providerName: nameMap.get(row.providerTaxpayerId) ?? row.providerTaxpayerId, providerId: row.providerTaxpayerId, status: row.status, amount: Number(row.serviceValueDecimal), tax: Number(row.taxAmountDecimal), paymentRequired: row.paymentRequired, guideId: row.guideId })),
    credits: credits.map((row) => ({ id: row.id, taxpayerId: row.taxpayerId, providerName: nameMap.get(row.taxpayerId) ?? row.taxpayerId, type: row.creditType, origin: row.originDocument, original: Number(row.originalAmountDecimal), available: Number(row.availableAmountDecimal), status: row.status })),
  }} />;
}
