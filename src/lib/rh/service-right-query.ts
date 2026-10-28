import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { hrEmploymentContracts, hrRightEntries } from "@/db/schema/personnel-workforce";
import { z } from "zod";

const querySchema = z.object({ scope: z.enum(["DEMONSTRACAO", "HOMOLOGACAO", "PRODUCAO"]).default("PRODUCAO"), contractId: z.string().optional(), periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), page: z.coerce.number().int().min(1).default(1) }).strict();
export async function listServiceRightLedger(db: DatabaseExecutor, employeeId: string, raw: unknown) {
  const input = querySchema.parse(raw);
  const periodStart = input.periodStart ? new Date(`${input.periodStart}T00:00:00.000Z`) : undefined;
  if (periodStart && (!Number.isFinite(periodStart.getTime()) || periodStart.toISOString().slice(0, 10) !== input.periodStart)) throw new Error("Aquisitivo inválido.");
  const where = and(eq(hrEmploymentContracts.employeeId, employeeId), eq(hrRightEntries.kind, "LICENCA_PREMIO"), sql`${hrRightEntries.details}->>'scope' = ${input.scope}`, input.contractId ? eq(hrRightEntries.contractId, input.contractId) : undefined, periodStart ? eq(hrRightEntries.periodStart, periodStart) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(hrRightEntries).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrRightEntries.contractId)).where(where);
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
  const [rows, balance] = await Promise.all([
    db.select({ entry: hrRightEntries, registration: hrEmploymentContracts.registration }).from(hrRightEntries).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrRightEntries.contractId)).where(where).orderBy(desc(hrRightEntries.periodStart), desc(hrRightEntries.createdAt), asc(hrRightEntries.id)).limit(20).offset((page - 1) * 20),
    db.select({ quantity: sql<string | null>`sum(${hrRightEntries.quantity})::text` }).from(hrRightEntries).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrRightEntries.contractId)).where(where),
  ]);
  return { rows: rows.map(row => ({ ...row.entry, contract: { registration: row.registration } })), total, page, scope: input.scope, balanceDays: new Decimal(balance[0].quantity ?? 0).toString() };
}
