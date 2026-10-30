import { and, desc, eq, ilike, or } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { employees, roles } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { centralRecords, centralSigners } from "@/db/schema/signature-central";
import type { CentralOrigin, CentralSignerKind } from "@/lib/contracts/signature-central";

export async function findCentralOrigins(db: DatabaseExecutor, kind: CentralSignerKind, query: string, id?: string): Promise<CentralOrigin[]> {
  if (kind === "SERVIDOR") {
    const rows = await db.select({ employee: employees, role: roles.name }).from(employees).leftJoin(roles, eq(employees.roleId, roles.id))
      .where(and(eq(employees.isActive, true), id ? eq(employees.id, id) : or(ilike(employees.name, `%${query}%`), ilike(employees.cpf, `%${query}%`))))
      .orderBy(employees.name, employees.id).limit(20);
    return rows.map(({ employee: e, role }) => ({ id: e.id, kind, name: e.name, role: role ?? "", documentId: e.cpf ?? "", phone: e.phone ?? "", mobile: "", email: e.email ?? "", employeeId: e.id, personId: e.personId }));
  }
  const rows = await db.select().from(people).where(and(eq(people.status, "Ativo"), id ? eq(people.id, id) : or(ilike(people.fullName, `%${query}%`), ilike(people.cpf, `%${query}%`))))
    .orderBy(people.fullName, people.id).limit(20);
  return rows.map(p => ({ id: p.id, kind, name: p.fullName, role: p.profession ?? "", documentId: p.cpf ?? "", phone: p.phonePrimary ?? "", mobile: p.whatsapp ?? p.phoneSecondary ?? "", email: p.email ?? "", employeeId: null, personId: p.id }));
}
export function centralOwnerFilter(userId: string, admin: boolean) {
  return admin ? undefined : or(eq(centralRecords.actorId, userId), eq(centralRecords.accountUserId, userId));
}
export async function findCentralRecords(db: DatabaseExecutor, userId: string, admin: boolean) {
  return db.select().from(centralRecords).where(and(eq(centralRecords.status, "SIGNED"), centralOwnerFilter(userId, admin))).orderBy(desc(centralRecords.signedAt), desc(centralRecords.id));
}
export async function findCentralSigner(db: DatabaseExecutor, id: string) { return (await db.select().from(centralSigners).where(eq(centralSigners.id, id)))[0]; }
