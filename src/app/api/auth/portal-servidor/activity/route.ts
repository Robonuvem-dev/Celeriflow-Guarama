import { db } from "@/db/client";
import { authorizeIdToken } from "@/lib/platform/tenant-context";
import { assertEmployeePortalLogin } from "@/lib/portal-servidor/login-policy";
import { adminAuth } from "@/lib/firebase/server";
import { isSameOriginRequest } from "@/lib/transparencia/request-origin";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { recordEmployeePortalActivity, employeePortalRequestMetadata } from "@/lib/portal-servidor/activity-audit";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/platform/session";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.idToken !== "string") throw new Error("Token inválido.");
    if (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128 || !/[a-z]/.test(body.password) || !/[A-Z]/.test(body.password) || !/\d/.test(body.password) || !/[^a-zA-Z0-9]/.test(body.password)) return Response.json({ error: "Use de 12 a 128 caracteres com letras maiúsculas/minúsculas, número e símbolo." }, { status: 400 });
    const user = await authorizeIdToken(body.idToken);
    const employee = await assertEmployeePortalLogin(db, user);
    if (!checkRateLimit(`portal-password-activity:${user.id}`).allowed) return Response.json({ error: "Indisponível." }, { status: 403 });
    const token = await adminAuth.verifyIdToken(body.idToken, true);
    if (token.uid !== user.firebaseUid || token.firebase.sign_in_provider !== "password" || Date.now() - token.auth_time * 1000 > 5 * 60 * 1000) throw new Error("Reautenticação necessária.");
    await adminAuth.updateUser(token.uid, { password: body.password });
    await adminAuth.revokeRefreshTokens(token.uid);
    await recordEmployeePortalActivity(db, { action: "PASSWORD_CHANGE", userId: user.id, employeeId: employee.id, ...employeePortalRequestMetadata(request) });
    await recordEmployeePortalActivity(db, { action: "LOGOUT", userId: user.id, employeeId: employee.id, ...employeePortalRequestMetadata(request) });
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(SESSION_COOKIE_NAME, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 0, path: "/" });
    return response;
  } catch { return Response.json({ error: "Não foi possível concluir a alteração. Confira a conta ou procure o RH." }, { status: 400 }); }
}
