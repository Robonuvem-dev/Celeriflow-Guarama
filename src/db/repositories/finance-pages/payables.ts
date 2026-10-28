import { and, desc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import type { FinancePageAccess } from "@/lib/contracts/finance-pages";
import { payableCarryForwards, payableCarryForwardEvents, payableCarryForwardSettlementLinks } from "../../schema/finance-payables";
import { financialYears } from "../../schema/finance-years";
import { governmentEntities } from "../../schema/master-data";
import { budgetAppropriations, commitments } from "../../schema/finance-budget";
import { settlements } from "../../schema/finance-settlements";
import { payments } from "../../schema/finance-payments";
import { companies, suppliers } from "../../schema/registry";
import { people } from "../../schema/people";
import { users } from "../../schema/identity";
import { employees } from "../../schema/administration";

export async function listFinancePageRapAuthors(db: DatabaseExecutor) {
  return db.select({ id: employees.id, person: { fullName: people.fullName } }).from(employees)
    .leftJoin(people, eq(people.id, employees.personId)).where(eq(employees.isActive, true)).orderBy(desc(employees.createdAt)).limit(300);
}

export async function listFinancePagePayables(db: DatabaseExecutor, access: FinancePageAccess = {}) {
  const originYear = alias(financialYears, "finance_page_origin_year"), originEntity = alias(governmentEntities, "finance_page_origin_entity");
  const rows = await db.select({ payable: payableCarryForwards, financialYear: financialYears, originFinancialYear: originYear,
    entity: { name: governmentEntities.name }, originEntity: { name: originEntity.name },
    commitment: { id: commitments.id, number: commitments.number, history: commitments.history },
    appropriation: { budgetUnitId: budgetAppropriations.budgetUnitId, resourceSourceId: budgetAppropriations.resourceSourceId },
    company: { corporateName: companies.corporateName }, person: { fullName: people.fullName } })
    .from(payableCarryForwards).innerJoin(financialYears, eq(financialYears.id, payableCarryForwards.financialYearId))
    .innerJoin(originYear, eq(originYear.id, payableCarryForwards.originFinancialYearId)).leftJoin(governmentEntities, eq(governmentEntities.id, financialYears.governmentEntityId))
    .leftJoin(originEntity, eq(originEntity.id, originYear.governmentEntityId)).innerJoin(commitments, eq(commitments.id, payableCarryForwards.commitmentId))
    .innerJoin(budgetAppropriations, eq(budgetAppropriations.id, commitments.appropriationId)).innerJoin(suppliers, eq(suppliers.id, commitments.supplierId))
    .leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId))
    .where(access.allowedBudgetUnitIds ? inArray(budgetAppropriations.budgetUnitId, access.allowedBudgetUnitIds) : undefined)
    .orderBy(desc(originYear.year), desc(payableCarryForwards.createdAt)).limit(300);
  const ids = rows.map(row => row.payable.id);
  const previousIds = rows.flatMap(row => row.payable.previousPayableCarryForwardId ? [row.payable.previousPayableCarryForwardId] : []);
  const [neighbors, events, directSettlements, inherited] = await Promise.all([
    db.select({ id: payableCarryForwards.id, previousPayableCarryForwardId: payableCarryForwards.previousPayableCarryForwardId, financialYear: { year: financialYears.year } }).from(payableCarryForwards)
      .innerJoin(financialYears, eq(financialYears.id, payableCarryForwards.financialYearId)).where(or(inArray(payableCarryForwards.id, previousIds), inArray(payableCarryForwards.previousPayableCarryForwardId, ids))),
    db.select({ event: payableCarryForwardEvents, actorUsuario: { nome: users.nome }, payment: { orderNumber: payments.orderNumber } }).from(payableCarryForwardEvents)
      .innerJoin(users, eq(users.id, payableCarryForwardEvents.actorUsuarioId)).leftJoin(payments, eq(payments.id, payableCarryForwardEvents.paymentId))
      .where(inArray(payableCarryForwardEvents.payableCarryForwardId, ids)).orderBy(desc(payableCarryForwardEvents.createdAt)),
    db.select({ id: settlements.id, commitmentId: settlements.commitmentId, date: settlements.date, valueDecimal: settlements.valueDecimal, payableCarryForwardId: settlements.payableCarryForwardId }).from(settlements)
      .where(and(inArray(settlements.commitmentId, rows.map(row => row.commitment.id)), eq(settlements.status, "Liquidado"))),
    db.select({ link: payableCarryForwardSettlementLinks, sourceFinancialYear: { year: financialYears.year }, settlement: { id: settlements.id, date: settlements.date } }).from(payableCarryForwardSettlementLinks)
      .innerJoin(financialYears, eq(financialYears.id, payableCarryForwardSettlementLinks.sourceFinancialYearId)).innerJoin(settlements, eq(settlements.id, payableCarryForwardSettlementLinks.settlementId))
      .where(and(inArray(payableCarryForwardSettlementLinks.payableCarryForwardId, ids), eq(payableCarryForwardSettlementLinks.status, "ACTIVE"), eq(settlements.status, "Liquidado"))),
  ]);
  const inheritedPayments = await db.select({ settlementId: payments.settlementId, payableCarryForwardId: payments.payableCarryForwardId, valueDecimal: payments.valueDecimal }).from(payments)
    .where(and(inArray(payments.settlementId, inherited.map(row => row.settlement.id)), inArray(payments.status, ["Emitida", "Paga"])));
  return rows.map(({ payable, commitment, appropriation, company, person, financialYear, originFinancialYear, entity, originEntity }) => ({
    ...payable, financialYear: { ...financialYear, governmentEntity: entity }, originFinancialYear: { ...originFinancialYear, governmentEntity: originEntity },
    commitment: { ...commitment, appropriation, supplier: { company, person }, settlements: directSettlements.filter(row => row.commitmentId === commitment.id) },
    previousPayableCarryForward: neighbors.find(row => row.id === payable.previousPayableCarryForwardId) ?? null,
    successorPayableCarryForward: neighbors.find(row => row.previousPayableCarryForwardId === payable.id) ?? null,
    events: events.filter(row => row.event.payableCarryForwardId === payable.id).map(({ event, ...relations }) => ({ ...event, ...relations })),
    inheritedSettlements: inherited.filter(row => row.link.payableCarryForwardId === payable.id).map(({ link, sourceFinancialYear, settlement }) => ({ ...link, sourceFinancialYear,
      settlement: { ...settlement, payments: inheritedPayments.filter(row => row.settlementId === settlement.id) } })),
  }));
}
