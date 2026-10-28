import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { realEstates } from "@/db/schema/registry";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";

export async function actionProperty(database: DatabaseExecutor, id: string) {
  return (await database.select().from(realEstates).where(eq(realEstates.id, id)).limit(1))[0] ?? null;
}
export async function actionActivePropertyCharacteristics(database: DatabaseExecutor, id: string) {
  return database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "REAL_ESTATE"), eq(taxRegistryEntries.entityId, id), inArray(taxRegistryEntries.category, ["BCI", "AREA", "CARACTERISTICA", "ATRIBUTO"]), eq(taxRegistryEntries.status, "ATIVO")));
}
export async function actionCampaignProperties(database: DatabaseExecutor, input: { fiscalZone?: string; block?: string; status?: string }) {
  return database.select({ id: realEstates.id }).from(realEstates).where(and(input.fiscalZone ? eq(realEstates.fiscalZone, input.fiscalZone) : undefined, input.block ? eq(realEstates.block, input.block) : undefined, input.status ? eq(realEstates.status, input.status) : undefined));
}
