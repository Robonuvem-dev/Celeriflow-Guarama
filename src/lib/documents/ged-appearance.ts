import "server-only";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
export const gedAppearanceSchema = z.object({ institution: z.string().trim().max(150).default("Gestão documental"), accent: z.string().regex(/^#[a-fA-F0-9]{6}$/).default("#4338ca"), density: z.enum(["comfortable", "compact"]).default("comfortable") });
export async function readGedAppearance() {
  const result = await db.execute<{ value: unknown }>(sql`SELECT value FROM "GedSetting" WHERE key='appearance'`);
  return gedAppearanceSchema.parse(result.rows[0]?.value ?? {});
}
