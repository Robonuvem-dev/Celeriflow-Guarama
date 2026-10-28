import { NextRequest, NextResponse } from "next/server";
import { db, databaseConnection } from "@/db/client";
import { sql } from "drizzle-orm";
import { portalFirst } from "@/db/repositories/portal-servidor/records";
import { cleanUnusedFunctionalUploads } from "@/lib/portal-servidor/upload-maintenance";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Acesso técnico indisponível." }, { status: secret ? 401 : 503 });
  const actorId = process.env.NOTIFICATION_SYSTEM_ACTOR_USER_ID;
  if (!actorId || !await portalFirst<{ id: string }>(db, sql`SELECT id FROM "Usuario" WHERE id=${actorId} AND ativo LIMIT 1`)) return NextResponse.json({ error: "Configure um ator técnico ativo." }, { status: 503 });
  return NextResponse.json(await cleanUnusedFunctionalUploads(databaseConnection, actorId), { headers: { "Cache-Control": "no-store" } });
}
