import { Decimal } from "@/db/decimal";
import type { DatabaseTransaction } from "@/db/transaction";
import { hasEconomicOrigin, readEconomicRegistration } from "@/db/repositories/tax-economic/registrations";
import { listEconomicCatalogs, readEconomicProfile } from "@/db/repositories/tax-economic/registry";
import { listEconomicActiveDebts, listEconomicCreditMovements, listEconomicDebtAssessments } from "@/db/repositories/tax-economic/debt";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";

export async function assertEconomicTaxpayerDebtFree(tx: DatabaseTransaction, taxpayerId: string, scope: { governmentEntityId: string; budgetUnitId: string }, deferredAssessmentId?: string) {
  if (!await hasEconomicOrigin(tx, scope)) throw new Error("Origem municipal não conciliada para verificar débitos.");
  const assessments = await listEconomicDebtAssessments(tx, taxpayerId, deferredAssessmentId);
  for (const assessment of assessments) {
    const origin = taxScopeSnapshot(assessment.calculationSnapshot);
    if (typeof origin.governmentEntityId !== "string" || typeof origin.budgetUnitId !== "string") throw new Error("Débito sem origem conciliada impede validar ausência de dívida.");
    if (origin.governmentEntityId !== scope.governmentEntityId) continue;
    if (!await hasEconomicOrigin(tx, { governmentEntityId: origin.governmentEntityId, budgetUnitId: origin.budgetUnitId })) throw new Error("Origem do débito diverge do vínculo municipal vigente.");
    if (assessment.finalValueDecimal === null || assessment.guides.some(guide => guide.payments.some(payment => payment.amountPaidDecimal === null))) throw new Error("Débito sem valores Decimal conciliados impede validar ausência de dívida.");
    const paid = assessment.guides.flatMap(guide => guide.payments).reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Decimal(0));
    const movements = await listEconomicCreditMovements(tx, assessment.id);
    const credits = movements.reduce((sum, movement) => { const value = taxScopeSnapshot(movement.data); return value.operation === "COMPENSAR" ? sum.plus(String(value.amount)) : sum; }, new Decimal(0));
    if (assessment.finalValueDecimal.minus(paid).minus(credits).gt(0)) throw new Error("Contribuinte possui débitos impeditivos na validação configurada.");
  }
  const debts = await listEconomicActiveDebts(tx, taxpayerId);
  for (const debt of debts) {
    const origin = taxScopeSnapshot(debt.assessment?.calculationSnapshot);
    const entityId = debt.governmentEntityId ?? origin.governmentEntityId;
    const unitId = debt.budgetUnitId ?? origin.budgetUnitId;
    if (typeof entityId !== "string" || typeof unitId !== "string") throw new Error("Dívida ativa sem origem conciliada impede validar ausência de dívida.");
    if (entityId !== scope.governmentEntityId) continue;
    if ((origin.governmentEntityId && origin.governmentEntityId !== entityId) || (origin.budgetUnitId && origin.budgetUnitId !== unitId) || !await hasEconomicOrigin(tx, { governmentEntityId: entityId, budgetUnitId: unitId })) throw new Error("Dívida ativa e lançamento possuem origens divergentes.");
    throw new Error("Contribuinte possui débitos impeditivos em dívida ativa.");
  }
}

/** Shared by native editing, REDESIM, Simples and typed cadastral forms. */
export async function enforceEconomicProfileDebtPolicy(tx: DatabaseTransaction, actor: TaxActor, registrationId: string) {
  const profile = await readEconomicProfile(tx, registrationId);
  if (!profile) return;
  const data = taxScopeSnapshot(profile.data);
  if (typeof data.governmentEntityId !== "string" || typeof data.budgetUnitId !== "string") throw new Error("Perfil econômico sem origem conciliada.");
  const scope = { governmentEntityId: data.governmentEntityId, budgetUnitId: data.budgetUnitId };
  if (actor.allowedBudgetUnitIds && (typeof data.budgetUnitId !== "string" || !actor.allowedBudgetUnitIds.includes(data.budgetUnitId))) throw new Error("UG fora do acesso autorizado.");
  const registration = await readEconomicRegistration(tx, registrationId);
  const definitions=await listEconomicCatalogs(tx,data.budgetUnitId);
  const latest=new Map<string,typeof definitions[number]>();for(const definition of definitions) if(!latest.has(definition.entityId)) latest.set(definition.entityId,definition);
  const types=[...latest.values()].filter(definition=>definition.status==="ATIVO" && taxScopeSnapshot(definition.data).governmentEntityId===data.governmentEntityId);
  const companyType=types.find(definition=>taxScopeSnapshot(definition.data).kind==="TIPO_EMPRESA" && definition.title===data.companyType);
  const policy=taxScopeSnapshot(companyType?.data);
  if (data.validateCompanyDebt === true || policy.validateCompanyDebt===true) await assertEconomicTaxpayerDebtFree(tx, registration.taxpayerId, scope);
  if ((data.validatePartnerDebts === true || policy.validateCompanyPartnerDebts===true) && Array.isArray(data.partners)) {
    for (const partner of data.partners) {
      const value = taxScopeSnapshot(partner);
      const type=types.find(definition=>taxScopeSnapshot(definition.data).kind==="TIPO_SOCIO" && definition.title===value.role);
      if ((type ? taxScopeSnapshot(type.data).validatePartnerDebt===true : value.validateDebt===true) && typeof value.taxpayerId === "string") await assertEconomicTaxpayerDebtFree(tx, value.taxpayerId, scope);
    }
  }
}
