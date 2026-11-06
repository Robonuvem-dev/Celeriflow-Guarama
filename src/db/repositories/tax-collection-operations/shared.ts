import { NotificationDispatcher } from "@/lib/notifications/notification-dispatcher";
import { dteMailboxes } from "@/db/schema/taxation-dte";
import { taxpayers, companies } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { eq, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import type { JsonValue } from "@/db/json";
import { dteCategories, dteMessages, dteMessageEvents } from "@/db/schema/taxation-dte";

export function collectionJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function collectionRow<T>(rows: T[], message = "Registro tributário não encontrado."): T {
  const row = rows[0];
  if (row === undefined) throw new Error(message);
  return row;
}

export async function lockCollectionOperation(tx: DatabaseTransaction, key: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
}

/** Caller owns the transaction and mailbox authorization. Replays never replace
 * the original message, deadline, GED evidence or availability event. */
export async function publishCollectionMessage(tx: DatabaseTransaction, input: {
  mailboxId: string; categoryCode: string; categoryName: string; deadlineDays: number;
  subject: string; body: string; key: string; actorUsuarioId: string;
  description: string; documentId?: string | null; processId?: string | null;
}) {
  await lockCollectionOperation(tx, `COLLECTION-DTE:${input.key}`);
  let category = (await tx.select().from(dteCategories).where(eq(dteCategories.code, input.categoryCode)).limit(1))[0];
  if (!category) {
    await tx.insert(dteCategories).values({ code: input.categoryCode, name: input.categoryName, retentionRequired: true, defaultDeadlineDays: input.deadlineDays }).onConflictDoNothing({ target: dteCategories.code });
    category = collectionRow(await tx.select().from(dteCategories).where(eq(dteCategories.code, input.categoryCode)).limit(1));
  }
  const existing = (await tx.select().from(dteMessages).where(eq(dteMessages.idempotencyKey, input.key)).limit(1))[0];
  if (existing) return existing;
  const message = collectionRow(await tx.insert(dteMessages).values({ mailboxId: input.mailboxId, categoryId: category.id, subject: input.subject, body: input.body, idempotencyKey: input.key, deadlineAt: new Date(Date.now() + category.defaultDeadlineDays * 86400000), documentId: input.documentId, processId: input.processId, createdByUsuarioId: input.actorUsuarioId }).returning());
  await tx.insert(dteMessageEvents).values({ messageId: message.id, eventType: "DISPONIBILIZADA", description: input.description, actorUsuarioId: input.actorUsuarioId });
  // Notificação por E-mail via SES (CF27 — 27.62, 27.63, 27.74, 27.86, 27.90, 27.100, 27.149)
  (async () => {
    try {
      const [box] = await tx.select({
        establishmentCnpj: dteMailboxes.establishmentCnpj,
        companyEmail: companies.email,
        personEmail: people.email,
      }).from(dteMailboxes)
      .leftJoin(taxpayers, eq(taxpayers.id, dteMailboxes.taxpayerId))
      .leftJoin(companies, eq(companies.id, taxpayers.companyId))
      .leftJoin(people, eq(people.id, taxpayers.personId))
      .where(eq(dteMailboxes.id, input.mailboxId)).limit(1);

      const email = box?.companyEmail || box?.personEmail;
      const cnpj = box?.establishmentCnpj || "Cadastrado";
      const baseUrl = process.env.CELERIFLOW_PUBLIC_BASE_URL || "https://guarama.celeriflow.com.br";
      const link = `${baseUrl.replace(/\/$/, "")}/tributacao/domicilio-tributario`;

      if (email) {
        if (input.categoryCode === "AUTORREGULARIZACAO_SN") {
          await NotificationDispatcher.sendSimplesNotificacaoPrevia({ to: email, periodo: "em apuração", link });
        } else if (input.categoryCode === "SIMPLES_EXCLUSAO") {
          await NotificationDispatcher.sendSimplesAvisoCobranca({ to: email, cnpj, link });
        } else if (input.categoryCode === "FISCALIZACAO_DESIF") {
          await NotificationDispatcher.sendSimplesComunicacaoFiscal({ to: email, cnpj, link });
        } else {
          await NotificationDispatcher.sendSimplesNotificacaoTributaria({ to: email, cnpj, link });
        }
      }
    } catch (err) {
      console.error("[Notification Error] DTE message email notice failed:", err);
    }
  })().catch(() => {});
  return message;
}
