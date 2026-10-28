import { eq, sql, type SQL } from "drizzle-orm";
import { Decimal } from "../../decimal";
import type { DatabaseExecutor } from "../../transaction";
import type { JsonValue } from "../../json";
import { suppliers, companies } from "../../schema/registry";
import { people } from "../../schema/people";
import { portalFirst, portalRows } from "./records";

export type PortalLeave = { id: string; employeeId: string; type: string; startDate: Date; endDate: Date; status: string; reason: string | null; createdAt: Date; updatedAt: Date };
export type PortalVacation = { id: string; employeeId: string; acquisitionStart: Date; acquisitionEnd: Date; enjoymentStart: Date | null; enjoymentEnd: Date | null; days: number; status: string; createdAt: Date; updatedAt: Date };
export type PortalRightEntry = { id: string; contractId: string; sourceKey: string; kind: string; periodStart: Date; periodEnd: Date; quantity: Decimal; amount: Decimal; details: JsonValue; actorId: string; createdAt: Date; contract: { registration: string } };
export async function portalRights(db: DatabaseExecutor, filter: SQL, order: SQL = sql`e."periodStart", e."createdAt",e.id`): Promise<PortalRightEntry[]> {
  const rows = await portalRows<Omit<PortalRightEntry, "quantity" | "amount" | "contract"> & { quantity: string; amount: string; registration: string }>(db, sql`SELECT e.*,c.registration FROM "HrRightEntry" e JOIN "HrEmploymentContract" c ON c.id=e."contractId" WHERE ${filter} ORDER BY ${order}`);
  return rows.map(({ registration, ...row }) => ({ ...row, quantity: new Decimal(row.quantity), amount: new Decimal(row.amount), contract: { registration } }));
}
export type PortalMovement = { id: string; contractId: string; sourceKey: string; startsAt: Date; endsAt: Date | null; amount: Decimal; contract: { registration: string } };
export async function portalMovements(db: DatabaseExecutor, filter: SQL): Promise<PortalMovement[]> {
  const rows = await portalRows<Omit<PortalMovement, "amount" | "contract"> & { amount: string; registration: string }>(db, sql`SELECT e.id,e."contractId",e."sourceKey",e."startsAt",e."endsAt",e.amount,c.registration FROM "HrMovement" e JOIN "HrEmploymentContract" c ON c.id=e."contractId" WHERE ${filter} ORDER BY e."startsAt",e.id`);
  return rows.map(({ registration, ...row }) => ({ ...row, amount: new Decimal(row.amount), contract: { registration } }));
}
export async function portalSupplier(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ supplier: suppliers, company: companies, person: people }).from(suppliers).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId)).where(sql`${suppliers.id}=${id} AND ${suppliers.status}='Ativo'`).limit(1);
  return row ? { ...row.supplier, company: row.company, person: row.person } : null;
}
export async function portalConsignmentReserve(db: DatabaseExecutor, employeeId: string, competence: Date, scope: string): Promise<Decimal | null> {
  const row = await portalFirst<{ amount: string | null }>(db, sql`SELECT sum(e.amount) AS amount FROM "HrConsignmentEntry" e JOIN "HrConsignmentInstallment" i ON i.id=e."installmentId" JOIN "HrConsignmentAgreement" a ON a.id=i."agreementId" JOIN "HrEmploymentContract" c ON c.id=a."contractId" WHERE i."competenceAt"=${competence} AND a.scope=${scope} AND c."employeeId"=${employeeId}`);
  return row?.amount === null || !row ? null : new Decimal(row.amount);
}
