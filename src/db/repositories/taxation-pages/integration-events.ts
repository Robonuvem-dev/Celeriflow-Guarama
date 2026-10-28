import { and, desc, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { pageIntegrationEvents } from "@/db/schema/taxation-pages";
import type { TaxIntegrationRow } from "@/lib/contracts/taxation-pages";

export async function listPageIntegrationEvents(database: DatabaseExecutor, codes: string[], allowedBudgetUnitIds?: string[], receivedOrder = false): Promise<TaxIntegrationRow[]> {
  const scope = allowedBudgetUnitIds === undefined ? undefined : allowedBudgetUnitIds.length ? sql`${pageIntegrationEvents.payload}->'budgetUnitId' IN (${sql.join(allowedBudgetUnitIds.map(id => sql`${JSON.stringify(id)}::jsonb`), sql`, `)})` : sql`false`;
  return database.select().from(pageIntegrationEvents).where(and(inArray(pageIntegrationEvents.integrationCode, codes), scope)).orderBy(desc(receivedOrder ? pageIntegrationEvents.receivedAt : pageIntegrationEvents.createdAt)).limit(200);
}
