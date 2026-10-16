import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot, taxAssessmentCompensatedValue } from "./scope";

type Db = PrismaClient | Prisma.TransactionClient;
export const debtNoticeFilterSchema = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), kind: z.enum(["PROPERTY", "ECONOMIC"]), year: z.number().int().min(1900).max(2200).nullable(), taxId: z.string().nullable(), taxpayerId: z.string().nullable(), propertyId: z.string().nullable(), economicRegistrationId: z.string().nullable().optional(), streetId: z.string().nullable(), neighborhoodId: z.string().nullable(), addressContains: z.string().max(240), minimumBalance: z.string().regex(/^\d+(?:\.\d{1,2})?$/), overdueOnly: z.boolean() });
async function authorize(db: Db, actor: TaxActor, data: { governmentEntityId: string; budgetUnitId: string }) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(data.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await db.planningEntityUnit.findFirst({ where: data })) throw new Error("Origem não conciliada.");
}
export async function selectDebtNoticeTargets(db: Db, actor: TaxActor, raw: z.input<typeof debtNoticeFilterSchema>) {
  const filter = debtNoticeFilterSchema.parse(raw); await authorize(db, actor, { governmentEntityId: filter.governmentEntityId, budgetUnitId: filter.budgetUnitId });
  const propertyFilter = { ...(filter.propertyId ? { id: filter.propertyId } : {}), ...(filter.streetId ? { streetId: filter.streetId } : {}), ...(filter.neighborhoodId ? { neighborhoodId: filter.neighborhoodId } : {}), ...(filter.addressContains ? { streetName: { contains: filter.addressContains, mode: "insensitive" as const } } : {}) };
  if (filter.kind === "ECONOMIC" && filter.propertyId || filter.kind === "PROPERTY" && filter.economicRegistrationId) throw new Error("O identificador deve corresponder ao tipo de cadastro da notificação.");
  const assessments = await db.taxAssessment.findMany({ where: { status: { notIn: ["Cancelado", "Extinto", "Suspenso"] }, ...(filter.year ? { year: filter.year } : {}), ...(filter.taxId ? { taxId: filter.taxId } : {}), ...(filter.taxpayerId ? { taxpayerId: filter.taxpayerId } : {}), ...(filter.kind === "PROPERTY" ? { realEstateId: { not: null }, realEstate: propertyFilter } : { economicRegistrationId: filter.economicRegistrationId ?? { not: null } }), AND: [{ calculationSnapshot: { path: ["governmentEntityId"], equals: filter.governmentEntityId } }, { calculationSnapshot: { path: ["budgetUnitId"], equals: filter.budgetUnitId } }] }, include: { tax: { select: { name: true } }, taxpayer: { include: { person: true, company: true } }, realEstate: true, economicRegistration: true, guides: { orderBy: [{ dueDate: "desc" }, { id: "asc" }] } }, orderBy: { id: "asc" } });
  const profiles = filter.kind === "ECONOMIC" ? await db.taxRegistryEntry.findMany({ where: { entityType: "ECONOMIC_REGISTRATION", entityId: { in: assessments.flatMap(row => row.economicRegistrationId ? [row.economicRegistrationId] : []) }, category: "ECONOMIC_PROFILE" }, orderBy: { version: "desc" } }) : [];
  const latestProfiles = new Map<string, typeof profiles[number]>(); for (const row of profiles) if (!latestProfiles.has(row.entityId)) latestProfiles.set(row.entityId, row);
  const street = filter.kind === "ECONOMIC" && filter.streetId ? await db.street.findUniqueOrThrow({ where: { id: filter.streetId }, select: { name: true } }) : null;
  const neighborhood = filter.kind === "ECONOMIC" && filter.neighborhoodId ? await db.neighborhood.findUniqueOrThrow({ where: { id: filter.neighborhoodId }, select: { name: true } }) : null;
  const normalized = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("pt-BR");
  const payments = await db.taxPayment.findMany({ where: { guide: { assessmentId: { in: assessments.map(row => row.id) } }, status: "Confirmado" }, include: { guide: { select: { assessmentId: true } } }, orderBy: { id: "asc" } });
  type Debt = { assessmentId: string; assessmentNumber: string; tax: string; year: number; total: string; paid: string; compensated: string; balance: string; dueDate: string | null; guideId: string | null; guideNumber: string | null; barcode: string | null; bankRegistered: boolean; guideAmount: string | null };
  type Target = { key: string; taxpayerId: string; taxpayer: string; document: string; propertyId: string | null; registrationId: string | null; inscription: string; address: string; balance: string; debts: Debt[] };
  const targets = new Map<string, Target>(); const now = new Date();
  for (const row of assessments) {
    const profile = latestProfiles.get(row.economicRegistrationId ?? ""); const profileData = taxScopeSnapshot(profile?.data);
    const companyAddress = profileData.governmentEntityId === filter.governmentEntityId && profileData.budgetUnitId === filter.budgetUnitId ? taxScopeSnapshot(profileData.companyAddress) : {};
    const economicAddress = [companyAddress.street, companyAddress.number, companyAddress.complement, companyAddress.neighborhood, companyAddress.city, companyAddress.state, companyAddress.zipCode].filter(value => typeof value === "string" && value.trim()).join(" · ");
    if (filter.kind === "ECONOMIC" && (street && normalized(companyAddress.street) !== normalized(street.name) || neighborhood && normalized(companyAddress.neighborhood) !== normalized(neighborhood.name) || filter.addressContains && !normalized(economicAddress).includes(normalized(filter.addressContains)))) continue;
    const total = row.finalValueDecimal ?? row.originalValueDecimal; if (!total) throw new Error("Lançamento sem Decimal conciliado.");
    const received = payments.filter(payment => payment.guide.assessmentId === row.id); if (received.some(payment => !payment.amountPaidDecimal)) throw new Error("Recebimento sem Decimal conciliado.");
    const paid = received.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Prisma.Decimal(0)); const compensated = await taxAssessmentCompensatedValue(db, row.id);
    const balance = Prisma.Decimal.max(0, total.minus(paid).minus(compensated)); if (balance.isZero()) continue;
    const activeGuides = row.guides.filter(guide => guide.status !== "Cancelada");
    const outstandingGuides = activeGuides.map(guide => {
      if (!guide.totalValueDecimal) throw new Error("Guia sem Decimal conciliado na seleção das notificações.");
      const settled = received.filter(payment => payment.guideId === guide.id).reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Prisma.Decimal(0));
      const memory = taxScopeSnapshot(guide.calculationSnapshot);
      const collectible = memory.conditionalPaymentOption && guide.dueDate < now && settled.isZero() ? new Prisma.Decimal(String(memory.grossAmount)) : guide.totalValueDecimal;
      if (!collectible.isFinite() || collectible.lt(guide.totalValueDecimal)) throw new Error("Cota única sem memória bruta conciliada na notificação.");
      return { guide, remaining: Prisma.Decimal.max(0, collectible.minus(settled)) };
    }).filter(item => item.remaining.gt(0)).sort((a, b) => a.guide.dueDate.getTime() - b.guide.dueDate.getTime() || a.guide.id.localeCompare(b.guide.id));
    const overdue = Prisma.Decimal.min(balance, Prisma.Decimal.max(0, outstandingGuides.filter(item => item.guide.dueDate < now).reduce((sum, item) => sum.plus(item.remaining), new Prisma.Decimal(0)).minus(compensated)));
    const due = outstandingGuides[0]?.guide.dueDate ?? null;
    if (filter.overdueOnly && overdue.lte(0)) continue;
    const guide = activeGuides.find(guide => guide.totalValueDecimal?.eq(balance) && !received.some(payment => payment.guideId === guide.id)) ?? null;
    const registration = taxScopeSnapshot(guide?.calculationSnapshot); const bank = taxScopeSnapshot(registration.bankRegistration);
    const key = `${row.taxpayerId}:${filter.kind === "PROPERTY" ? row.realEstateId : row.economicRegistrationId}`;
    let target = targets.get(key);
    if (!target) { target = { key, taxpayerId: row.taxpayerId, taxpayer: row.taxpayer.company?.corporateName ?? row.taxpayer.person?.fullName ?? row.taxpayerId, document: row.taxpayer.company?.cnpj ?? row.taxpayer.person?.cpf ?? "", propertyId: filter.kind === "PROPERTY" ? row.realEstateId : null, registrationId: filter.kind === "ECONOMIC" ? row.economicRegistrationId : null, inscription: filter.kind === "PROPERTY" ? row.realEstate?.municipalInsc ?? "" : row.economicRegistration?.municipalInsc ?? "", address: filter.kind === "PROPERTY" && row.realEstate ? `${row.realEstate.streetName ?? ""}, ${row.realEstate.number ?? ""} ${row.realEstate.complement ?? ""}` : economicAddress, balance: "0.00", debts: [] }; targets.set(key, target); }
    target.balance = new Prisma.Decimal(target.balance).plus(balance).toFixed(2);
    target.debts.push({ assessmentId: row.id, assessmentNumber: row.assessmentNumber ?? row.id, tax: row.tax.name, year: row.year, total: total.toFixed(2), paid: paid.toFixed(2), compensated: compensated.toFixed(2), balance: balance.toFixed(2), dueDate: due?.toISOString().slice(0, 10) ?? null, guideId: guide?.id ?? null, guideNumber: guide?.guideNumber ?? null, barcode: guide?.barcode ?? null, bankRegistered: bank.status === "REGISTERED" && typeof bank.registrationId === "string", guideAmount: guide?.totalValueDecimal?.toFixed(2) ?? null });
  }
  const selected = [...targets.values()].filter(row => new Prisma.Decimal(row.balance).gte(filter.minimumBalance)).sort((a, b) => a.key.localeCompare(b.key));
  const fingerprint = createHash("sha256").update(JSON.stringify(selected)).digest("hex"); return { targets: selected, fingerprint };
}

export async function issueDebtNoticeBatch(db: PrismaClient, actor: TaxActor, raw: { filter: z.input<typeof debtNoticeFilterSchema>; expectedFingerprint: string; type: "NOTICE" | "WARNING"; title: string; body: string; legalBasis: string; includeBankSlip: boolean; reason: string }) {
  const input = z.object({ filter: debtNoticeFilterSchema, expectedFingerprint: z.string().length(64), type: z.enum(["NOTICE", "WARNING"]), title: z.string().trim().min(1).max(240), body: z.string().trim().min(1).max(12000), legalBasis: z.string().trim().min(1).max(4000), includeBankSlip: z.boolean(), reason: z.string().trim().min(1).max(4000) }).parse(raw);
  return db.$transaction(async tx => {
    const initial = await selectDebtNoticeTargets(tx, actor, input.filter);
    if (!initial.targets.length || initial.targets.length > 500) throw new Error("Selecione entre 1 e 500 destinatários. Refine os filtros.");
    const ids = [...new Set(initial.targets.flatMap(row => row.debts.map(debt => debt.assessmentId)))].sort(); for (const id of ids) await tx.$queryRaw`SELECT id FROM "TaxAssessment" WHERE id=${id} FOR UPDATE`;
    const selected = await selectDebtNoticeTargets(tx, actor, input.filter); if (selected.fingerprint !== input.expectedFingerprint) throw new Error("Débitos ou seleção alterados. Refaça a prévia.");
    if (input.includeBankSlip && selected.targets.some(row => row.debts.some(debt => !debt.bankRegistered || !debt.barcode || !/^\d{44}$/.test(debt.barcode)))) throw new Error("O boleto exige DAM de saldo integral com código bancário registrado. Concilie o convênio e o registro bancário das guias selecionadas.");
    const batchId = randomUUID(); const noticeIds = [];
    for (const target of selected.targets) {
      const id = randomUUID();
      await tx.taxRegistryEntry.create({ data: { entityType: "DEBT_NOTICE", entityId: id, category: "DEBT_NOTICE_ISSUANCE", title: input.title, actorUsuarioId: actor.usuarioId, source: "DEBT_NOTICE_BATCH", data: { governmentEntityId: input.filter.governmentEntityId, budgetUnitId: input.filter.budgetUnitId, batchId, type: input.type, title: input.title, body: input.body, legalBasis: input.legalBasis, includeBankSlip: input.includeBankSlip, target, issuedAt: new Date().toISOString(), reason: input.reason } } }); noticeIds.push(id);
      if (target.propertyId || target.registrationId) await tx.taxRegistryEntry.create({ data: { entityType: target.propertyId ? "REAL_ESTATE" : "ECONOMIC_REGISTRATION", entityId: target.propertyId ?? target.registrationId!, category: "DEBT_NOTICE_REFERENCE", title: input.title, actorUsuarioId: actor.usuarioId, data: { governmentEntityId: input.filter.governmentEntityId, budgetUnitId: input.filter.budgetUnitId, noticeId: id, batchId } } });
    }
    await tx.taxRegistryEntry.create({ data: { entityType: "DEBT_NOTICE_BATCH", entityId: batchId, category: "DEBT_NOTICE_BATCH", title: input.title, actorUsuarioId: actor.usuarioId, data: { governmentEntityId: input.filter.governmentEntityId, budgetUnitId: input.filter.budgetUnitId, filter: input.filter, fingerprint: selected.fingerprint, noticeIds, reason: input.reason } } });
    await tx.taxAuditLog.create({ data: { action: "ISSUE_DEBT_NOTICES", entityType: "DEBT_NOTICE_BATCH", entityId: batchId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { filter: input.filter, fingerprint: selected.fingerprint, noticeIds, includeBankSlip: input.includeBankSlip, reason: input.reason } } }); return { batchId, noticeIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120000 });
}

export async function cancelDebtNotice(db: PrismaClient, actor: TaxActor, raw: { noticeId: string; reason: string }) {
  const input = z.object({ noticeId: z.string().min(1), reason: z.string().trim().min(1).max(4000) }).parse(raw);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`DEBT_NOTICE:${input.noticeId}`},0))::text`;
    const notice = await tx.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "DEBT_NOTICE", entityId: input.noticeId, category: "DEBT_NOTICE_ISSUANCE" } }); const data = taxScopeSnapshot(notice.data);
    await authorize(tx, actor, { governmentEntityId: String(data.governmentEntityId), budgetUnitId: String(data.budgetUnitId) });
    if (await tx.taxRegistryEntry.findFirst({ where: { entityType: "DEBT_NOTICE", entityId: input.noticeId, category: "DEBT_NOTICE_CANCELLATION" } })) throw new Error("Notificação já cancelada.");
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "DEBT_NOTICE", entityId: input.noticeId, category: "DEBT_NOTICE_CANCELLATION", title: "Cancelamento da notificação", actorUsuarioId: actor.usuarioId, data: { governmentEntityId: data.governmentEntityId, budgetUnitId: data.budgetUnitId, issuanceId: notice.id, reason: input.reason } } });
    await tx.taxAuditLog.create({ data: { action: "CANCEL_DEBT_NOTICE", entityType: "DEBT_NOTICE", entityId: input.noticeId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { issuanceId: notice.id, reason: input.reason } } }); return entry;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
