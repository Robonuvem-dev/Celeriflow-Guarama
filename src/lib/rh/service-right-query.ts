import type { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";

const querySchema = z.object({ scope: z.enum(["DEMONSTRACAO", "HOMOLOGACAO", "PRODUCAO"]).default("PRODUCAO"), contractId: z.string().optional(), periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), page: z.coerce.number().int().min(1).default(1) }).strict();
export async function listServiceRightLedger(db: PrismaClient, employeeId: string, raw: unknown) {
  const input = querySchema.parse(raw);
  const periodStart = input.periodStart ? new Date(`${input.periodStart}T00:00:00.000Z`) : undefined;
  if (periodStart && (!Number.isFinite(periodStart.getTime()) || periodStart.toISOString().slice(0, 10) !== input.periodStart)) throw new Error("Aquisitivo inválido.");
  const where: Prisma.HrRightEntryWhereInput = { contract: { employeeId }, kind: "LICENCA_PREMIO", details: { path: ["scope"], equals: input.scope }, ...(input.contractId ? { contractId: input.contractId } : {}), ...(periodStart ? { periodStart } : {}) };
  const total = await db.hrRightEntry.count({ where });
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
  const [rows, balance] = await Promise.all([
    db.hrRightEntry.findMany({ where, include: { contract: { select: { registration: true } } }, orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }, { id: "asc" }], take: 20, skip: (page - 1) * 20 }),
    db.hrRightEntry.aggregate({ where, _sum: { quantity: true } }),
  ]);
  return { rows, total, page, scope: input.scope, balanceDays: balance._sum.quantity?.toString() ?? "0" };
}
