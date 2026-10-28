import type { LegacyWaterReading } from "@/lib/contracts/sanitation";
import type { DatabaseExecutor } from "../../transaction";
import { legacyWaterReadings } from "../../schema/sanitation";

type LegacyWaterReadingInput = Omit<LegacyWaterReading, "id" | "createdAt" | "dataLeitura">;

export async function insertLegacyWaterReading(db: DatabaseExecutor, input: LegacyWaterReadingInput): Promise<LegacyWaterReading> {
  const [record] = await db.insert(legacyWaterReadings).values(input).returning();
  if (!record) throw new Error("Não foi possível registrar a leitura.");
  return record;
}
