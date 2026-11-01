import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema/identity";
import { employees } from "@/db/schema/administration";
import { adminAuth } from "@/lib/firebase/server";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { isSameOriginRequest } from "@/lib/transparencia/request-origin";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const limit = checkRateLimit(`cpf-login:${request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown"}`);
  if (!limit.allowed) return Response.json({ error: "Muitas tentativas. Tente novamente mais tarde." }, { status: 429 });
  try {
    const { cpf, password } = z.object({ cpf: z.string().transform(value => value.replace(/\D/g, "")).pipe(z.string().length(11)), password: z.string().min(1).max(4096) }).parse(await request.json());
    const matches = await db.select({ email: users.email, firebaseUid: users.firebaseUid }).from(users)
      .innerJoin(employees, eq(users.employeeId, employees.id))
      .where(and(eq(users.ativo, true), eq(employees.isActive, true), sql`regexp_replace(${employees.cpf}, '[^0-9]', '', 'g') = ${cpf}`)).limit(2);
    const user = matches.length === 1 ? matches[0] : null;
    if (!user?.firebaseUid || !process.env.NEXT_PUBLIC_FIREBASE_API_KEY) throw new Error("Invalid credential");
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(process.env.NEXT_PUBLIC_FIREBASE_API_KEY)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ email: user.email, password, returnSecureToken: true }),
    });
    const result = await response.json();
    if (!response.ok || typeof result.idToken !== "string") throw new Error("Invalid credential");
    const principal = await adminAuth.verifyIdToken(result.idToken, true);
    if (principal.uid !== user.firebaseUid || principal.email_verified !== true) throw new Error("Invalid credential");
    return Response.json({ token: await adminAuth.createCustomToken(principal.uid) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Não foi possível entrar. Confira as credenciais e a liberação do acesso." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
}
