import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
export type RestrictionEmail = { to: string; subject: string; text: string; idempotencyKey: string };
export type RestrictionEmailSender = (message: RestrictionEmail) => Promise<{ receipt: string }>;
export class RestrictionEmailConfigurationError extends Error {}
export function restrictionCronAuthorized(authorization: string | null, secret: string | undefined) {
  if (!secret || secret.length < 32 || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(authorization);
  return actual.length === expected.length && timingSafeEqual(actual,expected);
}
/** Real HTTP provider, without a new SDK dependency. Receipt means provider acceptance, not inbox delivery. */
export function configuredRestrictionEmailSender(env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): RestrictionEmailSender {
  const provider = env.SST_RESTRICTION_EMAIL_PROVIDER, key = env.RESEND_API_KEY, from = env.SST_RESTRICTION_EMAIL_FROM;
  if (provider !== "RESEND" || !key || !from || !z.email().safeParse(from).success) throw new RestrictionEmailConfigurationError("Configure SST_RESTRICTION_EMAIL_PROVIDER=RESEND, RESEND_API_KEY e SST_RESTRICTION_EMAIL_FROM (domínio verificado).");
  return async message => {
    if (!z.email().safeParse(message.to).success) throw new Error("Destinatário inválido.");
    const response = await fetcher("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type":"application/json", "Idempotency-Key": `sst-restriction/${message.idempotencyKey}` }, body: JSON.stringify({ from, to:[message.to], subject:message.subject, text:message.text }), signal: AbortSignal.timeout(15000), redirect: "error" });
    if (!response.ok) throw new Error("Provedor recusou ou não confirmou o envio.");
    const result = z.object({ id: z.string().min(1).max(200) }).parse(await response.json());
    return { receipt: result.id };
  };
}
