import "server-only";
import { cookies } from "next/headers";
import { getSessionPrincipal, SESSION_COOKIE_NAME } from "@/lib/platform/session";
import { prisma } from "@/lib/prisma";
import { AccessError } from "@/lib/platform/tenant-context";

export async function getConstructionPortalIdentity() {
  const principal = await getSessionPrincipal((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!principal) throw new AccessError("Entre no portal para continuar.", 401);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const identity = await prisma.constructionPortalIdentity.findFirst({ where: { firebaseUid: principal.firebaseUid, email: principal.email, isActive: true, professional: { isActive: true, startsAt: { lte: today }, OR: [{ endsAt: null }, { endsAt: { gte: today } }], person: { status: "Ativo" } } }, select: { id: true, professionalId: true, professional: { select: { professionalType: true, person: { select: { fullName: true } } } } } });
  if (!identity) throw new AccessError("Sua conta não possui habilitação profissional vigente para Construção Civil.", 403);
  return identity;
}
