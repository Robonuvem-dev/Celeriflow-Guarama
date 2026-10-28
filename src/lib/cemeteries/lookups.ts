import "server-only";
import { z } from "zod";
import type { DatabaseExecutor } from "@/db/transaction";
import { readCemeteryLookup } from "@/db/repositories/cemeteries/lookups";
import type { CemeteryLookupPage } from "@/lib/contracts/cemeteries";

export const cemeteryLookupSchema = z.object({
  kind: z.enum(["taxpayer", "grave", "deceased", "document", "cemetery", "funeralHome", "cause", "chapel", "lot", "ossuary", "sector"]),
  q: z.string().trim().max(120).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  cemeteryId: z.string().max(100).default(""),
  personOnly: z.enum(["true", "false"]).default("false"),
});
export type CemeteryLookupItem = { id: string; label: string };

export async function cemeteryLookup(db: DatabaseExecutor, input: z.infer<typeof cemeteryLookupSchema>): Promise<CemeteryLookupPage> {
  return readCemeteryLookup(db, input);
}
