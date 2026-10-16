import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanUnusedFunctionalUploads } from "@/lib/portal-servidor/upload-maintenance";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Acesso técnico indisponível." }, { status: secret ? 401 : 503 });
  const actorId = process.env.NOTIFICATION_SYSTEM_ACTOR_USER_ID;
  if (!actorId || !await prisma.usuario.findFirst({ where: { id: actorId, ativo: true }, select: { id: true } })) return NextResponse.json({ error: "Configure um ator técnico ativo." }, { status: 503 });
  return NextResponse.json(await cleanUnusedFunctionalUploads(prisma, actorId), { headers: { "Cache-Control": "no-store" } });
}
