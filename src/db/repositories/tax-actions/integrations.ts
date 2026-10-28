import { and, asc, desc, eq, ilike, inArray, isNull, like, or } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { taxIntegrationEvents } from "@/db/schema/tax-accounting";
import { taxpayers, companies } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { economicRegistrations } from "@/db/schema/taxation-core";
import { JsonNull } from "@/db/json";

export async function actionIntegrationReplay(database: DatabaseExecutor, key: string) {
  return (await database.select().from(taxIntegrationEvents).where(eq(taxIntegrationEvents.idempotencyKey, key)).limit(1))[0] ?? null;
}
export async function actionLatestRedesimEvent(database: DatabaseExecutor, taxpayerId: string, registrationId: string | null) {
  return (await database.select({ receivedAt: taxIntegrationEvents.receivedAt }).from(taxIntegrationEvents).where(and(eq(taxIntegrationEvents.integrationCode, "REDESIM"), eq(taxIntegrationEvents.taxpayerId, taxpayerId), registrationId === null ? isNull(taxIntegrationEvents.economicRegistrationId) : eq(taxIntegrationEvents.economicRegistrationId, registrationId), eq(taxIntegrationEvents.status, "PROCESSADO_INTERNO"))).orderBy(desc(taxIntegrationEvents.receivedAt)).limit(1))[0] ?? null;
}
export async function actionRedesimTaxpayer(database: DatabaseExecutor, id: string) {
  const [row] = await database.select({ taxpayer: taxpayers, company: companies }).from(taxpayers).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(eq(taxpayers.id, id)).limit(1);
  if (!row) return null;
  const registrations = await database.select().from(economicRegistrations).where(eq(economicRegistrations.taxpayerId, id)).orderBy(desc(economicRegistrations.createdAt));
  return { ...row.taxpayer, company: row.company, economicRegistrations: registrations };
}
export async function insertActionIntegration(database: DatabaseExecutor, input: typeof taxIntegrationEvents.$inferInsert) {
  return (await database.insert(taxIntegrationEvents).values({ ...input, payload: input.payload === null ? JsonNull : input.payload, result: input.result === null ? JsonNull : input.result }).returning())[0];
}
export async function actionTaxpayerSelection(database: DatabaseExecutor, query: string) {
  const digits = query.replace(/\D/g, "");
  const alphanumeric = query.replace(/[^A-Za-z0-9]/g, "");
  return database.select({ id: taxpayers.id }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(query ? or(ilike(taxpayers.municipalInsc, `%${query}%`), ilike(people.fullName, `%${query}%`), digits ? like(people.cpf, `%${digits}%`) : undefined, ilike(companies.corporateName, `%${query}%`), alphanumeric ? like(companies.cnpj, `%${alphanumeric}%`) : undefined) : undefined).orderBy(asc(taxpayers.id));
}
export async function updateActionTaxpayerStatus(tx: DatabaseTransaction, ids: string[], status: string) {
  await tx.update(taxpayers).set({ status }).where(inArray(taxpayers.id, ids));
}
