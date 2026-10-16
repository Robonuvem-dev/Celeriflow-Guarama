import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionPrincipal, SESSION_COOKIE_NAME } from "@/lib/platform/session";
import { citizenProcessWhere, citizenReturnTo, hasCitizenProcessScope } from "./policy";

export async function getCitizenAccount(returnTo = "/portal/minha-area") {
  const principal = await getSessionPrincipal((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  const login = `/portal/entrar?${new URLSearchParams({ returnTo: citizenReturnTo(returnTo) })}`;
  if (!principal) redirect(login);
  const account = await prisma.usuario.findFirst({
    where: { firebaseUid: principal.firebaseUid, email: principal.email, ativo: true, perfil: { ativo: true } },
    select: { id: true, nome: true, email: true },
  });
  if (!account) redirect(`${login}&error=access`);
  return account;
}

export async function getCitizenProcessWhere(usuarioId: string) {
  const accesses = await prisma.taxpayerPortalAccess.findMany({
    where: { usuarioId, accessType: "TITULAR", status: "ATIVO", revokedAt: null, grantedAt: { lte: new Date() } },
    select: { taxpayerId: true, scopes: true },
  });
  const ids = accesses.filter((access) => hasCitizenProcessScope(access.scopes)).map((access) => access.taxpayerId);
  const taxpayers = ids.length ? await prisma.taxpayer.findMany({ where: { id: { in: ids }, status: "Ativo" }, select: { id: true } }) : [];
  return citizenProcessWhere(usuarioId, taxpayers.map((taxpayer) => taxpayer.id));
}
