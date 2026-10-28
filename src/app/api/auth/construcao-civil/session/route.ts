import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { findActiveConstructionPortalIdentity } from "@/db/repositories/infrastructure/construction-access";
import { createSession, getIdTokenPrincipal, SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "@/lib/platform/session";
import { checkRateLimit } from "@/lib/platform/rate-limit";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const rate = checkRateLimit(request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown");
  if (!rate.allowed) return NextResponse.json({ error: "Muitas tentativas. Aguarde para tentar novamente." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  try {
    const { idToken } = z.object({ idToken: z.string().min(100) }).parse(await request.json());
    const principal = await getIdTokenPrincipal(idToken);
    if (!principal) return NextResponse.json({ error: "Conta ou e-mail verificado inválido." }, { status: 401 });
    const today = new Date(new Date().toISOString().slice(0,10) + "T00:00:00Z");
    const identity = await findActiveConstructionPortalIdentity(db, principal, today);
    if (!identity) return NextResponse.json({ error: "Conta sem habilitação profissional vigente." }, { status: 403 });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, await createSession(idToken), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: Math.floor(SESSION_DURATION_MS/1000), path: "/" });
    return response;
  } catch { return NextResponse.json({ error: "Não foi possível iniciar a sessão." }, { status: 400 }); }
}
