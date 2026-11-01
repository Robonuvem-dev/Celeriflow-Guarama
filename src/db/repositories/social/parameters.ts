import { eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { socialMunicipalSettings } from "../../schema/social-operation-models";
import { defaultMunicipalParameters, municipalParameterSchema } from "@/lib/social/municipal-contract";

export async function readSocialParameters(database: DatabaseExecutor) {
  const [row] = await database.select().from(socialMunicipalSettings).where(eq(socialMunicipalSettings.id, "municipal"));
  return { parameters: row ? municipalParameterSchema.parse(row.parameters) : defaultMunicipalParameters, revision: row?.revision || 0, updatedAt: row?.updatedAt || null };
}
