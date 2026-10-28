import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { Decimal } from "../../decimal";

const amount = (value: string | null) => value === null ? null : new Decimal(value);
const ids = (values: string[]) => sql.join(values.map(id => sql`${id}`), sql`,`);

export async function listAvailabilitySources(db: DatabaseExecutor, selected?: string[]) {
  if (selected && !selected.length) return [];
  return (await db.execute<{ id: string; code: string; name: string }>(sql`SELECT id,code,name FROM "ResourceSource" ${selected ? sql`WHERE id IN (${ids(selected)})` : sql``} ORDER BY code`)).rows;
}
export async function listAvailabilityCashPositions(db: DatabaseExecutor, unitIds: string[]) {
  if (!unitIds.length) return { cashSources: [], redistributionSources: [] };
  const [cash, redistributions] = await Promise.all([
    db.execute<{ bankAccountId: string; resourceSourceId: string | null }>(sql`SELECT DISTINCT m."bankAccountId",m."resourceSourceId" FROM "TreasuryMovement" m JOIN "BankAccount" b ON b.id=m."bankAccountId" WHERE b."budgetUnitId" IN (${ids(unitIds)}) AND m.status='Confirmado'`),
    db.execute<{ bankAccountId: string; destinationResourceSourceId: string }>(sql`SELECT r."bankAccountId",s."destinationResourceSourceId" FROM "RevenueResourceRedistribution" s JOIN "Revenue" r ON r.id=s."revenueId" JOIN "BankAccount" b ON b.id=r."bankAccountId" WHERE b."budgetUnitId" IN (${ids(unitIds)})`),
  ]);
  return { cashSources: cash.rows, redistributionSources: redistributions.rows };
}
export async function listAvailabilityCommitments(db: DatabaseExecutor, financialYearId: string, unitIds: string[]) {
  if (!unitIds.length) return [];
  const rows = (await db.execute<{ id: string; valueDecimal: string | null; resourceSourceId: string }>(sql`SELECT c.id,c."valueDecimal"::text,a."resourceSourceId" FROM "Commitment" c JOIN "BudgetAppropriation" a ON a.id=c."appropriationId" WHERE c.status IN ('Emitido','Liquidado','Pago') AND a."financialYearId"=${financialYearId} AND a."budgetUnitId" IN (${ids(unitIds)})`)).rows;
  if (!rows.length) return [];
  const keys = ids(rows.map(row => row.id));
  const [movements, payments] = await Promise.all([
    db.execute<{ commitmentId: string; type: string; valueDecimal: string }>(sql`SELECT "commitmentId",type,"valueDecimal"::text FROM "CommitmentMovement" WHERE "commitmentId" IN (${keys})`),
    db.execute<{ commitmentId: string; valueDecimal: string | null }>(sql`SELECT "commitmentId","valueDecimal"::text FROM "Payment" WHERE "commitmentId" IN (${keys}) AND status='Paga'`),
  ]);
  return rows.map(row => ({ id: row.id, valueDecimal: amount(row.valueDecimal), appropriation: { resourceSourceId: row.resourceSourceId }, movements: movements.rows.filter(movement => movement.commitmentId === row.id).map(movement => ({ type: movement.type, valueDecimal: new Decimal(movement.valueDecimal) })), payments: payments.rows.filter(payment => payment.commitmentId === row.id).map(payment => ({ valueDecimal: amount(payment.valueDecimal) })) }));
}
export async function listAvailabilityPayables(db: DatabaseExecutor, year: number, unitIds: string[]) {
  if (!unitIds.length) return [];
  const rows = (await db.execute<{ id: string; valueDecimal: string; resourceSourceId: string }>(sql`SELECT p.id,p."valueDecimal"::text,a."resourceSourceId" FROM "PayableCarryForward" p
    JOIN "FinancialYear" y ON y.id=p."financialYearId" JOIN "FinancialYear" o ON o.id=p."originFinancialYearId"
    JOIN "Commitment" c ON c.id=p."commitmentId" JOIN "BudgetAppropriation" a ON a.id=c."appropriationId"
    LEFT JOIN "PayableCarryForward" s ON s."previousPayableCarryForwardId"=p.id
    WHERE p.status IN ('PENDENTE','PAGAMENTO_PARCIAL_RASTREADO','PAGO_RASTREADO') AND (s.id IS NULL OR s.status='TRANSPORTE_DESMOVIMENTADO')
    AND o.year<${year} AND y.year<=${year} AND a."budgetUnitId" IN (${ids(unitIds)})`)).rows;
  if (!rows.length) return [];
  const keys = ids(rows.map(row => row.id));
  const [payments, events] = await Promise.all([
    db.execute<{ payableCarryForwardId: string; valueDecimal: string | null }>(sql`SELECT "payableCarryForwardId","valueDecimal"::text FROM "Payment" WHERE "payableCarryForwardId" IN (${keys}) AND status='Paga'`),
    db.execute<{ payableCarryForwardId: string; valueDecimal: string | null }>(sql`SELECT e."payableCarryForwardId",e."valueDecimal"::text FROM "PayableCarryForwardEvent" e JOIN "Payment" p ON p.id=e."paymentId" WHERE e."payableCarryForwardId" IN (${keys}) AND e.action='PAGAMENTO_RASTREADO' AND p.status='Paga' AND p."payableCarryForwardId" IS NULL`),
  ]);
  return rows.map(row => ({ id: row.id, valueDecimal: new Decimal(row.valueDecimal), commitment: { appropriation: { resourceSourceId: row.resourceSourceId } }, nativePayments: payments.rows.filter(payment => payment.payableCarryForwardId === row.id).map(payment => ({ valueDecimal: amount(payment.valueDecimal) })), events: events.rows.filter(event => event.payableCarryForwardId === row.id).map(event => ({ valueDecimal: amount(event.valueDecimal) })) }));
}
