import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSessionPrincipal, SESSION_COOKIE_NAME } from "@/lib/platform/session";
import { AccessError } from "@/lib/platform/tenant-context";
import { Prisma } from "@prisma/client";
import { z } from "zod";

export async function getCitizenApiAccount() {
  const principal = await getSessionPrincipal((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!principal) throw new AccessError("Entre no portal para continuar.", 401);
  const account = await prisma.usuario.findFirst({ where: { firebaseUid: principal.firebaseUid, email: principal.email, ativo: true, perfil: { ativo: true } }, select: { id: true, nome: true, email: true } });
  if (!account) throw new AccessError("Conta municipal indisponível.", 403);
  return account;
}

export function portalApiError(error: unknown) {
  const databaseFailure = error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError || error instanceof Prisma.PrismaClientValidationError;
  const message = databaseFailure ? "Não foi possível concluir a operação. Atualize a página e tente novamente." : error instanceof z.ZodError ? error.issues[0]?.message || "Dados inválidos." : error instanceof Error ? error.message : "Não foi possível concluir a operação.";
  return Response.json({ error: message }, { status: error instanceof AccessError ? error.status : databaseFailure ? 500 : 400, headers: { "Cache-Control": "private, no-store" } });
}
