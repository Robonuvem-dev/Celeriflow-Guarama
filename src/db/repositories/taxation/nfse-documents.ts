import { and, asc, count, desc, eq, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { taxInvoices, nfseInvoiceData, nfseEvents, nfseCorrectionLetters } from "../../schema/taxation-nfse";
import { addresses, companies, taxpayers } from "../../schema/registry";
import { people } from "../../schema/people";
import type { NfseDocumentData, NfseDocumentHistory, NfsePartyRecord, TaxInvoiceRecord } from "@/lib/contracts/taxation-documents";

async function readParty(db: DatabaseExecutor, id: string): Promise<NfsePartyRecord | null> {
  const [row] = await db.select({ taxpayer: taxpayers, person: people, company: companies }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(eq(taxpayers.id, id)).limit(1);
  if (!row) return null;
  const filters = or(row.person ? eq(addresses.personId, row.person.id) : undefined, row.company ? eq(addresses.companyId, row.company.id) : undefined);
  const locations = filters ? await db.select().from(addresses).where(filters) : [];
  return { ...row.taxpayer, person: row.person ? { ...row.person, addresses: locations.filter(a => a.personId === row.person?.id) } : null, company: row.company ? { ...row.company, addresses: locations.filter(a => a.companyId === row.company?.id) } : null };
}

export async function readNfseDocument(db: DatabaseExecutor, key: { id: string } | { code: string }): Promise<NfseDocumentData | null> {
  const [invoice] = await db.select().from(taxInvoices).where("id" in key ? eq(taxInvoices.id, key.id) : eq(taxInvoices.verificationCode, key.code)).limit(1);
  if (!invoice) return null;
  const [provider, taker, fiscalRows] = await Promise.all([readParty(db, invoice.providerId), invoice.takerId ? readParty(db, invoice.takerId) : null, db.select().from(nfseInvoiceData).where(eq(nfseInvoiceData.invoiceId, invoice.id)).limit(1)]);
  if (!provider) throw new Error("Prestador da NFS-e não encontrado.");
  return { invoice: { ...invoice, provider, taker }, fiscal: fiscalRows[0] ?? null };
}

export async function readNfseDocumentHistory(db: DatabaseExecutor, invoiceId: string): Promise<NfseDocumentHistory> {
  const [events, letters] = await Promise.all([
    db.select().from(nfseEvents).where(eq(nfseEvents.invoiceId, invoiceId)).orderBy(asc(nfseEvents.createdAt)),
    db.select().from(nfseCorrectionLetters).where(eq(nfseCorrectionLetters.invoiceId, invoiceId)).orderBy(asc(nfseCorrectionLetters.createdAt)),
  ]);
  return { events, letters };
}

export async function readOwnNfsePage(db: DatabaseExecutor, actorId: string, competence: string, requestedPage: number): Promise<{ rows: Pick<TaxInvoiceRecord, "id" | "invoiceNumber" | "verificationCode" | "competence" | "status" | "serviceValueDecimal" | "issValueDecimal" | "issRetained">[]; total: number; page: number }> {
  // Exact TITULAR/NFSE grant and canonical active person/company checks are
  // applied in SQL, before count and pagination. Empty grants never broaden it.
  const authorizedParty = sql`SELECT t.id FROM "TaxpayerPortalAccess" a JOIN "Taxpayer" t ON t.id=a."taxpayerId"
    LEFT JOIN "Person" p ON p.id=t."personId" LEFT JOIN "Company" c ON c.id=t."companyId"
    WHERE a."usuarioId"=${actorId} AND a."accessType"='TITULAR' AND a.status='ATIVO' AND a."revokedAt" IS NULL AND a."grantedAt"<=${new Date()}
    AND jsonb_typeof(a.scopes)='array' AND a.scopes @> '["NFSE"]'::jsonb AND t.status='Ativo' AND (p.status='Ativo' OR c.status='Ativo')`;
  const where = and(sql`(${taxInvoices.providerId} IN (${authorizedParty}) OR ${taxInvoices.takerId} IN (${authorizedParty}))`, competence ? eq(taxInvoices.competence, competence) : undefined);
  const [totals] = await db.select({ total: count() }).from(taxInvoices).where(where);
  const total = totals.total;
  const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, requestedPage));
  const rows = await db.select({ id: taxInvoices.id, invoiceNumber: taxInvoices.invoiceNumber, verificationCode: taxInvoices.verificationCode, competence: taxInvoices.competence, status: taxInvoices.status, serviceValueDecimal: taxInvoices.serviceValueDecimal, issValueDecimal: taxInvoices.issValueDecimal, issRetained: taxInvoices.issRetained }).from(taxInvoices).where(where).orderBy(desc(taxInvoices.invoiceNumber)).limit(20).offset((page - 1) * 20);
  return { rows, total, page };
}
