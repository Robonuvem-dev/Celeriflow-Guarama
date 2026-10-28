import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import IssBancarioClient from "./IssBancarioClient";
import { db } from "@/db/client";
import { listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";
import { listFiscalProcessOptions } from "@/db/repositories/taxation-pages/lookups";
import { readDesifPage } from "@/db/repositories/taxation-pages/desif";
export const dynamic = "force-dynamic";

export default async function IssBancarioPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const database = context.database ?? db;
  const [{ institutions, imports, assessments, balances, movements, cases }, taxpayers, processes] = await Promise.all([
    readDesifPage(database),
    listPageTaxpayers(database, { active: true, companyOnly: true, order: "created-asc", limit: 100 }),
    listFiscalProcessOptions(database, 100, true),
  ]);
  return <IssBancarioClient data={{
    taxpayers: taxpayers.map(row => ({ id: row.id, name: row.company?.corporateName ?? row.id, document: row.company?.cnpj ?? "" })), processes,
    institutions: institutions.map(row => ({ id: row.id, name: row.name, baseCnpj: row.baseCnpj, status: row.status, taxpayerId: row.taxpayerId, agencies: row.agencies.map(agency => ({ id: agency.id, code: agency.code, name: agency.name, fullCnpj: agency.fullCnpj, registration: agency.municipalRegistration, status: agency.status })), plans: row.pgccPlans.map(plan => ({ id: plan.id, version: plan.version, status: plan.status, accounts: plan.accounts.map(account => ({ id: account.id, code: account.code, name: account.name, subtitles: account.subtitles.map(subtitle => ({ id: subtitle.id, code: subtitle.code, name: subtitle.name, rate: Number(subtitle.taxRate) })), cosif: account.cosifLinks.map(link => `${link.cosifAccount.code} — ${link.cosifAccount.name}`) })) })), tariffs: row.tariffs.map(item => ({ id: item.id, code: item.code, name: item.name, amount: Number(item.amountDecimal) })), packages: row.packages.map(item => ({ id: item.id, code: item.code, name: item.name, composition: item.items.map(part => `${part.quantity} × ${part.tariff.name}`).join(", ") })) })),
    imports: imports.map(row => ({ id: row.id, institution: row.institution.name, agency: row.agency?.name ?? "Todas", competence: row.competence, moduleType: row.moduleType, fileName: row.fileName, version: row.abrasfVersion, originMode: row.originMode, status: row.status, signaturePolicy: row.signaturePolicy, signatureStatus: row.signatureStatus, receipt: row.receiptNumber, inconsistencies: row.inconsistencies ?? [] })),
    assessments: assessments.map(row => ({ id: row.id, institution: row.agency.institution.name, agency: row.agency.name, competence: row.competence, subtitle: `${row.subtitle.code} — ${row.subtitle.name}`, revenue: Number(row.revenueDecimal), deduction: Number(row.deductionDecimal), base: Number(row.taxableBaseDecimal), rate: Number(row.rate), grossTax: Number(row.grossTaxDecimal), credit: Number(row.creditDecimal), debit: Number(row.debitAdjustmentDecimal), due: Number(row.taxDueDecimal), status: row.status, guideId: row.guideId })),
    balances: balances.map(row => ({ id: row.id, agency: row.agency.name, competence: row.competence, account: `${row.pgccAccount.code} — ${row.pgccAccount.name}`, opening: Number(row.openingBalanceDecimal), credits: Number(row.creditsDecimal), debits: Number(row.debitsDecimal), calculated: Number(row.calculatedCloseDecimal), declared: Number(row.declaredCloseDecimal), difference: Number(row.differenceDecimal), inconsistency: row.inconsistency })),
    movements: movements.map(row => ({ id: row.id, agency: row.agency.name, competence: row.competence, package: row.package.name, holders: row.accountHolderQuantity, potential: Number(row.potentialRevenueDecimal), collected: Number(row.collectedRevenueDecimal), difference: Number(row.differenceDecimal), impact: Number(row.assessmentImpactDecimal) })),
    cases: cases.map(row => ({ id: row.id, institution: row.institution.name, agency: row.agency?.name ?? "Todas", competence: row.competence, findingType: row.findingType, status: row.status, os: row.serviceOrderNumber, processId: row.processId, tiafDocumentId: row.tiafDocumentId, mapDocumentId: row.mapDocumentId, infractionId: row.infractionId, dteMessageId: row.dteMessageId, events: row.events.map(event => `${event.eventType}: ${event.description}`) })),
  }} />;
}
