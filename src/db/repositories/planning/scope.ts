import { sql, type SQLWrapper } from "drizzle-orm";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import type { PlanningContext } from "@/lib/planejamento/access";
import { planningInstruments, planningLines } from "@/db/schema/planning-budget";

export function planningEntityScope(context: PlanningContext, entityId: SQLWrapper) {
  const units = isSystemAdministrator(context.user) ? sql`TRUE` : sql`EXISTS (SELECT 1 FROM "PlanningEntityUnit" eu WHERE eu."governmentEntityId" = ge.id AND eu."budgetUnitId" = ANY(${sql.param(context.user.allowedBudgetUnitIds)}::text[]))`;
  return sql`EXISTS (SELECT 1 FROM "GovernmentEntity" ge JOIN "PlanningEntityScope" es ON es."governmentEntityId" = ge.id WHERE ge.id = ${entityId} AND ge.status = 'ATIVA' AND es.jurisdiction = ${context.jurisdiction} AND es."isActive" AND ${units})`;
}
export function planningInstrumentScope(context: PlanningContext, instrumentId: SQLWrapper = planningInstruments.id) {
  return sql`EXISTS (SELECT 1 FROM "PlanningInstrument" scoped_piece WHERE scoped_piece.id = ${instrumentId} AND ${planningEntityScope(context, sql`scoped_piece."governmentEntityId"`)})`;
}
export function planningUnitScope(context: PlanningContext, unitId: SQLWrapper) {
  const units = isSystemAdministrator(context.user) ? sql`TRUE` : sql`${unitId} = ANY(${sql.param(context.user.allowedBudgetUnitIds)}::text[])`;
  return sql`${units} AND EXISTS (SELECT 1 FROM "PlanningEntityUnit" scoped_unit WHERE scoped_unit."budgetUnitId" = ${unitId} AND ${planningEntityScope(context, sql`scoped_unit."governmentEntityId"`)})`;
}
export function planningLineScope(context: PlanningContext) {
  return sql`${planningInstrumentScope(context, planningLines.instrumentId)} AND ${planningUnitScope(context, planningLines.budgetUnitId)}`;
}
