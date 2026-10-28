import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { taxpayers } from "@/db/schema/registry";
import { economicRegistrations, taxAssessments } from "@/db/schema/taxation-core";
import { taxActiveDebts } from "@/db/schema/tax-accounting";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxCertificateEvaluations } from "@/db/schema/tax-final-helpers";
import { auditTaxFinal, latestTaxFinalRegistryEntry, readTaxFinalConfirmedPayments, requireTaxFinalRecord } from "@/db/repositories/tax-final-helpers/records";
import type { CertificateSubject, TaxFinalHelpersActor as TaxActor } from "@/lib/contracts/tax-final-helpers";
import { taxScopeSnapshot } from "./scope";

/** Resolve current municipal partner-type policy without rewriting historical profiles. */
export async function readCertificateSubjects(tx: DatabaseExecutor, actor: TaxActor, taxpayerId: string) {
  const registrations = await tx.select({ id: economicRegistrations.id }).from(economicRegistrations).where(eq(economicRegistrations.taxpayerId, taxpayerId));
  const subjects: CertificateSubject[] = [{ taxpayerId, role: "CONTRIBUINTE", profileId: null, typeCatalogId: null }];
  for (const registration of registrations) {
    subjects.push(...await readRegistrationPartners(tx, actor, registration.id));
  }
  return subjects;
}

/** A license concerns one registration; unrelated registrations cannot broaden its partner checks. */
export async function readEconomicRegistrationSubjects(tx: DatabaseExecutor, actor: TaxActor, registrationId: string) {
  const registration = requireTaxFinalRecord((await tx.select().from(economicRegistrations).where(eq(economicRegistrations.id, registrationId)).limit(1))[0], "Inscrição econômica");
  return [{ taxpayerId: registration.taxpayerId, role: "CONTRIBUINTE", profileId: null, typeCatalogId: null }, ...await readRegistrationPartners(tx, actor, registrationId)];
}

async function readRegistrationPartners(tx: DatabaseExecutor, actor: TaxActor, registrationId: string) {
    const subjects: CertificateSubject[] = [];
    const profile = await latestTaxFinalRegistryEntry(tx, "ECONOMIC_REGISTRATION", registrationId, "ECONOMIC_PROFILE");
    if (!profile) return subjects;
    const data = taxScopeSnapshot(profile.data);
    if (actor.allowedBudgetUnitIds && (typeof data.budgetUnitId !== "string" || !actor.allowedBudgetUnitIds.includes(data.budgetUnitId))) throw new Error("UG fora do acesso autorizado para avaliar a empresa e seus sócios.");
    const definitions = await tx.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "FISCAL_CATALOG"), eq(taxRegistryEntries.category, "TYPED_FISCAL_CATALOG"), data.budgetUnitId === undefined ? undefined : sql`${taxRegistryEntries.data}->'budgetUnitId' = ${JSON.stringify(data.budgetUnitId)}::jsonb`)).orderBy(desc(taxRegistryEntries.version));
    const latest = new Map<string, typeof definitions[number]>();
    for (const definition of definitions) if (!latest.has(definition.entityId)) latest.set(definition.entityId,definition);
    const types = [...latest.values()].filter(definition => { const value = taxScopeSnapshot(definition.data); return value.kind === "TIPO_SOCIO" && value.governmentEntityId === data.governmentEntityId; });
    for (const partner of Array.isArray(data.partners) ? data.partners : []) {
      const value = taxScopeSnapshot(partner);
      if (typeof value.taxpayerId !== "string" || typeof value.role !== "string") throw new Error("Perfil de sócios exige conciliação antes da certidão.");
      const type = types.find(definition => definition.title === value.role);
      if (type && type.status !== "ATIVO") throw new Error("Tipo de sócio desativado: revise o perfil antes da certidão.");
      if (types.length && !type) throw new Error("Tipo de sócio não conciliado para a certidão.");
      if (type ? taxScopeSnapshot(type.data).validatePartnerDebt === true : value.validateDebt === true) subjects.push({ taxpayerId: value.taxpayerId, role: value.role, profileId: profile.id, typeCatalogId: type?.id ?? null });
    }
  return subjects;
}

export async function evaluateCertificateInTransaction(tx: DatabaseTransaction, actor: TaxActor, taxpayerId: string) {
  if (!(await tx.select({ id: taxpayers.id }).from(taxpayers).where(eq(taxpayers.id, taxpayerId)).limit(1)).length) throw new Error("Contribuinte não encontrado.");
  const subjects = await readCertificateSubjects(tx,actor,taxpayerId);
  const ids = [...new Set(subjects.map(subject => subject.taxpayerId))];
  const rows = await tx.select().from(taxAssessments).where(and(inArray(taxAssessments.taxpayerId, ids), notInArray(taxAssessments.status, ["Cancelado", "Pago"])));
  const assessments: { id: string; taxpayerId: string; status: string; balance: string | null }[] = [];
  for (const row of rows) {
    const confirmed = await readTaxFinalConfirmedPayments(tx, row.id);
    if (row.finalValueDecimal === null || confirmed.some(payment => payment.amountPaidDecimal === null)) { assessments.push({ id: row.id, taxpayerId: row.taxpayerId, status: "VALORES_NAO_CONCILIADOS", balance: null }); continue; }
    const payments = confirmed.reduce((total,payment) => total.plus(payment.amountPaidDecimal!),new Decimal(0));
    const credits = await tx.select({ data: taxRegistryEntries.data }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAX_ASSESSMENT"), eq(taxRegistryEntries.entityId, row.id), eq(taxRegistryEntries.category, "CREDIT_MOVEMENT"), eq(taxRegistryEntries.status, "EFETIVADO")));
    const credit = credits.reduce((sum,entry) => { const data=taxScopeSnapshot(entry.data);return data.operation==="COMPENSAR" ? sum.plus(String(data.amount)) : sum; },new Decimal(0));
    const balance = row.finalValueDecimal.minus(payments).minus(credit);
    if (balance.gt(0)) assessments.push({ id: row.id, taxpayerId: row.taxpayerId, status: row.status, balance: balance.toFixed(2) });
  }
  const activeDebts = await tx.select({ id: taxActiveDebts.id, taxpayerId: taxActiveDebts.taxpayerId, cdaNumber: taxActiveDebts.cdaNumber, status: taxActiveDebts.status }).from(taxActiveDebts).where(and(inArray(taxActiveDebts.taxpayerId, ids), notInArray(taxActiveDebts.status, ["Paga", "PAGA", "Cancelada", "CANCELADA", "BAIXADA", "BAIXADA_PRESCRICAO", "DEVOLVIDA"])));
  const pendingCount=assessments.length+activeDebts.length;
  const evaluation = requireTaxFinalRecord((await tx.insert(taxCertificateEvaluations).values({ taxpayerId, result: pendingCount ? "PENDENCIAS_ENCONTRADAS" : "SEM_PENDENCIAS_IDENTIFICADAS", pendingCount, details: { subjects, assessments, activeDebts, scope: "AVALIACAO_INTERNA_SEM_EMISSAO_DE_CERTIDAO" } }).returning())[0]);
  await auditTaxFinal(tx, { action: "EVALUATE", entityType: "TaxCertificateEvaluation", entityId: evaluation.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { taxpayerId, result: evaluation.result, pendingCount, subjects } });
  return evaluation;
}
