import { and, eq } from "drizzle-orm";
import type { JsonValue } from "../../json";
import type { DatabaseExecutor } from "../../transaction";
import { taxRegistryEntries } from "../../schema/taxation-registry";

export async function readTaxAssessmentCompensationMovements(db: DatabaseExecutor, assessmentId: string): Promise<{ data: JsonValue }[]> {
  return db.select({ data: taxRegistryEntries.data }).from(taxRegistryEntries).where(and(
    eq(taxRegistryEntries.entityType, "TAX_ASSESSMENT"),
    eq(taxRegistryEntries.entityId, assessmentId),
    eq(taxRegistryEntries.category, "CREDIT_MOVEMENT"),
    eq(taxRegistryEntries.status, "EFETIVADO"),
  ));
}
