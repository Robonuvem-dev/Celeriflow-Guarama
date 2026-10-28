import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import { taxAssessments } from "@/db/schema/taxation-core";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { streets, neighborhoods } from "@/db/schema/localities";
import { readDebtBinding, requiredDebtRow } from "@/db/repositories/tax-active-debt/records";
import { insertDebtAudit, insertDebtRegistry, listNoticeAssessments, listNoticePayments, listNoticeProfiles } from "@/db/repositories/tax-active-debt/notices";
import type { DebtNoticeDebt, DebtNoticeTarget } from "@/lib/contracts/tax-active-debt";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot, taxAssessmentCompensatedValue } from "./scope";

export const debtNoticeFilterSchema = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), kind: z.enum(["PROPERTY", "ECONOMIC"]), year: z.number().int().min(1900).max(2200).nullable(), taxId: z.string().nullable(), taxpayerId: z.string().nullable(), propertyId: z.string().nullable(), economicRegistrationId: z.string().nullable().optional(), streetId: z.string().nullable(), neighborhoodId: z.string().nullable(), addressContains: z.string().max(240), minimumBalance: z.string().regex(/^\d+(?:\.\d{1,2})?$/), overdueOnly: z.boolean() });
async function authorize(db: DatabaseExecutor, actor: TaxActor, data: { governmentEntityId: string; budgetUnitId: string }) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(data.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if ((await readDebtBinding(db, data.budgetUnitId))?.governmentEntityId !== data.governmentEntityId) throw new Error("Origem não conciliada.");
}
export async function selectDebtNoticeTargets(db: DatabaseExecutor, actor: TaxActor, raw: z.input<typeof debtNoticeFilterSchema>) {
  const filter = debtNoticeFilterSchema.parse(raw); await authorize(db, actor, { governmentEntityId: filter.governmentEntityId, budgetUnitId: filter.budgetUnitId });
  if (filter.kind === "ECONOMIC" && filter.propertyId || filter.kind === "PROPERTY" && filter.economicRegistrationId) throw new Error("O identificador deve corresponder ao tipo de cadastro da notificação.");
  const assessments = await listNoticeAssessments(db, filter);
  const profiles = filter.kind === "ECONOMIC" ? await listNoticeProfiles(db, assessments.flatMap(row => row.economicRegistrationId ? [row.economicRegistrationId] : [])) : [];
  const latestProfiles = new Map<string, typeof profiles[number]>(); for (const row of profiles) if (!latestProfiles.has(row.entityId)) latestProfiles.set(row.entityId, row);
  const street = filter.kind === "ECONOMIC" && filter.streetId ? requiredDebtRow((await db.select({ name: streets.name }).from(streets).where(eq(streets.id, filter.streetId)).limit(1))[0]) : null;
  const neighborhood = filter.kind === "ECONOMIC" && filter.neighborhoodId ? requiredDebtRow((await db.select({ name: neighborhoods.name }).from(neighborhoods).where(eq(neighborhoods.id, filter.neighborhoodId)).limit(1))[0]) : null;
  const normalized = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("pt-BR");
  const payments = await listNoticePayments(db, assessments.map(row => row.id));
  type Debt = DebtNoticeDebt;
  type Target = Omit<DebtNoticeTarget, "debts"> & { debts: Debt[] };
  const targets = new Map<string, Target>(); const now = new Date();
  for (const row of assessments) {
    const profile = latestProfiles.get(row.economicRegistrationId ?? ""); const profileData = taxScopeSnapshot(profile?.data);
    const companyAddress = profileData.governmentEntityId === filter.governmentEntityId && profileData.budgetUnitId === filter.budgetUnitId ? taxScopeSnapshot(profileData.companyAddress) : {};
    const economicAddress = [companyAddress.street, companyAddress.number, companyAddress.complement, companyAddress.neighborhood, companyAddress.city, companyAddress.state, companyAddress.zipCode].filter(value => typeof value === "string" && value.trim()).join(" · ");
    if (filter.kind === "ECONOMIC" && (street && normalized(companyAddress.street) !== normalized(street.name) || neighborhood && normalized(companyAddress.neighborhood) !== normalized(neighborhood.name) || filter.addressContains && !normalized(economicAddress).includes(normalized(filter.addressContains)))) continue;
    const total = row.finalValueDecimal ?? row.originalValueDecimal; if (!total) throw new Error("Lançamento sem Decimal conciliado.");
    const received = payments.filter(payment => payment.guide.assessmentId === row.id); if (received.some(payment => !payment.amountPaidDecimal)) throw new Error("Recebimento sem Decimal conciliado.");
    const paid = received.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Decimal(0)); const compensated = await taxAssessmentCompensatedValue(db, row.id);
    const balance = Decimal.max(0, total.minus(paid).minus(compensated)); if (balance.isZero()) continue;
    const activeGuides = row.guides.filter(guide => guide.status !== "Cancelada");
    const outstandingGuides = activeGuides.map(guide => {
      if (!guide.totalValueDecimal) throw new Error("Guia sem Decimal conciliado na seleção das notificações.");
      const settled = received.filter(payment => payment.guideId === guide.id).reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Decimal(0));
      const memory = taxScopeSnapshot(guide.calculationSnapshot);
      const collectible = memory.conditionalPaymentOption && guide.dueDate < now && settled.isZero() ? new Decimal(String(memory.grossAmount)) : guide.totalValueDecimal;
      if (!collectible.isFinite() || collectible.lt(guide.totalValueDecimal)) throw new Error("Cota única sem memória bruta conciliada na notificação.");
      return { guide, remaining: Decimal.max(0, collectible.minus(settled)) };
    }).filter(item => item.remaining.gt(0)).sort((a, b) => a.guide.dueDate.getTime() - b.guide.dueDate.getTime() || a.guide.id.localeCompare(b.guide.id));
    const overdue = Decimal.min(balance, Decimal.max(0, outstandingGuides.filter(item => item.guide.dueDate < now).reduce((sum, item) => sum.plus(item.remaining), new Decimal(0)).minus(compensated)));
    const due = outstandingGuides[0]?.guide.dueDate ?? null;
    if (filter.overdueOnly && overdue.lte(0)) continue;
    const guide = activeGuides.find(guide => guide.totalValueDecimal?.eq(balance) && !received.some(payment => payment.guideId === guide.id)) ?? null;
    const registration = taxScopeSnapshot(guide?.calculationSnapshot); const bank = taxScopeSnapshot(registration.bankRegistration);
    const key = `${row.taxpayerId}:${filter.kind === "PROPERTY" ? row.realEstateId : row.economicRegistrationId}`;
    let target = targets.get(key);
    if (!target) { target = { key, taxpayerId: row.taxpayerId, taxpayer: row.taxpayer.company?.corporateName ?? row.taxpayer.person?.fullName ?? row.taxpayerId, document: row.taxpayer.company?.cnpj ?? row.taxpayer.person?.cpf ?? "", propertyId: filter.kind === "PROPERTY" ? row.realEstateId : null, registrationId: filter.kind === "ECONOMIC" ? row.economicRegistrationId : null, inscription: filter.kind === "PROPERTY" ? row.realEstate?.municipalInsc ?? "" : row.economicRegistration?.municipalInsc ?? "", address: filter.kind === "PROPERTY" && row.realEstate ? `${row.realEstate.streetName ?? ""}, ${row.realEstate.number ?? ""} ${row.realEstate.complement ?? ""}` : economicAddress, balance: "0.00", debts: [] }; targets.set(key, target); }
    target.balance = new Decimal(target.balance).plus(balance).toFixed(2);
    target.debts.push({ assessmentId: row.id, assessmentNumber: row.assessmentNumber ?? row.id, tax: row.tax.name, year: row.year, total: total.toFixed(2), paid: paid.toFixed(2), compensated: compensated.toFixed(2), balance: balance.toFixed(2), dueDate: due?.toISOString().slice(0, 10) ?? null, guideId: guide?.id ?? null, guideNumber: guide?.guideNumber ?? null, barcode: guide?.barcode ?? null, bankRegistered: bank.status === "REGISTERED" && typeof bank.registrationId === "string", guideAmount: guide?.totalValueDecimal?.toFixed(2) ?? null });
  }
  const selected = [...targets.values()].filter(row => new Decimal(row.balance).gte(filter.minimumBalance)).sort((a, b) => a.key.localeCompare(b.key));
  const fingerprint = createHash("sha256").update(JSON.stringify(selected)).digest("hex"); return { targets: selected, fingerprint };
}

export async function issueDebtNoticeBatch(connection: DatabaseConnection, actor: TaxActor, raw: { filter: z.input<typeof debtNoticeFilterSchema>; expectedFingerprint: string; type: "NOTICE" | "WARNING"; title: string; body: string; legalBasis: string; includeBankSlip: boolean; reason: string }) {
  const input = z.object({ filter: debtNoticeFilterSchema, expectedFingerprint: z.string().length(64), type: z.enum(["NOTICE", "WARNING"]), title: z.string().trim().min(1).max(240), body: z.string().trim().min(1).max(12000), legalBasis: z.string().trim().min(1).max(4000), includeBankSlip: z.boolean(), reason: z.string().trim().min(1).max(4000) }).parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const initial = await selectDebtNoticeTargets(tx, actor, input.filter);
    if (!initial.targets.length || initial.targets.length > 500) throw new Error("Selecione entre 1 e 500 destinatários. Refine os filtros.");
    const ids = [...new Set(initial.targets.flatMap(row => row.debts.map(debt => debt.assessmentId)))].sort(); for (const id of ids) await tx.select({ id: taxAssessments.id }).from(taxAssessments).where(eq(taxAssessments.id, id)).for("update");
    const selected = await selectDebtNoticeTargets(tx, actor, input.filter); if (selected.fingerprint !== input.expectedFingerprint) throw new Error("Débitos ou seleção alterados. Refaça a prévia.");
    if (input.includeBankSlip && selected.targets.some(row => row.debts.some(debt => !debt.bankRegistered || !debt.barcode || !/^\d{44}$/.test(debt.barcode)))) throw new Error("O boleto exige DAM de saldo integral com código bancário registrado. Concilie o convênio e o registro bancário das guias selecionadas.");
    const batchId = randomUUID(); const noticeIds = [];
    for (const target of selected.targets) {
      const id = randomUUID();
      await insertDebtRegistry(tx, { entityType: "DEBT_NOTICE", entityId: id, category: "DEBT_NOTICE_ISSUANCE", title: input.title, actorUsuarioId: actor.usuarioId, source: "DEBT_NOTICE_BATCH", data: { governmentEntityId: input.filter.governmentEntityId, budgetUnitId: input.filter.budgetUnitId, batchId, type: input.type, title: input.title, body: input.body, legalBasis: input.legalBasis, includeBankSlip: input.includeBankSlip, target, issuedAt: new Date().toISOString(), reason: input.reason } }); noticeIds.push(id);
      if (target.propertyId || target.registrationId) await insertDebtRegistry(tx, { entityType: target.propertyId ? "REAL_ESTATE" : "ECONOMIC_REGISTRATION", entityId: target.propertyId ?? target.registrationId!, category: "DEBT_NOTICE_REFERENCE", title: input.title, actorUsuarioId: actor.usuarioId, data: { governmentEntityId: input.filter.governmentEntityId, budgetUnitId: input.filter.budgetUnitId, noticeId: id, batchId } });
    }
    await insertDebtRegistry(tx, { entityType: "DEBT_NOTICE_BATCH", entityId: batchId, category: "DEBT_NOTICE_BATCH", title: input.title, actorUsuarioId: actor.usuarioId, data: { governmentEntityId: input.filter.governmentEntityId, budgetUnitId: input.filter.budgetUnitId, filter: input.filter, fingerprint: selected.fingerprint, noticeIds, reason: input.reason } });
    await insertDebtAudit(tx, { action: "ISSUE_DEBT_NOTICES", entityType: "DEBT_NOTICE_BATCH", entityId: batchId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { filter: input.filter, fingerprint: selected.fingerprint, noticeIds, includeBankSlip: input.includeBankSlip, reason: input.reason } }); return { batchId, noticeIds };
  }, { isolationLevel: "serializable", timeoutMs: 120000 });
}

export async function cancelDebtNotice(connection: DatabaseConnection, actor: TaxActor, raw: { noticeId: string; reason: string }) {
  const input = z.object({ noticeId: z.string().min(1), reason: z.string().trim().min(1).max(4000) }).parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`DEBT_NOTICE:${input.noticeId}`},0))::text`);
    const notice = requiredDebtRow((await tx.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "DEBT_NOTICE"), eq(taxRegistryEntries.entityId, input.noticeId), eq(taxRegistryEntries.category, "DEBT_NOTICE_ISSUANCE"))).limit(1))[0]); const data = taxScopeSnapshot(notice.data);
    await authorize(tx, actor, { governmentEntityId: String(data.governmentEntityId), budgetUnitId: String(data.budgetUnitId) });
    if ((await tx.select({ id: taxRegistryEntries.id }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "DEBT_NOTICE"), eq(taxRegistryEntries.entityId, input.noticeId), eq(taxRegistryEntries.category, "DEBT_NOTICE_CANCELLATION"))).limit(1)).length) throw new Error("Notificação já cancelada.");
    const entry = await insertDebtRegistry(tx, { entityType: "DEBT_NOTICE", entityId: input.noticeId, category: "DEBT_NOTICE_CANCELLATION", title: "Cancelamento da notificação", actorUsuarioId: actor.usuarioId, data: { governmentEntityId: data.governmentEntityId, budgetUnitId: data.budgetUnitId, issuanceId: notice.id, reason: input.reason } });
    await insertDebtAudit(tx, { action: "CANCEL_DEBT_NOTICE", entityType: "DEBT_NOTICE", entityId: input.noticeId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { issuanceId: notice.id, reason: input.reason } }); return entry;
  }, { isolationLevel: "serializable", timeoutMs: 5000 });
}
