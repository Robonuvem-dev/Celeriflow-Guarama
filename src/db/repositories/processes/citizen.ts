import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import { processes, processTypes, processSubjects, processMovements } from "../../schema/processes";
import { departments } from "../../schema/administration";
import { citizenProcessSelect } from "@/lib/portal-cidadao/policy";

export async function listCitizenProcesses(db: DatabaseExecutor, where: SQL | undefined, options: { limit: number; offset: number }) {
  return db.select(citizenProcessSelect).from(processes).innerJoin(processTypes, eq(processTypes.id, processes.processTypeId)).innerJoin(processSubjects, eq(processSubjects.id, processes.subjectId)).leftJoin(departments, eq(departments.id, processes.currentDepartmentId)).where(where).orderBy(desc(processes.createdAt), asc(processes.id)).limit(options.limit).offset(options.offset);
}
export async function readCitizenProcess(db: DatabaseExecutor, id: string, where: SQL) {
  const [item] = await listCitizenProcesses(db, and(eq(processes.id, id), where), { limit: 1, offset: 0 });
  if (!item) return null;
  const from = alias(departments, "citizen_from_department"), to = alias(departments, "citizen_to_department");
  const movements = await db.select({ id: processMovements.id, movedAt: processMovements.movedAt, receivedAt: processMovements.receivedAt, fromDepartment: { name: from.name }, toDepartment: { name: to.name } }).from(processMovements).leftJoin(from, eq(from.id, processMovements.fromDepartmentId)).innerJoin(to, eq(to.id, processMovements.toDepartmentId)).where(eq(processMovements.processId, id)).orderBy(asc(processMovements.movedAt), asc(processMovements.id));
  return { ...item, movements };
}
