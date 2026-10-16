import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxAssessmentCompensatedValue, taxScopeSnapshot } from "./scope";

export async function readAnnualTaxSummary(db: PrismaClient, actor: TaxActor, raw: { governmentEntityId: string; budgetUnitId: string; year: number; taxId: string | null; kind: "PROPERTY" | "ECONOMIC" | "ALL" }) {
  const input = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), year: z.number().int().min(1900).max(2200), taxId: z.string().nullable(), kind: z.enum(["PROPERTY", "ECONOMIC", "ALL"]) }).parse(raw);
  return db.$transaction(async tx => {
    if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
    const unit = await tx.planningEntityUnit.findFirstOrThrow({ where: { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId }, include: { governmentEntity: true, budgetUnit: true } });
    const assessments = await tx.taxAssessment.findMany({ where: { year: input.year, ...(input.taxId ? { taxId: input.taxId } : {}), ...(input.kind === "PROPERTY" ? { realEstateId: { not: null } } : input.kind === "ECONOMIC" ? { economicRegistrationId: { not: null } } : {}), AND: [{ calculationSnapshot: { path: ["governmentEntityId"], equals: input.governmentEntityId } }, { calculationSnapshot: { path: ["budgetUnitId"], equals: input.budgetUnitId } }] }, include: { tax: { select: { name: true } }, guides: true } });
    const ids = assessments.map(row => row.id);
    const payments = await tx.taxPayment.findMany({ where: { guide: { assessmentId: { in: ids } }, status: "Confirmado" }, include: { guide: { select: { assessmentId: true } } } });
    const benefitEvents = await tx.taxRegistryEntry.findMany({ where: { entityType: "TAX_ASSESSMENT", entityId: { in: ids }, category: "CREDIT_EVENT", status: "ATIVO", source: "BENEFICIO" } });
    const benefitIds = benefitEvents.flatMap(row => { const id = taxScopeSnapshot(row.data).grantId; return typeof id === "string" ? [id] : []; });
    const benefits = await tx.taxBenefitGrant.findMany({ where: { id: { in: benefitIds }, status: "CONCEDIDO" }, include: { rule: true } });
    const classificationEntries = await tx.taxRegistryEntry.findMany({ where: { entityType: "TAX_BENEFIT_RULE", entityId: { in: benefits.map(row => row.ruleId) }, category: "BENEFIT_REPORT_CLASSIFICATION" }, orderBy: { version: "desc" } });
    const classifications = new Map<string, string>(); for (const row of classificationEntries) if (!classifications.has(row.entityId)) classifications.set(row.entityId, String(taxScopeSnapshot(row.data).classification));
    type Bucket = { taxId: string; name: string; assessed: Prisma.Decimal; net: Prisma.Decimal; discounts: Prisma.Decimal; exemptions: Prisma.Decimal; immunities: Prisma.Decimal; otherBenefits: Prisma.Decimal; paid: Prisma.Decimal; compensated: Prisma.Decimal; balance: Prisma.Decimal; overdue: Prisma.Decimal; assessments: number; cancelled: number; guides: number; cancelledGuides: number; singleGuides: number; installmentGuides: number; unclassifiedGuides: number; overdueAssessments: number };
    const buckets = new Map<string, Bucket>(); const now = new Date();
    const assessmentModes = new Map<string, { singleAssessments: number; installmentAssessments: number; unclassifiedAssessments: number }>();
    for (const row of assessments) {
      let bucket = buckets.get(row.taxId);
      if (!bucket) { bucket = { taxId: row.taxId, name: row.tax.name, assessed: new Prisma.Decimal(0), net: new Prisma.Decimal(0), discounts: new Prisma.Decimal(0), exemptions: new Prisma.Decimal(0), immunities: new Prisma.Decimal(0), otherBenefits: new Prisma.Decimal(0), paid: new Prisma.Decimal(0), compensated: new Prisma.Decimal(0), balance: new Prisma.Decimal(0), overdue: new Prisma.Decimal(0), assessments: 0, cancelled: 0, guides: 0, cancelledGuides: 0, singleGuides: 0, installmentGuides: 0, unclassifiedGuides: 0, overdueAssessments: 0 }; buckets.set(row.taxId, bucket); }
      bucket.assessments++;
      const modes = assessmentModes.get(row.taxId) ?? { singleAssessments: 0, installmentAssessments: 0, unclassifiedAssessments: 0 };
      assessmentModes.set(row.taxId, modes);
      if (row.status !== "Cancelado") {
        const guideModes = new Set(row.guides.filter(guide => guide.status !== "Cancelada").map(guide => taxScopeSnapshot(guide.calculationSnapshot).paymentMode));
        if (guideModes.has("SINGLE")) modes.singleAssessments++;
        if (guideModes.has("INSTALLMENT")) modes.installmentAssessments++;
        if (!guideModes.size || [...guideModes].some(mode => mode !== "SINGLE" && mode !== "INSTALLMENT")) modes.unclassifiedAssessments++;
      }
      if (row.status === "Cancelado") bucket.cancelled++;
      const original = row.originalValueDecimal, net = row.finalValueDecimal;
      if (!original || !net) throw new Error(`Lançamento ${row.assessmentNumber ?? row.id} exige conciliação Decimal antes do resumo anual.`);
      bucket.assessed = bucket.assessed.plus(original);
      for (const guide of row.guides) {
        if (guide.status === "Cancelada") { bucket.cancelledGuides++; continue; }
        bucket.guides++; const data = taxScopeSnapshot(guide.calculationSnapshot);
        if (data.paymentMode === "SINGLE") bucket.singleGuides++; else if (data.paymentMode === "INSTALLMENT") bucket.installmentGuides++; else bucket.unclassifiedGuides++;
      }
      const rowPayments = payments.filter(payment => payment.guide.assessmentId === row.id);
      if (rowPayments.some(payment => !payment.amountPaidDecimal)) throw new Error("Pagamento sem Decimal conciliado no relatório anual.");
      const paid = rowPayments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Prisma.Decimal(0));
      const compensated = await taxAssessmentCompensatedValue(tx, row.id);
      bucket.paid = bucket.paid.plus(paid); bucket.compensated = bucket.compensated.plus(compensated);
      if (row.status !== "Cancelado") {
        bucket.net = bucket.net.plus(net); bucket.discounts = bucket.discounts.plus(row.discountValueDecimal ?? 0);
        const balance = Prisma.Decimal.max(0, net.minus(paid).minus(compensated)); bucket.balance = bucket.balance.plus(balance);
        const overdueGuides = row.guides.filter(guide => guide.status !== "Cancelada" && guide.dueDate < now);
        if (balance.gt(0) && overdueGuides.length && row.status !== "Suspenso") {
          let overdue = new Prisma.Decimal(0);
          for (const guide of overdueGuides) {
            if (!guide.totalValueDecimal) throw new Error("Guia sem Decimal conciliado no resumo anual.");
            const settled = rowPayments.filter(payment => payment.guideId === guide.id).reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Prisma.Decimal(0));
            const memory = taxScopeSnapshot(guide.calculationSnapshot);
            const guideAmount = memory.conditionalPaymentOption && settled.isZero() ? new Prisma.Decimal(String(memory.grossAmount)) : guide.totalValueDecimal;
            if (!guideAmount.isFinite() || guideAmount.lt(guide.totalValueDecimal)) throw new Error("Cota única sem memória de valor bruto conciliada no resumo anual.");
            overdue = overdue.plus(Prisma.Decimal.max(0, guideAmount.minus(settled)));
          }
          overdue = Prisma.Decimal.min(balance, Prisma.Decimal.max(0, overdue.minus(compensated)));
          if (overdue.gt(0)) { bucket.overdue = bucket.overdue.plus(overdue); bucket.overdueAssessments++; }
        }
      }
      for (const event of benefitEvents.filter(event => event.entityId === row.id)) {
        const benefit = benefits.find(item => item.id === taxScopeSnapshot(event.data).grantId); if (!benefit) continue;
        const amount = benefit.originalAmountDecimal.minus(benefit.finalAmountDecimal); const classification = classifications.get(benefit.ruleId);
        if (classification === "EXEMPTION") bucket.exemptions = bucket.exemptions.plus(amount); else if (classification === "IMMUNITY") bucket.immunities = bucket.immunities.plus(amount); else bucket.otherBenefits = bucket.otherBenefits.plus(amount);
      }
    }
    return { governmentEntity: unit.governmentEntity.name, budgetUnit: unit.budgetUnit.code, year: input.year, issuedAt: now.toISOString(), rows: [...buckets.values()].map(row => ({ taxId: row.taxId, name: row.name, assessed: row.assessed.toFixed(2), net: row.net.toFixed(2), discounts: row.discounts.toFixed(2), exemptions: row.exemptions.toFixed(2), immunities: row.immunities.toFixed(2), otherBenefits: row.otherBenefits.toFixed(2), paid: row.paid.toFixed(2), compensated: row.compensated.toFixed(2), balance: row.balance.toFixed(2), overdue: row.overdue.toFixed(2), delinquencyPercent: row.net.gt(0) ? row.overdue.div(row.net).mul(100).toFixed(2) : "0.00", assessments: row.assessments, cancelled: row.cancelled, guides: row.guides, cancelledGuides: row.cancelledGuides, singleGuides: row.singleGuides, installmentGuides: row.installmentGuides, unclassifiedGuides: row.unclassifiedGuides, overdueAssessments: row.overdueAssessments, ...assessmentModes.get(row.taxId)! })) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120000 });
}

export async function classifyBenefitForAnnualReport(db: PrismaClient, actor: TaxActor, raw: { ruleId: string; classification: "EXEMPTION" | "IMMUNITY" | "OTHER"; expectedVersion: number; reason: string }) {
  const input = z.object({ ruleId: z.string().min(1), classification: z.enum(["EXEMPTION", "IMMUNITY", "OTHER"]), expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(4000) }).parse(raw);
  return db.$transaction(async tx => {
    const rule = await tx.taxBenefitRule.findUniqueOrThrow({ where: { id: input.ruleId } }); const scope = taxScopeSnapshot(rule.eligibility);
    if (actor.allowedBudgetUnitIds && (typeof scope.budgetUnitId !== "string" || !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId))) throw new Error("Regra sem origem conciliada ou fora da UG autorizada.");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`BENEFIT_REPORT_CLASSIFICATION:${input.ruleId}`},0))::text`;
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "TAX_BENEFIT_RULE", entityId: input.ruleId, category: "BENEFIT_REPORT_CLASSIFICATION" }, orderBy: { version: "desc" } });
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("Classificação alterada. Recarregue.");
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "TAX_BENEFIT_RULE", entityId: input.ruleId, category: "BENEFIT_REPORT_CLASSIFICATION", title: rule.name, version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: { ...scope, classification: input.classification, reason: input.reason, previousId: previous?.id ?? null } } });
    await tx.taxAuditLog.create({ data: { action: "CLASSIFY_TAX_BENEFIT", entityType: "TaxBenefitRule", entityId: input.ruleId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous?.data ?? null, after: entry.data } as Prisma.InputJsonObject } }); return entry;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
