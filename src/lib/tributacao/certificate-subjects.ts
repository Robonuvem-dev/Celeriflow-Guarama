import { Prisma } from "@prisma/client";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";

/** Resolve current municipal partner-type policy without rewriting historical profiles. */
export async function readCertificateSubjects(tx: Prisma.TransactionClient, actor: TaxActor, taxpayerId: string) {
  const registrations = await tx.economicRegistration.findMany({ where: { taxpayerId }, select: { id: true } });
  const subjects: { taxpayerId: string; role: string; profileId: string | null; typeCatalogId: string | null }[] = [{ taxpayerId, role: "CONTRIBUINTE", profileId: null, typeCatalogId: null }];
  for (const registration of registrations) {
    subjects.push(...await readRegistrationPartners(tx, actor, registration.id));
  }
  return subjects;
}

/** A license concerns one registration; unrelated registrations cannot broaden its partner checks. */
export async function readEconomicRegistrationSubjects(tx: Prisma.TransactionClient, actor: TaxActor, registrationId: string) {
  const registration = await tx.economicRegistration.findUniqueOrThrow({ where: { id: registrationId } });
  return [{ taxpayerId: registration.taxpayerId, role: "CONTRIBUINTE", profileId: null, typeCatalogId: null }, ...await readRegistrationPartners(tx, actor, registrationId)];
}

async function readRegistrationPartners(tx: Prisma.TransactionClient, actor: TaxActor, registrationId: string) {
    const subjects: { taxpayerId: string; role: string; profileId: string | null; typeCatalogId: string | null }[] = [];
    const profile = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ECONOMIC_REGISTRATION", entityId: registrationId, category: "ECONOMIC_PROFILE" }, orderBy: { version: "desc" } });
    if (!profile) return subjects;
    const data = taxScopeSnapshot(profile.data);
    if (actor.allowedBudgetUnitIds && (typeof data.budgetUnitId !== "string" || !actor.allowedBudgetUnitIds.includes(data.budgetUnitId))) throw new Error("UG fora do acesso autorizado para avaliar a empresa e seus sócios.");
    const definitions = await tx.taxRegistryEntry.findMany({ where: { entityType: "FISCAL_CATALOG", category: "TYPED_FISCAL_CATALOG", data: { path: ["budgetUnitId"], equals: data.budgetUnitId as string } }, orderBy: { version: "desc" } });
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

export async function evaluateCertificateInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, taxpayerId: string) {
  if (!await tx.taxpayer.findUnique({ where: { id: taxpayerId }, select: { id: true } })) throw new Error("Contribuinte não encontrado.");
  const subjects = await readCertificateSubjects(tx,actor,taxpayerId);
  const ids = [...new Set(subjects.map(subject => subject.taxpayerId))];
  const rows = await tx.taxAssessment.findMany({ where: { taxpayerId: { in: ids }, status: { notIn: ["Cancelado", "Pago"] } }, include: { guides: { include: { payments: { where: { status: "Confirmado" } } } } } });
  const assessments: { id: string; taxpayerId: string; status: string; balance: string | null }[] = [];
  for (const row of rows) {
    if (row.finalValueDecimal === null || row.guides.some(guide => guide.payments.some(payment => payment.amountPaidDecimal === null))) { assessments.push({ id: row.id, taxpayerId: row.taxpayerId, status: "VALORES_NAO_CONCILIADOS", balance: null }); continue; }
    const payments = row.guides.flatMap(guide => guide.payments).reduce((total,payment) => total.plus(payment.amountPaidDecimal!),new Prisma.Decimal(0));
    const credits = await tx.taxRegistryEntry.findMany({ where: { entityType: "TAX_ASSESSMENT", entityId: row.id, category: "CREDIT_MOVEMENT", status: "EFETIVADO" }, select: { data: true } });
    const credit = credits.reduce((sum,entry) => { const data=taxScopeSnapshot(entry.data);return data.operation==="COMPENSAR" ? sum.plus(String(data.amount)) : sum; },new Prisma.Decimal(0));
    const balance = row.finalValueDecimal.minus(payments).minus(credit);
    if (balance.gt(0)) assessments.push({ id: row.id, taxpayerId: row.taxpayerId, status: row.status, balance: balance.toFixed(2) });
  }
  const activeDebts = await tx.activeDebt.findMany({ where: { taxpayerId: { in: ids }, status: { notIn: ["Paga", "PAGA", "Cancelada", "CANCELADA", "BAIXADA", "BAIXADA_PRESCRICAO", "DEVOLVIDA"] } }, select: { id: true, taxpayerId: true, cdaNumber: true, status: true } });
  const pendingCount=assessments.length+activeDebts.length;
  const evaluation = await tx.taxCertificateEvaluation.create({ data: { taxpayerId, result: pendingCount ? "PENDENCIAS_ENCONTRADAS" : "SEM_PENDENCIAS_IDENTIFICADAS", pendingCount, details: { subjects, assessments, activeDebts, scope: "AVALIACAO_INTERNA_SEM_EMISSAO_DE_CERTIDAO" } } });
  await tx.taxAuditLog.create({ data: { action: "EVALUATE", entityType: "TaxCertificateEvaluation", entityId: evaluation.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { taxpayerId, result: evaluation.result, pendingCount, subjects } } });
  return evaluation;
}
