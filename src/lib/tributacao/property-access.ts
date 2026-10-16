import type { Prisma, PrismaClient } from "@prisma/client";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";

export async function assertPropertyCadastralAccess(db: PrismaClient | Prisma.TransactionClient, actor: TaxActor, propertyId: string) {
  const property = await db.realEstate.findUniqueOrThrow({ where: { id: propertyId } });
  const profile = await db.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: propertyId, category: "PROPERTY_PROFILE" }, orderBy: { version: "desc" } });
  const scope = taxScopeSnapshot(profile?.data);
  if (actor.allowedBudgetUnitIds && (typeof scope.budgetUnitId !== "string" || !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId))) throw new Error("Imóvel fora da origem autorizada ou sem perfil conciliado.");
  if (profile && !await db.planningEntityUnit.findFirst({ where: { governmentEntityId: String(scope.governmentEntityId), budgetUnitId: String(scope.budgetUnitId) } })) throw new Error("Origem imobiliária não conciliada.");
  return { property, profile, scope };
}
