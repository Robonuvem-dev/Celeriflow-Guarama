import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxAssessmentCompensatedValue, taxScopeSnapshot } from "./scope";
import { assertEconomicTaxpayerDebtFree } from "./economic-debt-policy";
import { readEconomicRegistrationSubjects } from "./certificate-subjects";

export const licensePolicySchema = z.object({
  policyId: z.string().optional(), expectedVersion: z.number().int().nonnegative(), governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1),
  year: z.number().int().min(1900).max(2200), code: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(160), active: z.boolean(),
  validityDays: z.number().int().min(1).max(3650), requireDebtClearance: z.boolean(), includePartnerDebts: z.boolean(),
  requireFeePayment: z.boolean(), allowExempt: z.boolean(), paymentGraceUntil: z.iso.date().nullable(),
  feeTaxId: z.string().min(1).nullable(),
  allowPortalIssue: z.boolean().default(false),
  blockedCompanyTypes: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  blockedCnaes: z.array(z.string().regex(/^\d{7}$/)).max(500).default([]),
  blockingMessage: z.string().trim().min(1).max(2000).default("Cadastro econômico com restrição para este tipo de alvará."),
  layoutTitle: z.string().trim().min(1).max(240), layoutText: z.string().trim().min(1).max(12000), legalBasis: z.string().trim().min(1).max(4000),
}).refine(input => !input.requireFeePayment || input.feeTaxId !== null, "Configure o tributo da taxa de alvará.");

async function authorize(tx: Prisma.TransactionClient, actor: TaxActor, scope: { governmentEntityId: string; budgetUnitId: string }) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await tx.planningEntityUnit.findFirst({ where: scope })) throw new Error("Ente/UG não conciliados.");
}

export async function publishLicensePolicy(db: PrismaClient, actor: TaxActor, raw: z.input<typeof licensePolicySchema>) {
  const input = licensePolicySchema.parse(raw);
  return db.$transaction(async tx => {
    await authorize(tx, actor, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId });
    if (input.feeTaxId && !await tx.tax.findFirst({ where: { id: input.feeTaxId, isActive: true } })) throw new Error("Selecione um tributo ativo para a taxa de alvará.");
    const key = `${input.budgetUnitId}:${input.year}:${input.code}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`LICENSE_POLICY:${key}`},0))::text`;
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "LICENSE_POLICY", category: "LICENSE_POLICY", title: key }, orderBy: { version: "desc" } });
    if ((previous?.version ?? 0) !== input.expectedVersion || input.policyId && previous?.entityId !== input.policyId) throw new Error("Configuração alterada. Recarregue antes de publicar.");
    if (input.policyId && !previous) throw new Error("Tipo/ano/origem não podem ser alterados; inclua outra configuração anual.");
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "LICENSE_POLICY", entityId: previous?.entityId ?? randomUUID(), category: "LICENSE_POLICY", title: key, version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: { ...input, previousId: previous?.id ?? null } } });
    await tx.taxAuditLog.create({ data: { action: "PUBLISH_LICENSE_POLICY", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { policyId: entry.entityId, version: entry.version, legalBasis: input.legalBasis } } });
    return entry;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export const configuredLicenseSchema = z.object({ policyId: z.string().min(1), expectedPolicyVersion: z.number().int().positive(), registrationId: z.string().min(1), expectedRegistrationUpdatedAt: z.iso.datetime(), processId: z.string().nullable(), feeAssessmentId: z.string().nullable(), exempt: z.boolean(), exemptionReason: z.string().trim().max(4000), reason: z.string().trim().min(1).max(4000) });

export async function issueConfiguredLicenseInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, raw: z.input<typeof configuredLicenseSchema>) {
  const input = configuredLicenseSchema.parse(raw);
  const definition = await tx.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "LICENSE_POLICY", entityId: input.policyId, category: "LICENSE_POLICY" }, orderBy: { version: "desc" } });
  const policy = licensePolicySchema.parse(definition.data);
  await authorize(tx, actor, { governmentEntityId: policy.governmentEntityId, budgetUnitId: policy.budgetUnitId });
  if (definition.version !== input.expectedPolicyVersion || !policy.active) throw new Error("Configuração anual alterada ou inativa. Recarregue antes de emitir.");
  const now = new Date();
  if (policy.year !== now.getUTCFullYear()) throw new Error("Selecione a configuração do exercício atual para emitir o alvará.");
  await tx.$queryRaw`SELECT id FROM "EconomicRegistration" WHERE id=${input.registrationId} FOR UPDATE`;
  const registration = await tx.economicRegistration.findUniqueOrThrow({ where: { id: input.registrationId }, include: { taxpayer: { include: { person: true, company: true } } } });
  if (registration.updatedAt.toISOString() !== input.expectedRegistrationUpdatedAt) throw new Error("Cadastro econômico alterado. Recarregue antes de emitir.");
  if (registration.status !== "Ativo" || registration.taxpayer.status !== "Ativo") throw new Error("O cadastro econômico e o contribuinte devem estar ativos.");
  const profile = await tx.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "ECONOMIC_REGISTRATION", entityId: registration.id, category: "ECONOMIC_PROFILE" }, orderBy: { version: "desc" } });
  const profileData = taxScopeSnapshot(profile.data);
  if (profileData.governmentEntityId !== policy.governmentEntityId || profileData.budgetUnitId !== policy.budgetUnitId) throw new Error("Alvará e empresa pertencem a origens diferentes.");
  if (typeof profileData.provisionalUntil === "string" && profileData.provisionalUntil < now.toISOString().slice(0,10)) throw new Error("Cadastro provisório vencido.");
  const cnaes = [profileData.primaryCnae, ...(Array.isArray(profileData.secondaryCnaes) ? profileData.secondaryCnaes : [])];
  if (policy.blockedCompanyTypes.includes(String(profileData.companyType)) || cnaes.some(code => typeof code === "string" && policy.blockedCnaes.includes(code))) throw new Error(policy.blockingMessage);
  if (input.processId && !await tx.process.findUnique({ where: { id: input.processId } })) throw new Error("Protocolo não encontrado.");
  const duplicate = await tx.taxRegistryEntry.findFirst({ where: { entityType: "LICENSE", category: "LICENSE_ISSUANCE", AND: [{ data: { path: ["registrationId"], equals: registration.id } }, { data: { path: ["policyId"], equals: definition.entityId } }] }, orderBy: { createdAt: "desc" } });
  if (duplicate) {
    const license = await tx.license.findUniqueOrThrow({ where: { id: duplicate.entityId } });
    if (license.status !== "Cancelado") throw new Error("Já existe alvará deste tipo/ano para a inscrição. Cancele a emissão anterior antes de substituir.");
  }
  const subjects = policy.includePartnerDebts ? await readEconomicRegistrationSubjects(tx, actor, registration.id) : [];
  if (input.exempt && (!policy.allowExempt || !input.exemptionReason)) throw new Error("Isenção exige permissão do tipo e fundamento explícito.");
  let fee: { assessmentId: string; amount: string; paid: string; compensated: string } | null = null;
  if (input.feeAssessmentId) {
    const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: input.feeAssessmentId }, include: { guides: { include: { payments: { where: { status: "Confirmado" } } } } } });
    const origin = taxScopeSnapshot(assessment.calculationSnapshot);
    if (assessment.taxId !== policy.feeTaxId || assessment.taxpayerId !== registration.taxpayerId || assessment.economicRegistrationId !== registration.id || assessment.year !== policy.year || origin.governmentEntityId !== policy.governmentEntityId || origin.budgetUnitId !== policy.budgetUnitId || ["Cancelado", "Suspenso", "Extinto"].includes(assessment.status) || assessment.finalValueDecimal === null) throw new Error("A taxa informada não pertence à inscrição, tributo, exercício e origem do alvará ou não está conciliada.");
    if (assessment.guides.some(guide => guide.payments.some(payment => payment.amountPaidDecimal === null))) throw new Error("Pagamento da taxa sem valor Decimal conciliado.");
    const paid = assessment.guides.flatMap(guide => guide.payments).reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Prisma.Decimal(0));
    const compensated = await taxAssessmentCompensatedValue(tx, assessment.id);
    fee = { assessmentId: assessment.id, amount: assessment.finalValueDecimal.toFixed(2), paid: paid.toFixed(2), compensated: compensated.toFixed(2) };
  }
  const grace = policy.paymentGraceUntil !== null && policy.paymentGraceUntil >= now.toISOString().slice(0,10);
  const deferredFeeId = policy.requireFeePayment && !input.exempt && grace ? fee?.assessmentId : undefined;
   const debtScope = { governmentEntityId: policy.governmentEntityId, budgetUnitId: policy.budgetUnitId };
   if (policy.requireDebtClearance) await assertEconomicTaxpayerDebtFree(tx, registration.taxpayerId, debtScope, deferredFeeId);
   for (const taxpayerId of new Set(subjects.map(subject => subject.taxpayerId))) await assertEconomicTaxpayerDebtFree(tx, taxpayerId, debtScope, taxpayerId === registration.taxpayerId ? deferredFeeId : undefined);
  const feeSettled = fee !== null && new Prisma.Decimal(fee.paid).plus(fee.compensated).gte(fee.amount);
  if (policy.requireFeePayment && !input.exempt && !grace && !feeSettled) throw new Error("Concilie o pagamento integral da taxa antes de emitir o alvará.");
  const validUntil = new Date(now); validUntil.setUTCDate(validUntil.getUTCDate() + policy.validityDays - 1); validUntil.setUTCHours(23,59,59,999);
  if (policy.requireFeePayment && !input.exempt && grace && !feeSettled) {
    const graceEnd = new Date(`${policy.paymentGraceUntil}T23:59:59.999Z`); if (graceEnd < validUntil) validUntil.setTime(graceEnd.valueOf());
  }
  const authCode = randomUUID();
  const license = await tx.license.create({ data: { licenseType: policy.name, taxpayerId: registration.taxpayerId, economicRegistrationId: registration.id, issueDate: now, validUntil, qrCode: authCode, status: "Emitido" } });
  await tx.taxRegistryEntry.create({ data: { entityType: "LICENSE", entityId: license.id, category: "LICENSE_ISSUANCE", title: `${policy.year} · ${policy.name} · ${registration.municipalInsc}`, actorUsuarioId: actor.usuarioId, processId: input.processId, data: { policyId: definition.entityId, policyVersionId: definition.id, policyVersion: definition.version, governmentEntityId: policy.governmentEntityId, budgetUnitId: policy.budgetUnitId, year: policy.year, registrationId: registration.id, inscription: registration.municipalInsc, profileId: profile.id, taxpayerName: registration.taxpayer.company?.corporateName ?? registration.taxpayer.person?.fullName ?? registration.taxpayerId, profile: profile.data, layoutTitle: policy.layoutTitle, layoutText: policy.layoutText, legalBasis: policy.legalBasis, subjects, fee, exempt: input.exempt, exemptionReason: input.exemptionReason, reason: input.reason, authCode, issuedAt: now.toISOString(), validUntil: validUntil.toISOString() } } });
  await tx.taxAuditLog.create({ data: { action: "ISSUE_CONFIGURED_LICENSE", entityType: "License", entityId: license.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { policyVersionId: definition.id, registrationId: registration.id, processId: input.processId } } });
  return license;
}

export async function issueConfiguredLicenses(db: PrismaClient, actor: TaxActor, inputs: z.input<typeof configuredLicenseSchema>[]) {
  if (!inputs.length || inputs.length > 1000 || new Set(inputs.map(input => `${input.policyId}:${input.registrationId}`)).size !== inputs.length) throw new Error("Selecione de 1 a 1.000 inscrições distintas por tipo de alvará.");
  return db.$transaction(async tx => {
    const licenses = [];
    for (const input of [...inputs].sort((a,b) => a.registrationId.localeCompare(b.registrationId))) licenses.push(await issueConfiguredLicenseInTransaction(tx, actor, input));
    return licenses;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
}
