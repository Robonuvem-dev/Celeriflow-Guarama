import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/platform/session";
import { getOptionalTenantContext, authorizeIdToken } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { db } from "@/db/client";
import { recordEmployeePortalActivity, employeePortalRequestMetadata } from "@/lib/portal-servidor/activity-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const context = await getOptionalTenantContext();
  if (context) {
    if (context.user.employeeId) await recordEmployeePortalActivity(context.database ?? db, { action: "LOGOUT", userId: context.user.id, employeeId: context.user.employeeId, ...employeePortalRequestMetadata(request) });
    else await insertAuditEvent(context.database ?? db, {
      actorUsuarioId: context.user.id,
      eventType: auditEventTypes.sessionLogout,
      targetType: "SESSION",
      targetId: context.user.id,
    });
  } else {
    const token = request.headers.get("authorization");
    if (token?.startsWith("Bearer ")) {
      const user = await authorizeIdToken(token.slice(7)).catch(() => null);
      if (user?.employeeId) await recordEmployeePortalActivity(db, { action: "LOGOUT", userId: user.id, employeeId: user.employeeId, ...employeePortalRequestMetadata(request) });
    }
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
