import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { accessProfiles, users } from "@/db/schema/identity";
import { citizenTaxpayerAccesses } from "@/db/schema/citizen-access";
import { taxpayers as taxpayerTable } from "@/db/schema/registry";
import { getSessionPrincipal, SESSION_COOKIE_NAME } from "@/lib/platform/session";
import { citizenProcessWhere, citizenReturnTo, hasCitizenProcessScope } from "./policy";

export async function getCitizenAccount(returnTo = "/portal/minha-area") {
  const principal = await getSessionPrincipal((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  const login = `/portal/entrar?${new URLSearchParams({ returnTo: citizenReturnTo(returnTo) })}`;
  if (!principal) redirect(login);
  const [account] = await db.select({ id: users.id, nome: users.nome, email: users.email }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(and(eq(users.firebaseUid, principal.firebaseUid), eq(users.email, principal.email), eq(users.ativo, true), eq(accessProfiles.ativo, true))).limit(1);
  if (!account) redirect(`${login}&error=access`);
  return account;
}

export async function getCitizenProcessWhere(usuarioId: string) {
  const accesses = await db.select({ taxpayerId: citizenTaxpayerAccesses.taxpayerId, scopes: citizenTaxpayerAccesses.scopes }).from(citizenTaxpayerAccesses).where(and(eq(citizenTaxpayerAccesses.usuarioId, usuarioId), eq(citizenTaxpayerAccesses.accessType, "TITULAR"), eq(citizenTaxpayerAccesses.status, "ATIVO"), isNull(citizenTaxpayerAccesses.revokedAt), lte(citizenTaxpayerAccesses.grantedAt, new Date())));
  const ids = accesses.filter((access) => hasCitizenProcessScope(access.scopes)).map((access) => access.taxpayerId);
  const taxpayers = ids.length ? await db.select({ id: taxpayerTable.id }).from(taxpayerTable).where(and(inArray(taxpayerTable.id, ids), eq(taxpayerTable.status, "Ativo"))) : [];
  return citizenProcessWhere(usuarioId, taxpayers.map((taxpayer) => taxpayer.id));
}
