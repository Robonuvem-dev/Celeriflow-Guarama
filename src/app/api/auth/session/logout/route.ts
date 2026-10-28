import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/platform/session";
import { getOptionalTenantContext } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { db } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const context = await getOptionalTenantContext();
  if (context) {
    await insertAuditEvent(context.database ?? db, {
      actorUsuarioId: context.user.id,
      eventType: auditEventTypes.sessionLogout,
      targetType: "SESSION",
      targetId: context.user.id,
    });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
