import type { DatabaseExecutor } from "@/db/transaction";
import { readProperty, readLatestPropertyProfile, propertyOriginExists } from "@/db/repositories/tax-property/records";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";

export async function assertPropertyCadastralAccess(db: DatabaseExecutor, actor: TaxActor, propertyId: string) {
  const property = await readProperty(db, propertyId);
  const profile = await readLatestPropertyProfile(db, propertyId);
  const scope = taxScopeSnapshot(profile?.data);
  if (actor.allowedBudgetUnitIds && (typeof scope.budgetUnitId !== "string" || !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId))) throw new Error("Imóvel fora da origem autorizada ou sem perfil conciliado.");
  if (profile && !await propertyOriginExists(db, String(scope.governmentEntityId), String(scope.budgetUnitId))) throw new Error("Origem imobiliária não conciliada.");
  return { property, profile, scope };
}
