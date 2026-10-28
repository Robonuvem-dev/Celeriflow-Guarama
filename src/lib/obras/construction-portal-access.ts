import "server-only";
import { cookies } from "next/headers";
import { getSessionPrincipal, SESSION_COOKIE_NAME } from "@/lib/platform/session";
import { db } from "@/db/client";
import { findActiveConstructionPortalIdentity } from "@/db/repositories/infrastructure/construction-access";
import { AccessError } from "@/lib/platform/tenant-context";

export async function getConstructionPortalIdentity() {
  const principal = await getSessionPrincipal((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!principal) throw new AccessError("Entre no portal para continuar.", 401);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const identity = await findActiveConstructionPortalIdentity(db, principal, today);
  if (!identity) throw new AccessError("Sua conta não possui habilitação profissional vigente para Construção Civil.", 403);
  return identity;
}
