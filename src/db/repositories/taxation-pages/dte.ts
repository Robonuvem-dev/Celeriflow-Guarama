import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { JsonValue } from "@/db/json";
import { databaseTimestamp } from "@/db/temporal";
import { dteMailboxes, dteCategories, dteMessages, dteMessageEvents } from "@/db/schema/taxation-dte";
import { documents } from "@/db/schema/registry";
import { documentSignatures } from "@/db/schema/document-workflow";

type DteEvent = { eventType: string; description: string; createdAt: Date };
type Mailbox = { id: string; taxpayerId: string; establishmentCnpj: string | null; status: string; emailNoticeEnabled: boolean; smsNoticeEnabled: boolean };
type Category = { id: string; name: string; retentionRequired: boolean; defaultDeadlineDays: number };
type Message = { id: string; mailboxId: string; subject: string; body: string; status: string; availableAt: Date; deadlineAt: Date | null; readAt: Date | null; acknowledgedAt: Date | null; tacitAcknowledgedAt: Date | null; emailNoticeAt: Date | null; smsNoticeAt: Date | null; documentId: string | null; signatureRequired: boolean; signatureStatus: string | null; category: Category; events: DteEvent[] };
type PowerRaw = { id: string; grantorTaxpayerId: string; attorneyTaxpayerId: string; establishmentCnpjs: JsonValue; status: string; legitimacyMode: string; officialCertificateValidated: boolean; documentId: string | null; events: { eventType: string; description: string; createdAt: string }[] };
type GrantRaw = { id: string; mailboxId: string; authorizedTaxpayerId: string; codeLast4: string; status: string; validUntil: string; revokedAt: string | null };
type DteSource = {
  mailboxes: Mailbox[]; categories: Category[]; messages: Message[];
  powers: (Omit<PowerRaw, "events"> & { events: DteEvent[] })[];
  documents: { id: string; title: string; fileUrl: string; signatures: { signedAt: Date | null; rejectedAt: Date | null; requestedAt: Date; signerName: string; provider: string }[] }[];
  accessGrants: (Omit<GrantRaw, "validUntil" | "revokedAt"> & { validUntil: Date; revokedAt: Date | null; mailbox: Mailbox })[];
};
export async function readDtePage(database: DatabaseExecutor): Promise<DteSource> {
  const [mailboxes, categories, messageRows, powers, documentRows, grants] = await Promise.all([
    database.select().from(dteMailboxes).orderBy(desc(dteMailboxes.createdAt)),
    database.select().from(dteCategories).where(eq(dteCategories.isActive, true)).orderBy(asc(dteCategories.name)),
    database.select({ message: dteMessages, category: dteCategories }).from(dteMessages).innerJoin(dteCategories, eq(dteCategories.id, dteMessages.categoryId)).orderBy(desc(dteMessages.availableAt)).limit(500),
    database.execute<PowerRaw>(sql`SELECT p.id,p."grantorTaxpayerId",p."attorneyTaxpayerId",p."establishmentCnpjs",p.status,p."legitimacyMode",p."officialCertificateValidated",p."documentId",COALESCE((SELECT jsonb_agg(jsonb_build_object('eventType',e."eventType",'description',e.description,'createdAt',e."createdAt") ORDER BY e."createdAt" DESC) FROM "DtePowerOfAttorneyEvent" e WHERE e."powerOfAttorneyId"=p.id),'[]'::jsonb) AS events FROM "DtePowerOfAttorney" p ORDER BY p."createdAt" DESC LIMIT 200`),
    database.select().from(documents).where(inArray(documents.status, ["Válido", "Pendente"])).orderBy(desc(documents.createdAt)).limit(200),
    database.execute<GrantRaw>(sql`SELECT id,"mailboxId","authorizedTaxpayerId","codeLast4",status,"validUntil","revokedAt" FROM "DteAccessGrant" ORDER BY "createdAt" DESC LIMIT 200`),
  ]);
  const [events, signatures] = await Promise.all([
    database.select().from(dteMessageEvents).where(inArray(dteMessageEvents.messageId, messageRows.map(row => row.message.id))).orderBy(desc(dteMessageEvents.createdAt)),
    database.select().from(documentSignatures).where(inArray(documentSignatures.documentId, documentRows.map(row => row.id))).orderBy(desc(documentSignatures.requestedAt)),
  ]);
  return { mailboxes, categories, messages: messageRows.map(row => ({ ...row.message, category: row.category, events: events.filter(event => event.messageId === row.message.id) })), powers: powers.rows.map(row => ({ ...row, events: row.events.map(event => ({ ...event, createdAt: databaseTimestamp(event.createdAt) })) })), documents: documentRows.map(row => ({ ...row, signatures: signatures.filter(signature => signature.documentId === row.id) })), accessGrants: grants.rows.map(row => { const mailbox = mailboxes.find(mailbox => mailbox.id === row.mailboxId); if (!mailbox) throw new Error("Caixa postal fiscal não encontrada."); return { ...row, validUntil: databaseTimestamp(row.validUntil), revokedAt: row.revokedAt === null ? null : databaseTimestamp(row.revokedAt), mailbox }; }) };
}
