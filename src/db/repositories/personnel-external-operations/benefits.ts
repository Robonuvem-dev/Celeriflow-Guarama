import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../transaction';
import { hrPayrollRubrics } from '../../schema/personnel-configuration';
import { externalBenefitAssignments as assignments, externalBenefitConfigurations as configurations, externalBenefitLeaves as leaves, externalBenefitVacations as vacations } from '../../schema/personnel-external-operations';

export function readActiveBenefitAssignments(db: DatabaseExecutor, employeeId: string, benefitConfigId: string) {
  return db.select({ id: assignments.id, customValue: assignments.customValue }).from(assignments).innerJoin(configurations, eq(configurations.id, assignments.benefitConfigId))
    .where(and(eq(assignments.employeeId, employeeId), eq(assignments.benefitConfigId, benefitConfigId), eq(assignments.status, 'Ativo'), eq(configurations.isActive, true)));
}
export async function findBenefitRubric(db: DatabaseExecutor, ruleSetId: string, code: string) {
  return (await db.select().from(hrPayrollRubrics).where(and(eq(hrPayrollRubrics.ruleSetId, ruleSetId), eq(hrPayrollRubrics.code, code), eq(hrPayrollRubrics.isActive, true))).limit(1))[0] ?? null;
}
export function readBenefitVacations(db: DatabaseExecutor, employeeId: string, period: { start: Date; end: Date }) {
  return db.select({ enjoymentStart: vacations.enjoymentStart, enjoymentEnd: vacations.enjoymentEnd }).from(vacations)
    .where(and(eq(vacations.employeeId, employeeId), inArray(vacations.status, ['Programada', 'Em gozo', 'Concluída']), lte(vacations.enjoymentStart, period.end), gte(vacations.enjoymentEnd, period.start)));
}
export function readBenefitLeaves(db: DatabaseExecutor, employeeId: string, types: string[], period: { start: Date; end: Date }) {
  return db.select({ startDate: leaves.startDate, endDate: leaves.endDate, type: leaves.type }).from(leaves)
    .where(and(eq(leaves.employeeId, employeeId), eq(leaves.status, 'Ativa'), inArray(leaves.type, types), lte(leaves.startDate, period.end), gte(leaves.endDate, period.start)));
}
