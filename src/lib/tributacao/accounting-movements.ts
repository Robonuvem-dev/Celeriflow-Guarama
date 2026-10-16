import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { resolveFinancialReportScope } from "@/lib/financeiro/report-scope";

const moneyFilter = z.string().regex(/^\d{1,16}(?:\.\d{1,2})?$/).optional();
export const taxAccountingFilters = z.object({
  governmentEntityId: z.string().min(1), financialYearId: z.string().min(1), budgetUnitId: z.string().min(1).optional(),
  from: z.iso.date().optional(), through: z.iso.date().optional(), taxId: z.string().min(1).optional(),
  eventType: z.string().trim().max(150).optional(), account: z.string().trim().max(150).optional(),
  minimum: moneyFilter, maximum: moneyFilter, page: z.coerce.number().int().min(1).max(100000).default(1),
}).refine(value => !value.from || !value.through || value.from <= value.through, "Data inicial posterior à final.")
  .refine(value => !value.minimum || !value.maximum || new Prisma.Decimal(value.minimum).lte(value.maximum), "Valor mínimo superior ao máximo.");
const object = (value: Prisma.JsonValue): Prisma.JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
type AvailableReference = { id: string; date: string; eventType: string; amount: string; originEventId: string; guideId: string; assessmentId: string; taxId: string; taxName: string; budgetUnitId: string };
const referenceSelection = { id: true, eventType: true, payload: true } satisfies Prisma.TaxIntegrationEventSelect;
type ReferenceEntry = Prisma.TaxIntegrationEventGetPayload<{ select: typeof referenceSelection }>;

async function availableReferences(tx: Prisma.TransactionClient, input: z.infer<typeof taxAccountingFilters>, budgetUnitIds: string[], year: number) {
  const result: AvailableReference[] = [];
  // Pending references have no posting account: account filters cannot classify them using today's matrix.
  if (input.account) return result;
  let cursor: string | undefined;
  for (;;) {
    const references: ReferenceEntry[] = await tx.taxIntegrationEvent.findMany({ where: { integrationCode: "ACCOUNTING", status: "PENDENTE" }, select: referenceSelection, orderBy: { id: "asc" }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!references.length) break;
    for (const reference of references) {
      const payload = object(reference.payload);
      const date = typeof payload.competence === "string" ? new Date(payload.competence) : null;
      const sourceId = typeof payload.sourceId === "string" ? payload.sourceId : null;
      if (!date || !Number.isFinite(date.getTime()) || date.getUTCFullYear() !== year || !sourceId || reference.eventType !== "ARRECADACAO") continue;
      const day = date.toISOString().slice(0, 10);
      if (input.from && day < input.from || input.through && day > input.through || input.eventType && !reference.eventType.toLowerCase().includes(input.eventType.toLowerCase())) continue;
      const bankReturn = await tx.taxIntegrationEvent.findUnique({ where: { id: sourceId }, select: { integrationCode: true, status: true, idempotencyKey: true, payload: true } });
      if (bankReturn?.integrationCode !== "BANK_RETURN" || bankReturn.status !== "PROCESSADO") continue;
      const originPayload = object(bankReturn.payload);
      if (originPayload.amount !== payload.amount || originPayload.occurredAt !== payload.competence) continue;
      const payment = await tx.taxPayment.findUnique({ where: { idempotencyKey: bankReturn.idempotencyKey }, select: { status: true, guideId: true, guide: { select: { assessmentId: true, assessment: { select: { taxId: true, calculationSnapshot: true, tax: { select: { name: true } } } } } }, revenueIntegration: { select: { revenueId: true, revenue: { select: { budgetUnitId: true, financialYearId: true, financialYear: { select: { governmentEntityId: true } } } } } } } });
      if (payment?.status !== "Confirmado") continue;
      const assessment = payment.guide.assessment;
      if (input.taxId && assessment.taxId !== input.taxId) continue;
      const revenue = payment.revenueIntegration?.revenue;
      const memory = object(assessment.calculationSnapshot);
      const budgetUnitId = revenue ? revenue.budgetUnitId : (typeof memory.budgetUnitId === "string" ? memory.budgetUnitId : null);
      const governmentEntityId = revenue ? revenue.financialYear?.governmentEntityId : memory.governmentEntityId;
      if (!budgetUnitId || !budgetUnitIds.includes(budgetUnitId) || governmentEntityId !== input.governmentEntityId || revenue && revenue.financialYearId !== input.financialYearId) continue;
      const amount = typeof payload.amount === "string" && /^\d+(?:\.\d{1,2})?$/.test(payload.amount) ? new Prisma.Decimal(payload.amount) : null;
      if (!amount || !amount.isFinite() || amount.lte(0) || input.minimum && amount.lt(input.minimum) || input.maximum && amount.gt(input.maximum)) continue;
      if (payment.revenueIntegration && await tx.accountingTransaction.count({ where: { sourceModule: { in: ["TRIBUTACAO", "TRIBUTARIO"] }, sourceType: "TAX_PAYMENT", sourceId: payment.revenueIntegration.revenueId, financialYearId: input.financialYearId, governmentEntityId: input.governmentEntityId, budgetUnitId, status: "POSTADO", reversedBy: { is: null } } })) continue;
      result.push({ id: reference.id, date: date.toISOString(), eventType: reference.eventType, amount: amount.toFixed(2), originEventId: sourceId, guideId: payment.guideId, assessmentId: payment.guide.assessmentId, taxId: assessment.taxId, taxName: assessment.tax.name, budgetUnitId });
    }
    cursor = references[references.length - 1].id;
  }
  return result.sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
}

/** Fiscal identity follows canonical IDs; account names and transaction narratives never assign a tax. */
async function taxOriginFilter(tx: Prisma.TransactionClient, taxId: string): Promise<Prisma.AccountingTransactionWhereInput> {
  const assessments = await tx.taxAssessment.findMany({ where: { taxId }, select: { id: true } });
  const assessmentIds = assessments.map(item => item.id);
  const guides = await tx.taxGuide.findMany({ where: { assessmentId: { in: assessmentIds } }, select: { id: true } });
  const guideIds = guides.map(item => item.id);
  const receipts = await tx.taxRevenueIntegrationEvent.findMany({ where: { taxPayment: { guideId: { in: guideIds } } }, select: { revenueId: true } });
  const roots = guideIds.length ? await tx.taxRegistryEntry.findMany({ where: { category: "TAX_CREDIT", OR: guideIds.map(id => ({ data: { path: ["originGuideId"], equals: id } })) }, select: { id: true } }) : [];
  const registryIds = new Set(roots.map(item => item.id));
  let frontier = [...registryIds];
  for (let depth = 0; frontier.length; depth++) {
    if (depth >= 32) throw new Error("Cadeia de créditos/transferências excede 32 níveis; concilie a origem documental.");
    const successors = await tx.taxRegistryEntry.findMany({ where: { category: { in: ["TAX_CREDIT", "CREDIT_MOVEMENT", "REFUND_REQUEST"] }, OR: frontier.map(id => ({ data: { path: ["sourceCreditId"], equals: id } })) }, select: { id: true } });
    frontier = successors.filter(item => !registryIds.has(item.id)).map(item => item.id);
    for (const id of frontier) registryIds.add(id);
  }
  const compensations = await tx.taxRegistryEntry.findMany({ where: { entityType: "TAX_ASSESSMENT", entityId: { in: assessmentIds }, category: "CREDIT_MOVEMENT" }, select: { data: true } });
  const compensationTransactionIds = compensations.flatMap(item => { const id = object(item.data).accountingTransactionId; return typeof id === "string" ? [id] : []; });
  const origin: Prisma.AccountingTransactionWhereInput = { OR: [
    { sourceType: { in: ["TAX_ASSESSMENT", "TAX_ASSESSMENT_ADJUSTMENT", "ACTIVE_DEBT_RECLASSIFICATION", "ACTIVE_DEBT_RETURN", "ACTIVE_DEBT_RESTORATION"] }, sourceId: { in: assessmentIds } },
    { sourceType: "TAX_PAYMENT", sourceId: { in: receipts.map(item => item.revenueId) } },
    { sourceType: { in: ["TAX_CREDIT", "TAX_CREDIT_COMPENSATION", "TAX_REFUND", "TAX_CREDIT_REVERSAL", "TAX_CREDIT_COMPENSATION_REVERSAL", "TAX_REFUND_REVERSAL"] }, sourceId: { in: [...registryIds] } },
    { id: { in: compensationTransactionIds } },
  ] };
  return { OR: [origin, { reversalOf: { is: origin } }] };
}

export async function readTaxAccountingMovements(db: PrismaClient, actor: { allowedBudgetUnitIds?: string[] }, raw: unknown) {
  const input = taxAccountingFilters.parse(raw);
  return db.$transaction(async tx => {
    const scope = await resolveFinancialReportScope(tx, input.financialYearId, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId, budgetUnitIds: actor.allowedBudgetUnitIds });
    if (!scope.governmentEntityId || !scope.budgetUnitIds?.length) throw new Error("Consulta tributária exige ente/exercício e UG autorizados.");
    if (input.taxId && !await tx.tax.count({ where: { id: input.taxId } })) throw new Error("Tributo não encontrado.");
    const entryFilter: Prisma.AccountingEntryWhereInput = {
      ...(input.account ? { OR: [{ account: { OR: [{ code: { contains: input.account, mode: "insensitive" } }, { name: { contains: input.account, mode: "insensitive" } }] } }, { classificationSnapshot: { path: ["externalCode"], string_contains: input.account } }] } : {}),
      ...(input.minimum || input.maximum ? { valueDecimal: { ...(input.minimum ? { gte: new Prisma.Decimal(input.minimum) } : {}), ...(input.maximum ? { lte: new Prisma.Decimal(input.maximum) } : {}) } } : {}),
    };
    const where: Prisma.AccountingTransactionWhereInput = {
      governmentEntityId: scope.governmentEntityId, financialYearId: input.financialYearId, budgetUnitId: { in: scope.budgetUnitIds },
      sourceModule: { in: ["TRIBUTACAO", "TRIBUTARIO"] },
      ...(input.from || input.through ? { date: { ...(input.from ? { gte: new Date(`${input.from}T00:00:00.000Z`) } : {}), ...(input.through ? { lte: new Date(`${input.through}T23:59:59.999Z`) } : {}) } } : {}),
      ...(input.eventType ? { eventType: { contains: input.eventType, mode: "insensitive" } } : {}),
      ...(input.taxId ? { AND: [await taxOriginFilter(tx, input.taxId)] } : {}),
      ...(input.account || input.minimum || input.maximum ? { entries: { some: entryFilter } } : {}),
    };
    const total = await tx.accountingTransaction.count({ where });
    const available = await availableReferences(tx, input, scope.budgetUnitIds, scope.year);
    const page = Math.min(input.page, Math.max(1, Math.ceil(Math.max(total, available.length) / 50)));
    const transactions = await tx.accountingTransaction.findMany({ where, select: { id: true, date: true, history: true, status: true, sourceType: true, sourceModule: true, sourceId: true, eventType: true, reversalOfId: true, authorUsuario: { select: { nome: true } }, budgetUnit: { select: { code: true, name: true } }, entries: { where: entryFilter, select: { id: true, type: true, valueDecimal: true, classificationSnapshot: true, account: { select: { code: true, name: true } } }, orderBy: { id: "asc" } } }, orderBy: [{ date: "desc" }, { id: "desc" }], skip: (page - 1) * 50, take: 50 });
    return { year: scope.year, total, page, availableTotal: available.length, available: available.slice((page - 1) * 50, page * 50), transactions: transactions.map(transaction => ({ ...transaction, date: transaction.date.toISOString(), entries: transaction.entries.map(({ valueDecimal, ...entry }) => ({ ...entry, amount: valueDecimal?.toFixed(2) ?? null, frozenAccountCode: typeof object(entry.classificationSnapshot).externalCode === "string" ? object(entry.classificationSnapshot).externalCode as string : null })) })) };
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
}
