import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { assertAccountingPeriodOpen } from "@/lib/financeiro";
import type { TaxActor } from "./index";
import { postTaxAssessmentAdjustment } from "./accrual-accounting";
import { resolveTaxAssessmentScope, resolveTaxFinancialYear, synchronizeAssessmentDebt, taxAssessmentCompensatedValue, taxScopeSnapshot } from "./scope";
import {
  allocateInstallmentPayment,
  calculateBenefit,
  collectionRanking,
  executeDeterministicDraw,
  splitInstallmentAmount,
  TributarioS8Error,
} from "./s8-engine";

type Actor = { usuarioId: string };
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const code = (prefix: string) =>
  `${prefix}-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
const money = (value: number | string | Prisma.Decimal) =>
  new Prisma.Decimal(String(value)).toDecimalPlaces(2);
const plusMonths = (date: Date, amount: number, day: number) => {
  const result = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1, 12),
  );
  result.setUTCDate(
    Math.min(
      day,
      new Date(
        Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    ),
  );
  return result;
};

export async function createCollectionPortfolio(
  db: PrismaClient,
  actor: Actor,
  input: { name: string; profileId?: string; taxpayerIds?: string[] },
) {
  const assessments = await db.taxAssessment.findMany({
    where: {
      ...(input.taxpayerIds?.length
        ? { taxpayerId: { in: input.taxpayerIds } }
        : {}),
      status: { notIn: ["Pago", "Cancelado"] },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const debts = await db.activeDebt.findMany({
    where: {
      ...(input.taxpayerIds?.length
        ? { taxpayerId: { in: input.taxpayerIds } }
        : {}),
      status: { notIn: ["Paga", "Cancelada"] },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const activeAssessmentIds = new Set(
    debts.map((row) => row.assessmentId).filter(Boolean),
  );
  const items = [
    ...assessments
      .filter((row) => !activeAssessmentIds.has(row.id))
      .map((row) => ({
        taxpayerId: row.taxpayerId,
        sourceType: "LANCAMENTO",
        sourceId: row.id,
        originalDecimal:
          row.finalValueDecimal ??
          row.originalValueDecimal ??
          row.originalValue,
        outstandingDecimal:
          row.finalValueDecimal ??
          row.originalValueDecimal ??
          row.originalValue,
        dueDate: row.competence,
      })),
    ...debts.map((row) => ({
      taxpayerId: row.taxpayerId,
      sourceType: "DIVIDA_ATIVA_LEITURA",
      sourceId: row.id,
      originalDecimal: row.originalValueDecimal ?? row.originalValue,
      outstandingDecimal: row.updatedValueDecimal ?? row.updatedValue,
      dueDate: null,
    })),
  ];
  if (!items.length)
    throw new TributarioS8Error(
      "Nenhum débito elegível foi encontrado para a seleção.",
    );
  return db.taxCollectionPortfolio.create({
    data: {
      name: input.name.trim() || "Carteira de cobrança",
      profileId: input.profileId || null,
      selectionMode: input.taxpayerIds?.length ? "CONTRIBUINTES" : "AUTOMATICA",
      selectionSnapshot: json({
        taxpayerIds: input.taxpayerIds ?? [],
        selectedAt: new Date(),
        sources: {
          assessments: assessments.length,
          activeDebtReadOnly: debts.length,
        },
      }),
      createdByUsuarioId: actor.usuarioId,
      items: { create: items },
    },
    include: { items: true },
  });
}

export async function scheduleCollectionAction(
  db: PrismaClient,
  actor: Actor,
  input: {
    portfolioId: string;
    portfolioItemId?: string;
    taxpayerId: string;
    actionType: string;
    modality: string;
    channel: string;
    scheduledAt?: Date;
  },
) {
  const action = await db.taxCollectionAction.create({
    data: {
      portfolioId: input.portfolioId,
      portfolioItemId: input.portfolioItemId || null,
      taxpayerId: input.taxpayerId,
      actionType: input.actionType,
      modality: input.modality,
      channel: input.channel,
      scheduledAt: input.scheduledAt ?? new Date(),
      createdByUsuarioId: actor.usuarioId,
      events: {
        create: {
          eventType: "AGENDADA",
          description: `Ação ${input.actionType} agendada pelo canal ${input.channel}.`,
          actorUsuarioId: actor.usuarioId,
          payload: json({
            externalDelivery:
              input.channel === "DTE" ? "INTERNAL_ADAPTER" : "PENDING_PROVIDER",
          }),
        },
      },
    },
  });
  return action;
}

export async function completeCollectionAction(
  db: PrismaClient,
  actor: Actor,
  input: {
    actionId: string;
    resultCode: string;
    description: string;
    nextActionAt?: Date;
  },
) {
  return db.taxCollectionAction.update({
    where: { id: input.actionId },
    data: {
      status: "REALIZADA",
      performedAt: new Date(),
      resultCode: input.resultCode,
      resultDescription: input.description,
      nextActionAt: input.nextActionAt || null,
      events: {
        create: {
          eventType: "RESULTADO",
          description: input.description,
          payload: json({
            resultCode: input.resultCode,
            nextActionAt: input.nextActionAt,
          }),
          actorUsuarioId: actor.usuarioId,
        },
      },
    },
  });
}

export async function collectionDashboard(db: PrismaClient) {
  const items = await db.taxCollectionPortfolioItem.findMany({
    include: { actions: { where: { status: "REALIZADA" } } },
  });
  const grouped = new Map<
    string,
    { outstanding: number; overdueDays: number; successfulContacts: number }
  >();
  const today = Date.now();
  for (const item of items) {
    const current = grouped.get(item.taxpayerId) ?? {
      outstanding: 0,
      overdueDays: 0,
      successfulContacts: 0,
    };
    current.outstanding += Number(item.outstandingDecimal);
    current.overdueDays = Math.max(
      current.overdueDays,
      item.dueDate
        ? Math.floor((today - item.dueDate.getTime()) / 86400000)
        : 0,
    );
    current.successfulContacts += item.actions.filter((action) =>
      ["ACORDO", "CONTATO", "PAGAMENTO"].includes(action.resultCode ?? ""),
    ).length;
    grouped.set(item.taxpayerId, current);
  }
  return collectionRanking(
    [...grouped].map(([taxpayerId, values]) => ({ taxpayerId, ...values })),
  );
}

export function simulateInstallment(input: {
  total: number | string | Prisma.Decimal;
  count: number;
  discount?: number | string | Prisma.Decimal;
  fees?: number | string | Prisma.Decimal;
  dueDay: number;
}) {
  const original = money(input.total);
  const discount = money(input.discount ?? 0);
  const fees = money(input.fees ?? 0);
  const total = original.minus(discount).plus(fees).toDecimalPlaces(2);
  if (total.lessThanOrEqualTo(0))
    throw new TributarioS8Error("O total do acordo deve ser positivo.");
  return {
    original,
    discount,
    fees,
    total,
    quotas: splitInstallmentAmount(total, input.count),
    dueDay: input.dueDay,
  };
}

export async function createInstallmentAgreement(
  db: PrismaClient,
  actor: Actor,
  input: {
    taxpayerId: string;
    ruleId: string;
    total: number;
    count: number;
    dueDay: number;
    discount?: number;
    fees?: number;
    sourceType: string;
    sourceId: string;
    originLabel: string;
  },
) {
  const [taxpayer, rule] = await Promise.all([
    db.taxpayer.findUnique({ where: { id: input.taxpayerId } }),
    db.taxInstallmentRule.findUnique({ where: { id: input.ruleId } }),
  ]);
  if (!taxpayer || !rule?.active)
    throw new TributarioS8Error(
      "Contribuinte ou regra de parcelamento indisponível.",
    );
  if (input.count < rule.minInstallments || input.count > rule.maxInstallments)
    throw new TributarioS8Error(
      "Quantidade de parcelas fora da regra vigente.",
    );
  const simulation = simulateInstallment(input);
  const firstDue = new Date();
  const agreementNumber = code("PARC");
  return db.taxInstallmentAgreement.create({
    data: {
      agreementNumber,
      taxpayerId: taxpayer.id,
      ruleId: rule.id,
      installmentCount: input.count,
      dueDay: input.dueDay,
      originalDebtDecimal: simulation.original,
      discountDecimal: simulation.discount,
      feesDecimal: simulation.fees,
      totalAgreementDecimal: simulation.total,
      balanceDecimal: simulation.total,
      simulationSnapshot: json({
        ...simulation,
        quotas: simulation.quotas.map(String),
        rule: { id: rule.id, legalReference: rule.legalReference },
      }),
      createdByUsuarioId: actor.usuarioId,
      debts: {
        create: {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          originLabel: input.originLabel,
          originalAmountDecimal: simulation.original,
        },
      },
      quotas: {
        create: simulation.quotas.map((amount, index) => ({
          quotaNumber: index + 1,
          dueDate: plusMonths(firstDue, index + 1, input.dueDay),
          originalDecimal: amount,
          balanceDecimal: amount,
        })),
      },
      events: {
        create: {
          eventType: "ADESAO",
          description: `${input.count} cotas geradas com distribuição exata dos centavos.`,
          actorUsuarioId: actor.usuarioId,
          payload: json({
            total: simulation.total,
            quotas: simulation.quotas.map(String),
          }),
        },
      },
    },
    include: {
      quotas: { orderBy: { quotaNumber: "asc" } },
      debts: true,
      events: true,
    },
  });
}

export async function applyInstallmentPayment(
  db: PrismaClient,
  actor: Actor,
  input: {
    agreementId: string;
    paymentKey: string;
    amount: number;
    paymentMode?: string;
  },
) {
  const agreement = await db.taxInstallmentAgreement.findUnique({
    where: { id: input.agreementId },
    include: {
      quotas: { orderBy: { quotaNumber: "asc" } },
      allocations: { where: { paymentKey: input.paymentKey } },
    },
  });
  if (!agreement || !["ATIVO", "REATIVADO"].includes(agreement.status))
    throw new TributarioS8Error("Parcelamento indisponível para pagamento.");
  if (agreement.allocations.length) return agreement;
  const allocation = allocateInstallmentPayment(
    agreement.quotas.map((row) => ({
      id: row.id,
      quotaNumber: row.quotaNumber,
      balance: row.balanceDecimal,
    })),
    input.amount,
  );
  return db.$transaction(async (tx) => {
    for (const row of allocation.allocations.filter((item) =>
      item.allocated.greaterThan(0),
    )) {
      await tx.taxInstallmentQuota.update({
        where: { id: row.id! },
        data: {
          paidDecimal: { increment: row.allocated },
          balanceDecimal: row.balanceAfter,
          status: row.status,
        },
      });
      await tx.taxInstallmentPaymentAllocation.create({
        data: {
          agreementId: agreement.id,
          quotaId: row.id!,
          paymentKey: input.paymentKey,
          amountDecimal: row.allocated,
          paymentDate: new Date(),
          paymentMode: input.paymentMode ?? "FORA_DA_PARCELA",
        },
      });
    }
    const paid = agreement.totalAgreementDecimal.minus(allocation.totalBalance);
    return tx.taxInstallmentAgreement.update({
      where: { id: agreement.id },
      data: {
        paidDecimal: paid,
        balanceDecimal: allocation.totalBalance,
        status: allocation.totalBalance.equals(0)
          ? "QUITADO"
          : agreement.status,
        events: {
          create: {
            eventType: "PAGAMENTO",
            description: `Pagamento de R$ ${money(input.amount).toFixed(2)} alocado nas cotas mais antigas.`,
            actorUsuarioId: actor.usuarioId,
            payload: json({
              paymentKey: input.paymentKey,
              allocation: allocation.allocations.map((row) => ({
                quota: row.quotaNumber,
                allocated: row.allocated,
                balance: row.balanceAfter,
              })),
            }),
          },
        },
      },
      include: {
        quotas: { orderBy: { quotaNumber: "asc" } },
        allocations: true,
        events: true,
      },
    });
  });
}

export async function reviseInstallmentOrigin(
  db: PrismaClient,
  actor: Actor,
  input: {
    agreementId: string;
    debtId: string;
    revisedAmount: number;
    reason: string;
  },
) {
  const agreement = await db.taxInstallmentAgreement.findUnique({
    where: { id: input.agreementId },
    include: { debts: true, quotas: { orderBy: { quotaNumber: "desc" } } },
  });
  const debt = agreement?.debts.find((row) => row.id === input.debtId);
  if (!agreement || !debt)
    throw new TributarioS8Error("Origem do parcelamento não encontrada.");
  if (!input.reason.trim())
    throw new TributarioS8Error("Informe a justificativa da revisão.");
  const previous = debt.revisedAmountDecimal ?? debt.originalAmountDecimal;
  const revised = money(input.revisedAmount);
  const delta = revised.minus(previous);
  const lastOpen = agreement.quotas.find((row) => row.status !== "QUITADA");
  if (!lastOpen || lastOpen.balanceDecimal.plus(delta).lessThan(0))
    throw new TributarioS8Error(
      "A revisão é incompatível com o saldo das cotas.",
    );
  return db.$transaction(async (tx) => {
    await tx.taxInstallmentDebt.update({
      where: { id: debt.id },
      data: { revisedAmountDecimal: revised },
    });
    await tx.taxInstallmentQuota.update({
      where: { id: lastOpen.id },
      data: {
        originalDecimal: lastOpen.originalDecimal.plus(delta),
        balanceDecimal: lastOpen.balanceDecimal.plus(delta),
      },
    });
    return tx.taxInstallmentAgreement.update({
      where: { id: agreement.id },
      data: {
        originalDebtDecimal: agreement.originalDebtDecimal.plus(delta),
        totalAgreementDecimal: agreement.totalAgreementDecimal.plus(delta),
        balanceDecimal: agreement.balanceDecimal.plus(delta),
        events: {
          create: {
            eventType: "REVISAO_ORIGEM",
            description: input.reason.trim(),
            actorUsuarioId: actor.usuarioId,
            payload: json({ debtId: debt.id, previous, revised, delta }),
          },
        },
      },
      include: { quotas: { orderBy: { quotaNumber: "asc" } }, debts: true },
    });
  });
}

export async function reparcelInstallment(
  db: PrismaClient,
  actor: Actor,
  input: { agreementId: string; count: number; dueDay: number },
) {
  const parent = await db.taxInstallmentAgreement.findUnique({
    where: { id: input.agreementId },
  });
  if (
    !parent ||
    parent.balanceDecimal.lessThanOrEqualTo(0) ||
    parent.status === "CANCELADO"
  )
    throw new TributarioS8Error(
      "Acordo sem saldo elegível para reparcelamento.",
    );
  const child = await createInstallmentAgreement(db, actor, {
    taxpayerId: parent.taxpayerId,
    ruleId: parent.ruleId,
    total: Number(parent.balanceDecimal),
    count: input.count,
    dueDay: input.dueDay,
    sourceType: "REPARCELAMENTO",
    sourceId: parent.id,
    originLabel: `Saldo do acordo ${parent.agreementNumber}`,
  });
  await db.$transaction([
    db.taxInstallmentAgreement.update({
      where: { id: child.id },
      data: {
        parentAgreementId: parent.id,
        agreementType: "REPARCELAMENTO",
        events: {
          create: {
            eventType: "ORIGEM_REPARCELAMENTO",
            description: `Reparcelamento do saldo de ${parent.agreementNumber}.`,
            actorUsuarioId: actor.usuarioId,
          },
        },
      },
    }),
    db.taxInstallmentAgreement.update({
      where: { id: parent.id },
      data: {
        status: "REPARCELADO",
        events: {
          create: {
            eventType: "REPARCELAMENTO",
            description: `Saldo transferido para ${child.agreementNumber}.`,
            actorUsuarioId: actor.usuarioId,
          },
        },
      },
    }),
  ]);
  return child;
}

export async function changeInstallmentStatus(
  db: PrismaClient,
  actor: Actor,
  input: {
    agreementId: string;
    action: "ROMPER" | "REATIVAR" | "CANCELAR";
    reason: string;
  },
) {
  if (!input.reason.trim())
    throw new TributarioS8Error("Informe a justificativa.");
  const now = new Date();
  const status =
    input.action === "ROMPER"
      ? "ROMPIDO"
      : input.action === "REATIVAR"
        ? "REATIVADO"
        : "CANCELADO";
  return db.taxInstallmentAgreement.update({
    where: { id: input.agreementId },
    data: {
      status,
      brokenAt: input.action === "ROMPER" ? now : undefined,
      reactivatedAt: input.action === "REATIVAR" ? now : undefined,
      cancelledAt: input.action === "CANCELAR" ? now : undefined,
      events: {
        create: {
          eventType: input.action,
          description: input.reason.trim(),
          actorUsuarioId: actor.usuarioId,
        },
      },
    },
  });
}

export async function grantPortalAccess(
  db: PrismaClient,
  actor: Actor,
  taxpayerId: string,
) {
  await db.taxpayer.findUniqueOrThrow({ where: { id: taxpayerId } });
  return db.taxpayerPortalAccess.upsert({
    where: { usuarioId_taxpayerId: { usuarioId: actor.usuarioId, taxpayerId } },
    update: {
      status: "ATIVO",
      revokedAt: null,
      scopes: json([
        "EXTRATO",
        "DAM",
        "CERTIDOES",
        "IPTU",
        "PARCELAMENTO",
        "DIVIDA",
        "PROCESSOS",
        "EMPRESA",
        "IMOVEL",
        "ITBI",
        "NOTIFICACOES",
        "PAGAMENTOS",
        "DOCUMENTOS",
        "ALVARAS",
        "AUTENTICIDADE",
      ]),
    },
    create: {
      usuarioId: actor.usuarioId,
      taxpayerId,
      grantedByUsuarioId: actor.usuarioId,
      scopes: json([
        "EXTRATO",
        "DAM",
        "CERTIDOES",
        "IPTU",
        "PARCELAMENTO",
        "DIVIDA",
        "PROCESSOS",
        "EMPRESA",
        "IMOVEL",
        "ITBI",
        "NOTIFICACOES",
        "PAGAMENTOS",
        "DOCUMENTOS",
        "ALVARAS",
        "AUTENTICIDADE",
      ]),
    },
  });
}

export async function createBenefitRule(
  db: PrismaClient,
  actor: Actor,
  input: {
    code: string;
    name: string;
    benefitType: "CREDITO" | "REDUCAO" | "RENUNCIA";
    legalReference: string;
    value: number;
    valueMode: "PERCENT" | "FIXED";
    effectiveFrom: Date;
    effectiveUntil?: Date;
  },
) {
  if (!input.legalReference.trim())
    throw new TributarioS8Error("A referência legal é obrigatória.");
  if (!input.code.trim() || !input.name.trim() || !["CREDITO", "REDUCAO", "RENUNCIA"].includes(input.benefitType) || !["PERCENT", "FIXED"].includes(input.valueMode)) throw new TributarioS8Error("Identificação ou tipo do benefício inválido.");
  if (!Number.isFinite(input.value) || input.value <= 0 || (input.valueMode === "PERCENT" && input.value > 100)) throw new TributarioS8Error("Valor do benefício inválido.");
  if (!Number.isFinite(input.effectiveFrom.getTime()) || (input.effectiveUntil && (!Number.isFinite(input.effectiveUntil.getTime()) || input.effectiveUntil < input.effectiveFrom))) throw new TributarioS8Error("Vigência do benefício inválida.");
  return db.taxBenefitRule.create({
    data: {
      code: input.code.trim(),
      name: input.name.trim(),
      benefitType: input.benefitType,
      legalReference: input.legalReference.trim(),
      eligibility: { mode: "ANALISE_INDIVIDUAL" },
      calculation: { value: input.value, valueMode: input.valueMode },
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil || null,
      createdByUsuarioId: actor.usuarioId,
    },
  });
}

export async function grantBenefit(
  db: PrismaClient,
  actor: TaxActor,
  input: {
    ruleId: string;
    taxpayerId: string;
    sourceType: string;
    sourceId: string;
    originalAmount: number;
    reason: string;
    documentId?: string;
  },
) {
  if (input.sourceType !== "TAX_ASSESSMENT" || !input.reason.trim()) throw new TributarioS8Error("Informe o lançamento e o fundamento da concessão.");
  const original = money(input.originalAmount);
  if (!original.isFinite() || original.lte(0)) throw new TributarioS8Error("Valor original do benefício inválido.");
  const request = { originalAmount: original.toFixed(2), reason: input.reason.trim(), documentId: input.documentId?.trim() || null };
  return db.$transaction(async (tx) => {
    const assessment = await tx.taxAssessment.findUniqueOrThrow({ where: { id: input.sourceId } });
    const scope = await resolveTaxAssessmentScope(tx, actor, assessment.taxId, assessment.calculationSnapshot);
    if (assessment.taxpayerId !== input.taxpayerId) throw new TributarioS8Error("Contribuinte diferente do titular do lançamento.");
    const key = { ruleId: input.ruleId, taxpayerId: input.taxpayerId, sourceType: input.sourceType, sourceId: input.sourceId };
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`BENEFIT:${JSON.stringify(key)}`}, 0))::text`;
    const existing = await tx.taxBenefitGrant.findUnique({ where: { ruleId_taxpayerId_sourceType_sourceId: key } });
    if (existing) {
      const stored = taxScopeSnapshot(taxScopeSnapshot(existing.calculationSnapshot).request);
      if (existing.status !== "CONCEDIDO" || Object.entries(request).some(([field, value]) => stored[field] !== value)) throw new TributarioS8Error("Benefício já registrado com outros dados.");
      return existing;
    }
    const now = new Date();
    const year = await resolveTaxFinancialYear(tx, now.getUTCFullYear(), scope);
    await assertAccountingPeriodOpen(tx, year.id, now);
    await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id = ${input.sourceId} FOR UPDATE`;
    const current = await tx.taxAssessment.findUniqueOrThrow({ where: { id: input.sourceId }, include: { guides: { include: { payments: { where: { status: "Confirmado" } } } } } });
    if (["Cancelado", "Pago", "Extinto", "Suspenso", "Dívida Ativa"].includes(current.status)) throw new TributarioS8Error("Lançamento indisponível para concessão de benefício.");
    const total = current.finalValueDecimal ?? current.originalValueDecimal;
    if (!total) throw new TributarioS8Error("Lançamento sem valor decimal conciliado.");
    let paid = await taxAssessmentCompensatedValue(tx, current.id);
    for (const guide of current.guides) {
      const collected = guide.payments.reduce((sum, payment) => {
        if (!payment.amountPaidDecimal) throw new TributarioS8Error("Pagamento sem valor decimal conciliado.");
        return sum.plus(payment.amountPaidDecimal);
      }, new Prisma.Decimal(0));
      paid = paid.plus(collected);
      if (guide.status !== "Cancelada" && (guide.totalValueDecimal ?? money(guide.totalValue)).gt(collected)) throw new TributarioS8Error("Cancele as guias abertas antes de conceder o benefício.");
    }
    const balance = total.minus(paid);
    if (!balance.eq(original)) throw new TributarioS8Error("O saldo do lançamento mudou; atualize o valor da concessão.");
    const rule = await tx.taxBenefitRule.findUnique({ where: { id: input.ruleId } });
    if (!rule?.active || rule.effectiveFrom > now || (rule.effectiveUntil && rule.effectiveUntil < now)) throw new TributarioS8Error("Regra de benefício fora da vigência.");
    if (!["CREDITO", "REDUCAO", "RENUNCIA"].includes(rule.benefitType)) throw new TributarioS8Error("Tipo de benefício inválido.");
    if (request.documentId) {
      const document = await tx.document.findUnique({ where: { id: request.documentId } });
      if (document?.status !== "Válido") throw new TributarioS8Error("Documento GED da concessão não está válido.");
    }
    const config = taxScopeSnapshot(rule.calculation);
    if ((config.valueMode !== "PERCENT" && config.valueMode !== "FIXED") || (typeof config.value !== "number" && typeof config.value !== "string")) throw new TributarioS8Error("Cálculo do benefício não está configurado.");
    const configuredValue = new Prisma.Decimal(String(config.value));
    if (!configuredValue.isFinite() || configuredValue.lte(0) || (config.valueMode === "PERCENT" && configuredValue.gt(100))) throw new TributarioS8Error("Valor configurado do benefício inválido.");
    const result = calculateBenefit({ amount: balance, type: rule.benefitType as "CREDITO" | "REDUCAO" | "RENUNCIA", value: config.value, valueMode: config.valueMode });
    const applied = balance.minus(result.finalAmount);
    if (applied.lte(0)) throw new TributarioS8Error("O benefício deve reduzir o saldo do lançamento.");
    const finalValue = total.minus(applied);
    await postTaxAssessmentAdjustment(tx, actor, { assessmentId: current.id, date: now, delta: applied.negated(), kind: "BENEFIT", idempotencyKey: `BENEFIT:${current.id}:${rule.id}:ACCOUNTING`, reason: request.reason });
    const grant = await tx.taxBenefitGrant.create({ data: {
      ...key, originalAmountDecimal: balance, creditDecimal: result.credit, reductionDecimal: result.reduction, renunciationDecimal: result.renunciation, finalAmountDecimal: result.finalAmount,
      calculationSnapshot: json({ ...scope, operationFinancialYearId: year.id, request, rule: { id: rule.id, code: rule.code, legalReference: rule.legalReference, calculation: rule.calculation }, result, oldValue: total.toFixed(2), newValue: finalValue.toFixed(2), effect: "REDUCAO_DEBITO_SEM_CAIXA" }), grantedByUsuarioId: actor.usuarioId, grantedAt: now,
    } });
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "TAX_ASSESSMENT", entityId: current.id, category: "CREDIT_EVENT", title: `Benefício: ${rule.name}`, status: "ATIVO", source: "BENEFICIO", actorUsuarioId: actor.usuarioId, documentId: request.documentId, data: { ...scope, eventType: "BENEFICIO", grantId: grant.id, ruleId: rule.id, legalReference: rule.legalReference, amount: applied.toFixed(2), oldValue: total.toFixed(2), newValue: finalValue.toFixed(2), reducesAssessmentValue: true, reason: request.reason } } });
    await tx.taxAssessment.update({ where: { id: current.id }, data: { finalValueDecimal: finalValue, status: finalValue.eq(paid) ? "Extinto" : "Revisado", calculationSnapshot: { ...taxScopeSnapshot(current.calculationSnapshot), currentValue: finalValue.toFixed(2), lastBenefitGrantId: grant.id } } });
    await synchronizeAssessmentDebt(tx, actor, current.id);
    await tx.taxIntegrationEvent.create({ data: { integrationCode: "FISCAL_ENGINE", eventType: "BENEFIT_GRANTED", idempotencyKey: `BENEFIT:${grant.id}`, status: "PROCESSADO", evidenceLevel: "L1", taxpayerId: current.taxpayerId, payload: { ...scope, assessmentId: current.id, grantId: grant.id }, result: { registryEntryId: entry.id, amount: applied.toFixed(2), renunciation: result.renunciation.toFixed(2) }, processedAt: now } });
    await tx.taxAuditLog.create({ data: { action: "GRANT_BENEFIT", entityType: "TaxBenefitGrant", entityId: grant.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...scope, assessmentId: current.id, registryEntryId: entry.id, amount: applied.toFixed(2), reason: request.reason } } });
    return grant;
  });
}

export async function createPrizeDraw(
  db: PrismaClient,
  actor: Actor,
  input: {
    name: string;
    year: number;
    drawNumber: number;
    scheduledAt: Date;
    winnerCount: number;
    technicalSeed: string;
    requiresPayment?: boolean;
    officialActReference?: string;
  },
) {
  return db.taxPrizeDraw.create({
    data: {
      slug: `${input.year}-${input.drawNumber}-${randomUUID().slice(0, 6)}`,
      name: input.name,
      year: input.year,
      drawNumber: input.drawNumber,
      scheduledAt: input.scheduledAt,
      eligibilityRules: { sourceRequired: true, status: "CONFIGURADA" },
      requiresPayment: input.requiresPayment ?? false,
      taxpayerTypes: ["PF", "PJ"],
      winnerCount: input.winnerCount,
      technicalSeed: input.technicalSeed,
      officialActReference: input.officialActReference || null,
      createdByUsuarioId: actor.usuarioId,
    },
  });
}

export async function issuePrizeCoupon(
  db: PrismaClient,
  input: {
    drawId: string;
    taxpayerId: string;
    sourceDocumentType: "GUIA" | "DOCUMENTO";
    sourceDocumentId: string;
  },
) {
  const draw = await db.taxPrizeDraw.findUnique({
    where: { id: input.drawId },
    include: { coupons: true },
  });
  if (!draw) throw new TributarioS8Error("Sorteio não encontrado.");
  if (input.sourceDocumentType === "GUIA") {
    const guide = await db.taxGuide.findUnique({
      where: { id: input.sourceDocumentId },
      include: { assessment: true, payments: true },
    });
    if (!guide || guide.assessment.taxpayerId !== input.taxpayerId)
      throw new TributarioS8Error("DAM não pertence ao contribuinte.");
    if (
      draw.requiresPayment &&
      guide.status !== "Paga" &&
      !guide.payments.some((p) => p.status === "Confirmado")
    )
      throw new TributarioS8Error("O regulamento exige pagamento confirmado.");
  } else if (
    !(await db.document.findUnique({ where: { id: input.sourceDocumentId } }))
  )
    throw new TributarioS8Error("Documento de origem não encontrado.");
  const couponNumber = `${draw.year}${String(draw.drawNumber).padStart(3, "0")}${String(draw.coupons.length + 1).padStart(7, "0")}`;
  return db.taxPrizeCoupon.create({
    data: {
      drawId: draw.id,
      couponNumber,
      taxpayerId: input.taxpayerId,
      sourceDocumentType: input.sourceDocumentType,
      sourceDocumentId: input.sourceDocumentId,
      eligibilitySnapshot: json({
        checkedAt: new Date(),
        requiresPayment: draw.requiresPayment,
        sourceValidated: true,
      }),
    },
  });
}

export async function executePrizeDraw(
  db: PrismaClient,
  actor: Actor,
  drawId: string,
) {
  const existing = await db.taxPrizeExecution.findUnique({
    where: { drawId_executionNumber: { drawId, executionNumber: 1 } },
    include: { winners: { include: { coupon: true } } },
  });
  if (existing) return existing;
  const draw = await db.taxPrizeDraw.findUnique({
    where: { id: drawId },
    include: { coupons: { where: { status: "ELEGIVEL" } } },
  });
  if (!draw) throw new TributarioS8Error("Sorteio não encontrado.");
  const result = executeDeterministicDraw(
    draw.coupons,
    draw.technicalSeed,
    draw.winnerCount,
  );
  return db.$transaction(async (tx) => {
    const execution = await tx.taxPrizeExecution.create({
      data: {
        drawId: draw.id,
        executionNumber: 1,
        algorithm: result.algorithm,
        seedHash: result.seedHash,
        inputHash: result.inputHash,
        resultHash: result.resultHash,
        status: draw.officialActReference
          ? "ATO_CADASTRADO"
          : "DEMONSTRACAO_TECNICA",
        executedByUsuarioId: actor.usuarioId,
        winners: {
          create: result.winners.map((winner, index) => ({
            couponId: winner.coupon.id,
            position: index + 1,
            resultKey: winner.resultKey,
          })),
        },
      },
      include: { winners: { include: { coupon: true } } },
    });
    await tx.taxPrizeDraw.update({
      where: { id: draw.id },
      data: {
        status: draw.officialActReference
          ? "EXECUTADO_COM_ATO_CADASTRADO"
          : "DEMONSTRACAO_EXECUTADA",
        executedAt: new Date(),
      },
    });
    return execution;
  });
}
