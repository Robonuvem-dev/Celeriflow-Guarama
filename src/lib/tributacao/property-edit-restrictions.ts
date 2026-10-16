import type { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";

const restrictionSchema = z.object({ propertyId: z.string().min(1), governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), expectedVersion: z.number().int().nonnegative(), enabled: z.boolean(), reason: z.string().trim().min(1).max(4000) });
const approvalSchema = z.object({ propertyId: z.string().min(1), expectedUpdatedAt: z.string().datetime(), operatorId: z.string().min(1), validMinutes: z.number().int().min(1).max(1440), reason: z.string().trim().min(1).max(4000) });

async function scope(tx: Prisma.TransactionClient, actor: TaxActor, governmentEntityId: string, budgetUnitId: string) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await tx.planningEntityUnit.findFirst({ where: { governmentEntityId, budgetUnitId } })) throw new Error("Ente/UG não conciliados.");
}

/** The authenticated action verifies the supervisor profile before calling this service. */
export async function publishPropertyEditRestriction(db: PrismaClient, actor: TaxActor, raw: z.input<typeof restrictionSchema>) {
  const input = restrictionSchema.parse(raw);
  return db.$transaction(async tx => {
    await scope(tx, actor, input.governmentEntityId, input.budgetUnitId);
    await tx.$queryRaw`SELECT id FROM "RealEstate" WHERE id=${input.propertyId} FOR UPDATE`;
    await tx.realEstate.findUniqueOrThrow({ where: { id: input.propertyId } });
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: input.propertyId, category: "PROPERTY_EDIT_RESTRICTION" }, orderBy: { version: "desc" } });
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("Restrição alterada. Recarregue antes de publicar.");
    if (previous) { const data = taxScopeSnapshot(previous.data); if (data.governmentEntityId !== input.governmentEntityId || data.budgetUnitId !== input.budgetUnitId) throw new Error("Origem da restrição diverge; concilie com o supervisor da UG."); }
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "REAL_ESTATE", entityId: input.propertyId, category: "PROPERTY_EDIT_RESTRICTION", title: "Bloqueio de edição imobiliária", version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: input } });
    await tx.taxAuditLog.create({ data: { action: "PUBLISH_PROPERTY_EDIT_RESTRICTION", entityType: "RealEstate", entityId: input.propertyId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...input, previousId: previous?.id ?? null, restrictionId: entry.id } } });
    return entry;
  });
}

export async function approvePropertyEdit(db: PrismaClient, actor: TaxActor, raw: z.input<typeof approvalSchema>) {
  const input = approvalSchema.parse(raw);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "RealEstate" WHERE id=${input.propertyId} FOR UPDATE`;
    const property = await tx.realEstate.findUniqueOrThrow({ where: { id: input.propertyId } });
    if (property.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error("Imóvel alterado. Recarregue antes de autorizar.");
    const restrictions = await tx.$queryRaw<{ id: string; governmentEntityId: string; budgetUnitId: string }[]>`SELECT * FROM property_effective_edit_restriction(${property.id})`;
    const restriction = restrictions[0];
    const data = restriction;
    if (!restriction || typeof data.governmentEntityId !== "string" || typeof data.budgetUnitId !== "string") throw new Error("O imóvel não possui bloqueio ativo conciliado.");
    await scope(tx, actor, data.governmentEntityId, data.budgetUnitId);
    if (!await tx.usuario.findFirst({ where: { id: input.operatorId, ativo: true, perfil: { ativo: true } }, select: { id: true } })) throw new Error("Operador ativo não encontrado.");
    const expiresAt = new Date(Date.now() + input.validMinutes * 60000).toISOString();
    const approval = await tx.taxRegistryEntry.create({ data: { entityType: "REAL_ESTATE", entityId: property.id, category: "PROPERTY_EDIT_APPROVAL", title: "Liberação pontual pelo supervisor", status: "DISPONIVEL", actorUsuarioId: actor.usuarioId, data: { ...input, restrictionId: restriction.id, expiresAt, governmentEntityId: data.governmentEntityId, budgetUnitId: data.budgetUnitId } } });
    await tx.taxAuditLog.create({ data: { action: "APPROVE_PROPERTY_EDIT", entityType: "RealEstate", entityId: property.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { approvalId: approval.id, ...input, expiresAt } } });
    return approval;
  });
}
