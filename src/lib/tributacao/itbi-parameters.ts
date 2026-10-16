import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { resolveTaxAssessmentScope, taxScopeSnapshot } from "./scope";

const inputSchema = z.object({
  id: z.string().optional(), code: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(240),
  rate: z.string().refine(value => { try { const rate = new Prisma.Decimal(value); return rate.isFinite() && rate.gt(0) && rate.lte(100) && rate.decimalPlaces() <= 6; } catch { return false; } }, "Alíquota deve ser positiva, até 100%, com até seis casas decimais."),
  requiresDebtClearance: z.boolean(), legalBasis: z.string().trim().min(1).max(4000), expectedUpdatedAt: z.string().nullable(),
});

export async function saveItbiTransactionType(db: PrismaClient, actor: TaxActor, value: z.infer<typeof inputSchema>) {
  const input = inputSchema.parse(value);
  return db.$transaction(async tx => {
    const taxes = await tx.tax.findMany({ where: { name: { equals: "ITBI", mode: "insensitive" }, isActive: true } });
    if (taxes.length !== 1) throw new Error("Concilie um único tributo ITBI ativo.");
    const scope = await resolveTaxAssessmentScope(tx, actor, taxes[0].id);
    if (!scope.budgetUnitId || !scope.governmentEntityId) throw new Error("Configure ente/UG arrecadador do ITBI.");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ITBI_TYPE:${input.id ?? input.code}`},0))::text`;
    const previous = input.id ? await tx.itbiTransactionType.findUniqueOrThrow({ where: { id: input.id } }) : null;
    if ((previous?.updatedAt.toISOString() ?? null) !== input.expectedUpdatedAt) throw new Error("A modalidade foi alterada. Recarregue antes de salvar.");
    if (previous) {
      const origin = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ITBI_TRANSACTION_TYPE", entityId: previous.id, category: "PARAMETER_SCOPE" } });
      const stored = taxScopeSnapshot(origin?.data);
      if (origin && (stored.budgetUnitId !== scope.budgetUnitId || stored.governmentEntityId !== scope.governmentEntityId)) throw new Error("Modalidade pertence a outra origem municipal.");
      if (!origin && actor.allowedBudgetUnitIds) throw new Error("Modalidade legada sem origem conciliada; solicite a conciliação ao administrador.");
    }
    const data = { code: input.code, name: input.name, rate: input.rate, requiresDebtClearance: input.requiresDebtClearance, legalBasis: input.legalBasis };
    const saved = previous ? await tx.itbiTransactionType.update({ where: { id: previous.id }, data }) : await tx.itbiTransactionType.create({ data });
    const origin = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ITBI_TRANSACTION_TYPE", entityId: saved.id, category: "PARAMETER_SCOPE" } });
    if (!origin) await tx.taxRegistryEntry.create({ data: { entityType: "ITBI_TRANSACTION_TYPE", entityId: saved.id, category: "PARAMETER_SCOPE", title: input.name, actorUsuarioId: actor.usuarioId, data: scope } });
    await tx.taxAuditLog.create({ data: { action: "SAVE_ITBI_TRANSACTION_TYPE", entityType: "ItbiTransactionType", entityId: saved.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous ? { code: previous.code, name: previous.name, rate: previous.rate.toString(), requiresDebtClearance: previous.requiresDebtClearance, legalBasis: previous.legalBasis } : null, after: data, ...scope } } });
    return saved;
  });
}
