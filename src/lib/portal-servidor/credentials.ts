import { NotificationDispatcher } from "@/lib/notifications/notification-dispatcher";
import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { portalFirst } from "@/db/repositories/portal-servidor/records";
import { adminAuth } from "@/lib/firebase/server";
import { authorizeIdToken } from "@/lib/platform/tenant-context";
import { assertEmployeePortalLogin } from "./login-policy";
import { recordEmployeePortalActivity } from "./activity-audit";

type RequestTrace = { ip: string; host: string };
type Account = { id: string; firebaseUid: string; email: string; employeeId: string; registration: string | null; rg: string | null; birthDate: Date | null; employeeEmail: string | null };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const normalizeDocument = (value: string) => value.replace(/[^a-z0-9]/gi, "").toUpperCase();
const passwordSchema = z.string().min(12).max(128).refine(value => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^a-zA-Z0-9]/.test(value), "Use ao menos 12 caracteres com letras maiúsculas/minúsculas, número e símbolo.");
const matchingAccount = (identifier: string) => sql`SELECT u.id,u."firebaseUid",u.email,e.id AS "employeeId",e.registration,p.rg,p."birthDate",e.email AS "employeeEmail" FROM "Usuario" u JOIN "Employee" e ON e.id=u."employeeId" LEFT JOIN "Person" p ON p.id=e."personId" WHERE u.ativo=true AND e."isActive"=true AND u."firebaseUid" IS NOT NULL AND ${identifier.includes("@") ? sql`lower(u.email)=${identifier.toLowerCase()}` : sql`regexp_replace(e.cpf,'[^0-9]','','g')=${identifier.replace(/\D/g, "")}`} LIMIT 2`;

export async function loginEmployeeCredentials(raw: unknown, trace: RequestTrace) {
  const input = z.object({ identifier: z.string().trim().min(3).max(254), password: z.string().min(1).max(4096) }).parse(raw);
  return withDatabaseTransaction(databaseConnection, async tx => {
    const records = await tx.execute<Account>(matchingAccount(input.identifier));
    const account = records.rows.length === 1 ? records.rows[0] : null;
    if (!account) {
      await recordEmployeePortalActivity(tx, { action: "LOGIN_FAILURE", ...trace, targetId: digest(input.identifier.toLowerCase()) });
      return { error: "CPF/e-mail, senha ou liberação de acesso inválidos." };
    }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL:LOGIN:${account.id}`}))`);
    const guard = await portalFirst<{ failures: number; locked: boolean; expired: boolean }>(tx, sql`SELECT failures,COALESCE("lockedUntil">now(),false) AS locked,"windowStartedAt"<=now()-interval '15 minutes' AS expired FROM "EmployeePortalLoginGuard" WHERE "userId"=${account.id}`);
    if (guard?.locked) {
      await recordEmployeePortalActivity(tx, { action: "LOGIN_FAILURE", userId: account.id, employeeId: account.employeeId, ...trace });
      return { error: "Acesso temporariamente bloqueado. Aguarde 15 minutos após o bloqueio." };
    }
    let idToken: string;
    try {
      const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      if (!key) throw new Error("Authentication unavailable");
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: account.email, password: input.password, returnSecureToken: true }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok || typeof result.idToken !== "string") throw new Error("Invalid credentials");
      idToken = result.idToken;
      const principal = await adminAuth.verifyIdToken(idToken, true);
      if (principal.uid !== account.firebaseUid || principal.email_verified !== true) throw new Error("Invalid identity");
      const user = await authorizeIdToken(idToken);
      await assertEmployeePortalLogin(tx, user);
    } catch {
      const failures = guard && !guard.expired ? guard.failures + 1 : 1;
      await tx.execute(sql`INSERT INTO "EmployeePortalLoginGuard" ("userId",failures,"windowStartedAt","lockedUntil") VALUES (${account.id},${failures},now(),CASE WHEN ${failures}>=5 THEN now()+interval '15 minutes' ELSE NULL END) ON CONFLICT ("userId") DO UPDATE SET failures=EXCLUDED.failures,"windowStartedAt"=CASE WHEN ${Boolean(guard?.expired)} THEN now() ELSE "EmployeePortalLoginGuard"."windowStartedAt" END,"lockedUntil"=EXCLUDED."lockedUntil"`);
      if (failures >= 5) { NotificationDispatcher.sendPortalServidorAccountLocked({ to: account.email, nome: account.email.split("@")[0] }).catch(err => console.error("[Notification Error] Lock alert failed:", err)); }
      await recordEmployeePortalActivity(tx, { action: "LOGIN_FAILURE", userId: account.id, employeeId: account.employeeId, ...trace });
      return { error: "CPF/e-mail, senha ou liberação de acesso inválidos." };
    }
    await tx.execute(sql`DELETE FROM "EmployeePortalLoginGuard" WHERE "userId"=${account.id}`);
    return { token: await adminAuth.createCustomToken(account.firebaseUid) };
  }, { timeoutMs: 60000 });
}

export async function requestEmployeeAccessLink(raw: unknown) {
  const input = z.object({ purpose: z.enum(["REGISTER", "RESET"]), cpf: z.string().transform(value => value.replace(/\D/g, "")).pipe(z.string().length(11)), email: z.email().transform(value => value.toLowerCase()), registration: z.string().trim().min(1).max(80), birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), rg: z.string().trim().min(1).max(40) }).parse(raw);
  const account = await portalFirst<Account>(databaseConnection.db, matchingAccount(input.cpf));
  if (!account || account.email.toLowerCase() !== input.email || account.employeeEmail?.toLowerCase() !== input.email || account.registration !== input.registration || !account.rg || normalizeDocument(account.rg) !== normalizeDocument(input.rg) || !account.birthDate || account.birthDate.toISOString().slice(0, 10) !== input.birthDate) return;
  const key = process.env.RESEND_API_KEY, from = process.env.EMPLOYEE_PORTAL_EMAIL_FROM || process.env.SST_RESTRICTION_EMAIL_FROM;
  const base = process.env.CELERIFLOW_PUBLIC_BASE_URL;
  if (!key || !from || !z.email().safeParse(from).success || !base) throw new Error("Configure o envio de e-mail do Portal do Servidor.");
  const origin = new URL(base);
  if (origin.protocol !== "https:" && origin.hostname !== "localhost" && origin.hostname !== "127.0.0.1") throw new Error("Origem pública deve usar HTTPS.");
  const token = randomBytes(32).toString("hex"), tokenHash = digest(token);
  const link = new URL("/portal-servidor/recuperar-senha", origin);
  link.searchParams.set("token", token);
  await databaseConnection.db.execute(sql`INSERT INTO "EmployeePortalAccessLink" ("tokenHash","userId",purpose,email,"expiresAt") VALUES (${tokenHash},${account.id},${input.purpose},${input.email},now()+interval '24 hours')`);
    try {
    const nome = account.email.split("@")[0] || "Servidor";
    const sendResult = input.purpose === "REGISTER"
      ? await NotificationDispatcher.sendPortalServidorAccountCreated({ to: account.email, nome, link: link.toString() })
      : await NotificationDispatcher.sendPortalServidorPasswordReset({ to: account.email, nome, link: link.toString() });
    if (!sendResult.success) throw new Error(sendResult.error || "Falha no envio de e-mail");
    await databaseConnection.db.execute(sql`UPDATE "EmployeePortalAccessLink" SET "expiresAt"=now()+interval '24 hours' WHERE "tokenHash"=${tokenHash}`);
  } catch (error) {
    await databaseConnection.db.execute(sql`DELETE FROM "EmployeePortalAccessLink" WHERE "tokenHash"=${tokenHash}`);
    throw error;
  }
}

export async function redeemEmployeeAccessLink(raw: unknown, trace: RequestTrace) {
  const input = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema }).parse(raw);
  const account = await withDatabaseTransaction(databaseConnection, async tx => {
    const hash = digest(input.token);
    const candidate = await portalFirst<{ userId: string }>(tx, sql`SELECT "userId" FROM "EmployeePortalAccessLink" WHERE "tokenHash"=${hash}`);
    if (!candidate) throw new Error("Link expirado ou já utilizado.");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL:ACCESS_LINK:${candidate.userId}`}))`);
    const link = await portalFirst<{ userId: string; email: string }>(tx, sql`SELECT "userId",email FROM "EmployeePortalAccessLink" WHERE "tokenHash"=${hash} AND "consumedAt" IS NULL AND "expiresAt">now() FOR UPDATE`);
    if (!link) throw new Error("Link expirado ou já utilizado.");
    const account = await portalFirst<Account>(tx, sql`SELECT u.id,u."firebaseUid",u.email,e.id AS "employeeId" FROM "Usuario" u JOIN "Employee" e ON e.id=u."employeeId" WHERE u.id=${link.userId} AND u.ativo=true AND e."isActive"=true AND lower(u.email)=${link.email} AND lower(e.email)=${link.email} LIMIT 1`);
    if (!account?.firebaseUid) throw new Error("Conta funcional indisponível.");
    // Claim before the external provider call. An uncertain provider outcome
    // never makes a previously claimed bearer link reusable.
    await tx.execute(sql`UPDATE "EmployeePortalAccessLink" SET "consumedAt"=now() WHERE "userId"=${account.id} AND "consumedAt" IS NULL`);
    return account;
  }, { timeoutMs: 60000 });
  await adminAuth.updateUser(account.firebaseUid, { password: input.password, emailVerified: true });
  await adminAuth.revokeRefreshTokens(account.firebaseUid);
  await databaseConnection.db.execute(sql`DELETE FROM "EmployeePortalLoginGuard" WHERE "userId"=${account.id}`);
  await recordEmployeePortalActivity(databaseConnection.db, { action: "PASSWORD_CHANGE", userId: account.id, employeeId: account.employeeId, ...trace });
}
