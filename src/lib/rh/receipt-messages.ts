import { z } from "zod";

const civil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
export const receiptMessagesPolicySchema = z.object({ origin: z.literal("MENSAGENS_RECIBO"), messages: z.array(z.object({ id: z.string().regex(/^[A-Z0-9_-]{1,64}$/), text: z.string().trim().min(1).max(2000), startsAt: civil, endsAt: civil.nullable(), contractIds: z.array(z.string().min(1)), regimeIds: z.array(z.string().min(1)), payrollTypes: z.array(z.string().min(1)) }).strict()).max(100) }).strict().superRefine((policy, ctx) => {
  if (new Set(policy.messages.map(message => message.id)).size !== policy.messages.length) ctx.addIssue({ code: "custom", message: "Mensagem duplicada." });
  for (const message of policy.messages) if (message.endsAt && message.endsAt < message.startsAt) ctx.addIssue({ code: "custom", message: "Vigência da mensagem inválida." });
});
export const receiptMessagesSnapshotSchema = z.array(z.object({ id: z.string(), ruleId: z.string(), text: z.string() }));

export function selectReceiptMessages(raw: unknown, ruleId: string, target: { contractId: string; regimeId: string; payrollType: string; period: { start: Date; end: Date } }) {
  const policy = receiptMessagesPolicySchema.parse(raw);
  const start = target.period.start.toISOString().slice(0, 10); const end = target.period.end.toISOString().slice(0, 10);
  return policy.messages.filter(message => message.startsAt <= end && (!message.endsAt || message.endsAt >= start) && (!message.contractIds.length || message.contractIds.includes(target.contractId)) && (!message.regimeIds.length || message.regimeIds.includes(target.regimeId)) && (!message.payrollTypes.length || message.payrollTypes.includes(target.payrollType))).map(message => ({ id: message.id, ruleId, text: message.text }));
}
