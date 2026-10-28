import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import { databaseTimestamp } from "@/db/temporal";
import { pageActivities } from "@/db/schema/taxation-pages";
import { taxInvoices, nfseInvoiceData, nfseEvents } from "@/db/schema/taxation-nfse";
import { listPageTaxpayers } from "./registry";
import type { TaxpayerDetails } from "@/lib/contracts/registry";
import type { ServiceActivityRow } from "@/lib/contracts/taxation-pages";

type CredentialRaw = { id: string; taxpayerId: string; economicRegistrationId: string; status: string; requestedAt: string; decisionReason: string | null; events: { eventType: string; description: string }[] };
type Rps = { id: string; batchNumber: string; protocol: string; source: string; status: string; items: { id: string; rpsNumber: string; status: string }[] };
type DmsRaw = { id: string; protocol: string; taxpayerId: string; competence: string; direction: string; channel: string; status: string; noMovement: boolean; ownIssDecimal: string; retainedIssDecimal: string };
type OccasionalRaw = { id: string; requestNumber: string; providerTaxpayerId: string; status: string; serviceValueDecimal: string; taxAmountDecimal: string; paymentRequired: boolean; guideId: string | null };
type CreditRaw = { id: string; taxpayerId: string; creditType: string; originDocument: string; originalAmountDecimal: string; availableAmountDecimal: string; status: string };
type InvoiceSource = { id: string; invoiceNumber: number; verificationCode: string; serviceValue: number; serviceValueDecimal: Decimal | null; deductions: number; deductionsDecimal: Decimal | null; issValue: number; issValueDecimal: Decimal | null; competence: string; status: string; providerId: string; provider: TaxpayerDetails; taker: TaxpayerDetails | null; createdAt: Date };
type NfseSource = {
  activity: ServiceActivityRow | undefined; rawInvoices: InvoiceSource[]; rawTaxpayers: TaxpayerDetails[];
  credentials: (Omit<CredentialRaw, "requestedAt"> & { requestedAt: Date })[];
  events: { id: string; invoiceId: string; eventType: string; description: string; createdAt: Date }[];
  rpsBatches: Rps[]; dms: (Omit<DmsRaw, "ownIssDecimal" | "retainedIssDecimal"> & { ownIssDecimal: Decimal; retainedIssDecimal: Decimal })[];
  occasional: (Omit<OccasionalRaw, "serviceValueDecimal" | "taxAmountDecimal"> & { serviceValueDecimal: Decimal; taxAmountDecimal: Decimal })[];
  credits: (Omit<CreditRaw, "originalAmountDecimal" | "availableAmountDecimal"> & { originalAmountDecimal: Decimal; availableAmountDecimal: Decimal })[];
  fiscalRows: { invoiceId: string; ownIssDecimal: Decimal; retainedIssDecimal: Decimal; serviceDescription: string; economicRegistrationId: string; serviceActivityId: string }[];
};
/** Authorization is applied before every independent limit, including credential-derived providers. */
export async function readNfsePage(database: DatabaseExecutor, allowedBudgetUnitIds?: string[]): Promise<NfseSource> {
  const scope = allowedBudgetUnitIds === undefined ? sql`true` : allowedBudgetUnitIds.length ? sql`${nfseInvoiceData.calculationSnapshot}->'budgetUnitId' IN (${sql.join(allowedBudgetUnitIds.map(id => sql`${JSON.stringify(id)}::jsonb`), sql`, `)})` : sql`false`;
  const invoiceIds = (await database.select({ id: nfseInvoiceData.invoiceId }).from(nfseInvoiceData).where(scope)).map(row => row.id);
  const unitScope = allowedBudgetUnitIds === undefined ? sql`true` : allowedBudgetUnitIds.length ? sql`b."budgetUnitId" IN (${sql.join(allowedBudgetUnitIds.map(id => sql`${id}`), sql`, `)})` : sql`false`;
  const activityIds = (await database.select({ id: pageActivities.id }).from(pageActivities).where(allowedBudgetUnitIds === undefined ? undefined : sql`EXISTS (SELECT 1 FROM "TaxFinancialMapping" m JOIN "BankAccount" b ON b.id=m."defaultBankAccountId" WHERE m."taxId"=${pageActivities.taxId} AND ${unitScope})`)).map(row => row.id);
  const credentialScope = allowedBudgetUnitIds === undefined ? sql`true` : activityIds.length ? sql`c."serviceActivityId" IN (${sql.join(activityIds.map(id => sql`${id}`), sql`, `)})` : sql`false`;
  const providerIds = (await database.execute<{ taxpayerId: string }>(sql`SELECT c."taxpayerId" FROM "NfseCredentialRequest" c WHERE ${credentialScope}`)).rows.map(row => row.taxpayerId);
  const providers = allowedBudgetUnitIds === undefined ? sql`true` : providerIds.length ? sql`"providerTaxpayerId" IN (${sql.join(providerIds.map(id => sql`${id}`), sql`, `)})` : sql`false`;
  const creditScope = allowedBudgetUnitIds === undefined ? sql`true` : providerIds.length ? sql`"taxpayerId" IN (${sql.join(providerIds.map(id => sql`${id}`), sql`, `)})` : sql`false`;
  const occasionalScope = allowedBudgetUnitIds === undefined ? sql`true` : activityIds.length ? sql`"serviceActivityId" IN (${sql.join(activityIds.map(id => sql`${id}`), sql`, `)})` : sql`false`;
  const dmsScope = allowedBudgetUnitIds === undefined ? sql`true` : allowedBudgetUnitIds.length ? sql`payload->'budgetUnitId' IN (${sql.join(allowedBudgetUnitIds.map(id => sql`${JSON.stringify(id)}::jsonb`), sql`, `)})` : sql`false`;
  const [activities, invoices, rawTaxpayers, credentials, events, rps, dms, occasional, credits] = await Promise.all([
    database.select().from(pageActivities).where(and(eq(pageActivities.isActive, true), isNotNull(pageActivities.issRate), allowedBudgetUnitIds === undefined ? undefined : inArray(pageActivities.id, activityIds))).orderBy(asc(pageActivities.name)).limit(1),
    database.select().from(taxInvoices).where(allowedBudgetUnitIds === undefined ? undefined : inArray(taxInvoices.id, invoiceIds)).orderBy(desc(taxInvoices.createdAt)).limit(200),
    listPageTaxpayers(database, { active: true, order: "created-asc" }),
    database.execute<CredentialRaw>(sql`SELECT c.id,c."taxpayerId",c."economicRegistrationId",c.status,c."requestedAt",c."decisionReason",COALESCE((SELECT jsonb_agg(jsonb_build_object('eventType',e."eventType",'description',e.description) ORDER BY e."createdAt" DESC) FROM "NfseCredentialEvent" e WHERE e."credentialId"=c.id),'[]'::jsonb) AS events FROM "NfseCredentialRequest" c WHERE ${credentialScope} ORDER BY c."createdAt" DESC LIMIT 100`),
    database.select().from(nfseEvents).where(allowedBudgetUnitIds === undefined ? undefined : inArray(nfseEvents.invoiceId, invoiceIds)).orderBy(desc(nfseEvents.createdAt)).limit(400),
    database.execute<Rps>(sql`SELECT b.id,b."batchNumber",b.protocol,b.source,b.status,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'rpsNumber',i."rpsNumber",'status',i.status)) FROM "NfseRpsItem" i WHERE i."batchId"=b.id),'[]'::jsonb) AS items FROM "NfseRpsBatch" b WHERE ${providers} ORDER BY b."createdAt" DESC LIMIT 100`),
    database.execute<DmsRaw>(sql`SELECT id,protocol,"taxpayerId",competence,direction,channel,status,"noMovement","ownIssDecimal"::text,"retainedIssDecimal"::text FROM "NfseDmsDeclaration" WHERE ${dmsScope} ORDER BY "createdAt" DESC LIMIT 100`),
    database.execute<OccasionalRaw>(sql`SELECT id,"requestNumber","providerTaxpayerId",status,"serviceValueDecimal"::text,"taxAmountDecimal"::text,"paymentRequired","guideId" FROM "NfseOccasionalRequest" WHERE ${occasionalScope} ORDER BY "createdAt" DESC LIMIT 100`),
    database.execute<CreditRaw>(sql`SELECT id,"taxpayerId","creditType","originDocument","originalAmountDecimal"::text,"availableAmountDecimal"::text,status FROM "NfseDeductionCredit" WHERE ${creditScope} ORDER BY "createdAt" DESC LIMIT 100`),
  ]);
  const parties = await listPageTaxpayers(database, { ids: invoices.flatMap(row => [row.providerId, ...(row.takerId ? [row.takerId] : [])]) });
  const fiscalRows = await database.select().from(nfseInvoiceData).where(inArray(nfseInvoiceData.invoiceId, invoices.map(row => row.id)));
  const rawInvoices = invoices.map(row => { const provider = parties.find(party => party.id === row.providerId); if (!provider) throw new Error("Prestador fiscal não encontrado."); return { ...row, provider, taker: parties.find(party => party.id === row.takerId) ?? null }; });
  return { activity: activities[0], rawInvoices, rawTaxpayers, credentials: credentials.rows.map(row => ({ ...row, requestedAt: databaseTimestamp(row.requestedAt) })), events, rpsBatches: rps.rows, dms: dms.rows.map(row => ({ ...row, ownIssDecimal: new Decimal(row.ownIssDecimal), retainedIssDecimal: new Decimal(row.retainedIssDecimal) })), occasional: occasional.rows.map(row => ({ ...row, serviceValueDecimal: new Decimal(row.serviceValueDecimal), taxAmountDecimal: new Decimal(row.taxAmountDecimal) })), credits: credits.rows.map(row => ({ ...row, originalAmountDecimal: new Decimal(row.originalAmountDecimal), availableAmountDecimal: new Decimal(row.availableAmountDecimal) })), fiscalRows };
}
