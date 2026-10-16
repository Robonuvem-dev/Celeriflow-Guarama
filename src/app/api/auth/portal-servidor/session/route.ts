import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "@/lib/platform/session";
import { AccessError, authorizeIdToken } from "@/lib/platform/tenant-context";
import { assertEmployeePortalLogin } from "@/lib/portal-servidor/login-policy";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  const rate = checkRateLimit(`employee-session:${ip}`);
  if (!rate.allowed) return NextResponse.json({ error: "Muitas tentativas. Aguarde para tentar novamente." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  try {
    const { idToken } = z.object({ idToken: z.string().min(100) }).strict().parse(await request.json());
    const user = await authorizeIdToken(idToken);
    const employee = await assertEmployeePortalLogin(prisma, user);
    const session = await createSession(idToken);
    await writeAuditEvent(prisma, { actorUsuarioId: user.id, eventType: auditEventTypes.sessionLogin, targetType: "EMPLOYEE_PORTAL_SESSION", targetId: employee.id });
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
    response.cookies.set(SESSION_COOKIE_NAME, session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: Math.floor(SESSION_DURATION_MS / 1000), path: "/" });
    return response;
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Confira os dados de autenticação." }, { status: 400 });
    console.error("Falha no acesso funcional", error);
    return NextResponse.json({ error: "Não foi possível iniciar a sessão funcional." }, { status: 500 });
  }
}
