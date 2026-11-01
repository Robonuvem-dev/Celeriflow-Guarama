"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { adminAuth } from "@/lib/firebase/server";
import { getCurrentTenantContext } from "@/lib/platform/tenant-context";
import { isSystemAdministratorEmail } from "@/lib/administration/c3-policy";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { users } from "@/db/schema/identity";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
import { checkRateLimit } from "@/lib/platform/rate-limit";

export async function changeOwnEmail(email: string, reauthenticationToken: string) {
  try {
    const context = await getCurrentTenantContext();
    if (isSystemAdministratorEmail(context.user.email)) return { error: "O e-mail da conta técnica é gerenciado pela configuração do sistema." };
    if (!checkRateLimit(`account-email:${context.user.id}`).allowed) return { error: "Aguarde antes de tentar novamente." };
    const nextEmail = z.string().trim().toLowerCase().email().parse(email);
    if (isSystemAdministratorEmail(nextEmail) || nextEmail === context.user.email) return { error: "Informe um novo e-mail pessoal válido." };
    const token = await adminAuth.verifyIdToken(reauthenticationToken, true);
    if (token.uid !== context.user.firebaseUid || token.email_verified !== true || token.firebase?.sign_in_provider !== "password" || Date.now() - token.auth_time * 1000 > 5 * 60 * 1000) return { error: "Confirme sua senha atual novamente." };
    const previous = await adminAuth.getUser(token.uid);
    await adminAuth.updateUser(token.uid, { email: nextEmail, emailVerified: false });
    try {
      await withDatabaseTransaction(databaseConnection, async tx => {
        await tx.update(users).set({ email: nextEmail }).where(eq(users.id, context.user.id));
        await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "USUARIO", targetId: context.user.id });
      });
    } catch (error) {
      await adminAuth.updateUser(token.uid, { email: previous.email, emailVerified: previous.emailVerified });
      throw error;
    }
    await adminAuth.revokeRefreshTokens(token.uid);
    return { error: null };
  } catch { return { error: "Não foi possível alterar o e-mail. Confira a conta e tente novamente." }; }
}
