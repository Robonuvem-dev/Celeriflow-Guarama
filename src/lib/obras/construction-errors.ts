import { DrizzleQueryError } from "drizzle-orm";
import { z } from "zod";
import { getPostgresError, PersistenceError } from "@/db/errors";

export function constructionActionMessage(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return error.issues[0].message;
  return error instanceof Error && !(error instanceof DrizzleQueryError) && !(error instanceof PersistenceError) && !getPostgresError(error) ? error.message : fallback;
}
