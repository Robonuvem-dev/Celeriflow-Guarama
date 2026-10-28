import { and, asc, desc, eq, inArray, lt, lte, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import { publicCommitments, publicCommitmentMovements, publicSettlements, publicPayments, publicAppropriations, publicBudgetReservations, publicCarryForwards, publicCarryForwardEvents, publicBudgetUnits, publicExpenseNatures, publicResourceSources, publicPrograms, publicActions } from "../../schema/transparency-financial";
import { financialYears } from "../../schema/finance-years";
import { creditors } from "../../schema/finance-identity";
import { expenses } from "../../schema/finance-expenses";
import { suppliers, companies } from "../../schema/registry";
import { people } from "../../schema/people";
import { processes } from "../../schema/processes";
import { purchaseProcesses, procurementContracts } from "../../schema/procurement-core";
import { purchaseReceipts } from "../../schema/procurement-requests";
import { publicCovenants } from "../../schema/transparency-sources";
import { transparencyPlanningLines } from "../../schema/transparency-planning";

export function publicCommitmentScope(entityIds: string[]) {
  return sql`EXISTS(SELECT 1 FROM ${publicAppropriations} JOIN ${financialYears} ON ${financialYears.id}=${publicAppropriations.financialYearId} WHERE ${publicAppropriations.id}=${publicCommitments.appropriationId} AND ${inArray(financialYears.governmentEntityId, entityIds)})`;
}

export async function readPublicCommitments(db: DatabaseExecutor, condition: SQL | undefined, options: { limit: number; offset?: number; cutoff?: Date; deterministic?: boolean }) {
  const rows = await db.select({ commitment: publicCommitments, creditor: { name: creditors.name, document: creditors.document, personId: creditors.personId }, person: { fullName: people.fullName, cpf: people.cpf }, company: { corporateName: companies.corporateName, cnpj: companies.cnpj },
    appropriation: publicAppropriations, budgetUnit: publicBudgetUnits, resourceSource: publicResourceSources, expenseNature: publicExpenseNatures, programPPA: publicPrograms, actionPPA: publicActions, planningLine: { functionCode: transparencyPlanningLines.functionCode, subfunctionCode: transparencyPlanningLines.subfunctionCode },
    expense: { sourceModule: expenses.sourceModule, sourceType: expenses.sourceType }, process: { protocolNumber: processes.protocolNumber }, purchaseProcess: { number: purchaseProcesses.number, modality: purchaseProcesses.modality }, contract: { number: procurementContracts.number }, purchaseReceipt: { number: purchaseReceipts.number, receivedAt: purchaseReceipts.receivedAt }, covenant: { number: publicCovenants.number },
  }).from(publicCommitments).innerJoin(publicAppropriations, eq(publicAppropriations.id, publicCommitments.appropriationId))
    .innerJoin(publicBudgetUnits, eq(publicBudgetUnits.id, publicAppropriations.budgetUnitId)).innerJoin(publicResourceSources, eq(publicResourceSources.id, publicAppropriations.resourceSourceId)).innerJoin(publicExpenseNatures, eq(publicExpenseNatures.id, publicAppropriations.expenseNatureId))
    .leftJoin(publicPrograms, eq(publicPrograms.id, publicAppropriations.programPPAId)).leftJoin(publicActions, eq(publicActions.id, publicAppropriations.actionPPAId)).leftJoin(transparencyPlanningLines, eq(transparencyPlanningLines.appropriationId, publicAppropriations.id))
    .leftJoin(creditors, eq(creditors.id, publicCommitments.creditorId)).innerJoin(suppliers, eq(suppliers.id, publicCommitments.supplierId)).leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId))
    .leftJoin(publicBudgetReservations, eq(publicBudgetReservations.id, publicCommitments.reservationId)).leftJoin(expenses, eq(expenses.id, publicBudgetReservations.expenseId))
    .leftJoin(processes, eq(processes.id, publicCommitments.processId)).leftJoin(purchaseProcesses, eq(purchaseProcesses.id, publicCommitments.purchaseProcessId)).leftJoin(procurementContracts, eq(procurementContracts.id, publicCommitments.contractId)).leftJoin(purchaseReceipts, eq(purchaseReceipts.id, publicCommitments.purchaseReceiptId)).leftJoin(publicCovenants, eq(publicCovenants.id, publicCommitments.covenantId))
    .where(condition).orderBy(desc(publicCommitments.date), ...(options.deterministic ? [desc(publicCommitments.id)] : [])).limit(options.limit).offset(options.offset || 0);
  const ids = rows.map(row => row.commitment.id);
  const [movements, settlements, payments] = ids.length ? await Promise.all([
    db.select().from(publicCommitmentMovements).where(and(inArray(publicCommitmentMovements.commitmentId, ids), options.cutoff ? lt(publicCommitmentMovements.date, options.cutoff) : undefined)),
    db.select().from(publicSettlements).where(and(inArray(publicSettlements.commitmentId, ids), eq(publicSettlements.status, "Liquidado"), options.cutoff ? lt(publicSettlements.date, options.cutoff) : undefined)),
    db.select().from(publicPayments).where(and(inArray(publicPayments.commitmentId, ids), inArray(publicPayments.status, ["Paga", "Pago"]), options.cutoff ? lt(publicPayments.date, options.cutoff) : undefined)),
  ]) : [[], [], []];
  return rows.map(row => ({ ...row.commitment, creditor: row.creditor, supplier: { person: row.person, company: row.company }, appropriation: { ...row.appropriation, budgetUnit: row.budgetUnit, resourceSource: row.resourceSource, expenseNature: row.expenseNature, programPPA: row.programPPA, actionPPA: row.actionPPA, planningLine: row.planningLine },
    reservation: { expense: row.expense }, process: row.process, purchaseProcess: row.purchaseProcess, contract: row.contract, purchaseReceipt: row.purchaseReceipt, covenant: row.covenant,
    movements: movements.filter(item => item.commitmentId === row.commitment.id), settlements: settlements.filter(item => item.commitmentId === row.commitment.id), payments: payments.filter(item => item.commitmentId === row.commitment.id) }));
}

export async function readPublicCarryForwards(db: DatabaseExecutor, entityIds: string[], year: number) {
  const origin = alias(financialYears, "public_origin_year");
  const rows = await db.select({ carry: publicCarryForwards, originFinancialYear: { year: origin.year }, commitment: { number: publicCommitments.number }, creditor: { name: creditors.name }, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(publicCarryForwards)
    .innerJoin(financialYears, eq(financialYears.id, publicCarryForwards.financialYearId)).innerJoin(origin, eq(origin.id, publicCarryForwards.originFinancialYearId)).innerJoin(publicCommitments, eq(publicCommitments.id, publicCarryForwards.commitmentId))
    .leftJoin(creditors, eq(creditors.id, publicCommitments.creditorId)).innerJoin(suppliers, eq(suppliers.id, publicCommitments.supplierId)).leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId))
    .where(and(inArray(financialYears.governmentEntityId, entityIds), lte(financialYears.year, year), lt(origin.year, year), sql`NOT EXISTS(SELECT 1 FROM "PayableCarryForward" successor WHERE successor."previousPayableCarryForwardId"=${publicCarryForwards.id})`)).orderBy(asc(publicCarryForwards.id)).limit(20001);
  const events = rows.length ? await db.select({ event: publicCarryForwardEvents, payment: { status: publicPayments.status, date: publicPayments.date, value: publicPayments.value, valueDecimal: publicPayments.valueDecimal } }).from(publicCarryForwardEvents).leftJoin(publicPayments, eq(publicPayments.id, publicCarryForwardEvents.paymentId)).where(inArray(publicCarryForwardEvents.payableCarryForwardId, rows.map(row => row.carry.id))).orderBy(asc(publicCarryForwardEvents.createdAt)) : [];
  return rows.map(row => ({ ...row.carry, originFinancialYear: row.originFinancialYear, commitment: { ...row.commitment, creditor: row.creditor, supplier: { person: row.person, company: row.company } }, events: events.filter(item => item.event.payableCarryForwardId === row.carry.id).map(item => ({ ...item.event, payment: item.payment })) }));
}
