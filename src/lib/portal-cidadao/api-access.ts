import "server-only";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { and, eq } from "drizzle-orm";
import { accessProfiles, users } from "@/db/schema/identity";
import { PersistenceError, getPostgresError } from "@/db/errors";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { getSessionPrincipal, SESSION_COOKIE_NAME } from "@/lib/platform/session";
import { AccessError } from "@/lib/platform/tenant-context";
import { z } from "zod";

export async function getCitizenApiAccount() {
  const principal = await getSessionPrincipal((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!principal) throw new AccessError("Entre no portal para continuar.", 401);
  const [account] = await db.select({ id: users.id, nome: users.nome, email: users.email }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(and(eq(users.firebaseUid, principal.firebaseUid), eq(users.email, principal.email), eq(users.ativo, true), eq(accessProfiles.ativo, true))).limit(1);
  if (!account) throw new AccessError("Conta municipal indisponível.", 403);
  return account;
}

export function portalApiError(error: unknown) {
  const databaseFailure = error instanceof PersistenceError || error instanceof DrizzleQueryError || getPostgresError(error) !== null;
  const message = databaseFailure ? "Não foi possível concluir a operação. Atualize a página e tente novamente." : error instanceof z.ZodError ? error.issues[0]?.message || "Dados inválidos." : error instanceof Error ? error.message : "Não foi possível concluir a operação.";
  return Response.json({ error: message }, { status: error instanceof AccessError ? error.status : databaseFailure ? 500 : 400, headers: { "Cache-Control": "private, no-store" } });
}
