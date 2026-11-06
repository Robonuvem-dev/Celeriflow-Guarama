import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readNfsePage } from "@/db/repositories/taxation-pages/nfse";
import { listFiscalRegistrations } from "@/db/repositories/taxation-pages/lookups";
import NfaeClient from "./NfaeClient";

export const dynamic = "force-dynamic";

export default async function NfaePage() {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const { user } = context;
  const database = context.database ?? db;
  const unrestricted = isSystemAdministrator(user);

  const [pageData, registrations] = await Promise.all([
    readNfsePage(database, unrestricted ? undefined : user.allowedBudgetUnitIds),
    listFiscalRegistrations(database, { active: true, order: true }),
  ]);

  const { activity, rawTaxpayers, occasional, rawInvoices } = pageData;
  if (!activity) {
    throw new Error("Cadastre uma atividade de serviço ativa com alíquota de ISS antes de gerenciar NFA-e.");
  }

  const taxpayers = rawTaxpayers.map((row) => ({
    id: row.id,
    name: row.company?.corporateName ?? row.person?.fullName ?? row.id,
    document: row.company?.cnpj ?? row.person?.cpf ?? "",
  }));
  const nameMap = new Map(taxpayers.map((row) => [row.id, row.name]));
  const docMap = new Map(taxpayers.map((row) => [row.id, row.document]));

  // Invoices geradas para busca de número/código oficial
  const invoiceMap = new Map(
    rawInvoices.map((inv) => [
      inv.id,
      {
        number: inv.invoiceNumber,
        verificationCode: inv.verificationCode,
        createdAt: inv.createdAt.toISOString(),
      },
    ])
  );

  const nfaeList = occasional.map((row) => {
    const inv = row.invoiceId ? invoiceMap.get(row.invoiceId) : undefined;
    return {
      id: row.id,
      requestNumber: row.requestNumber,
      providerId: row.providerTaxpayerId,
      providerName: nameMap.get(row.providerTaxpayerId) ?? row.providerTaxpayerId,
      providerDocument: docMap.get(row.providerTaxpayerId) ?? "",
      takerId: row.takerTaxpayerId ?? null,
      takerName: row.takerTaxpayerId ? (nameMap.get(row.takerTaxpayerId) ?? row.takerTaxpayerId) : "Consumidor Final",
      takerDocument: row.takerTaxpayerId ? (docMap.get(row.takerTaxpayerId) ?? "") : "",
      serviceDescription: row.serviceDescription ?? "",
      serviceValue: Number(row.serviceValueDecimal),
      deductions: Number(row.deductionValueDecimal ?? 0),
      taxAmount: Number(row.taxAmountDecimal),
      status: row.status,
      paymentRequired: row.paymentRequired,
      guideId: row.guideId,
      invoiceId: row.invoiceId ?? null,
      invoiceNumber: inv?.number,
      verificationCode: inv?.verificationCode,
      createdAt: inv?.createdAt ?? (row.createdAt ? String(row.createdAt) : new Date().toISOString()),
    };
  });

  return (
    <NfaeClient
      nfaeList={nfaeList}
      taxpayers={taxpayers}
      activity={{ id: activity.id, name: activity.name, rate: Number(activity.issRate) }}
      registrations={registrations.map((row) => ({
        id: row.id,
        taxpayerId: row.taxpayerId,
        municipalInsc: row.municipalInsc,
      }))}
    />
  );
}
