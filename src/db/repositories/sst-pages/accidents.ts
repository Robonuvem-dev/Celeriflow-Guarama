import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { databaseTimestamp } from "@/db/temporal";
import { employees } from "@/db/schema/administration";
import type { SstPageOption } from "@/lib/contracts/sst-pages";

export async function searchSstAccidentEmployees(database: DatabaseExecutor, secretariatIds: string[], term: string): Promise<(SstPageOption & { registration: string | null })[]> {
  return database.select({ id: employees.id, name: employees.name, registration: employees.registration }).from(employees).where(and(eq(employees.isActive, true), ilike(employees.name, `%${term.trim()}%`), inArray(employees.secretariatId, secretariatIds))).orderBy(asc(employees.name), asc(employees.id)).limit(20);
}
export async function readSstAccidentClinicalOptions(database: DatabaseExecutor, id: string, unitId: string): Promise<{
  doctors: { id: string; fullName: string; council: string }[]; attendances: { id: string; createdAt: Date }[];
}> {
  const doctors = (await database.execute<{ id: string; fullName: string; council: string }>(sql`SELECT r."id",p."fullName",r."council" FROM "SstProfessionalRole" r JOIN "Person" p ON p."id"=r."personId" WHERE r."budgetUnitId"=${unitId} AND r."discipline"='MEDICINE' AND r."isActive" ORDER BY p."fullName",r."id"`)).rows;
  const attendances = (await database.execute<{ id: string; createdAt: string | Date }>(sql`SELECT "id","createdAt" FROM "SstCatEvidence" WHERE "catId"=${id} AND "kind"='ATTENDANCE' ORDER BY "createdAt" DESC,"id" DESC LIMIT 20`)).rows.map(row => ({ ...row, createdAt: databaseTimestamp(row.createdAt) }));
  return { doctors, attendances };
}
