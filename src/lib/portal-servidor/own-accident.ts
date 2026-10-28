import { db } from "@/db/client";
import { findActivePortalEmployee } from "@/db/repositories/portal-servidor/identity";
import { findOwnAccident, readOwnAccidentMilestones } from "@/db/repositories/portal-servidor/accidents";
import { AccessError, type AppContext } from "@/lib/platform/tenant-context";

export async function readOwnAccident(context: AppContext, id: string) {
  const employeeId = context.user.employeeId;
  const database = context.database ?? db;
  if (!employeeId || !await findActivePortalEmployee(database, employeeId)) throw new AccessError("Acesso funcional indisponível.", 403);
  const cat = await findOwnAccident(database, employeeId, id);
  if (!cat) throw new AccessError("Comunicação indisponível.", 404);
  const [state] = await readOwnAccidentMilestones(database, employeeId, [cat.id]);
  // The employee sees processing milestones, never clinical opinions or internal investigations.
  return { id: cat.id, occurredAt: cat.occurredAt, createdAt: cat.createdAt, kind: cat.kind, employeeName: cat.snapshot.employeeName || "", registration: cat.snapshot.registration || "", unitName: cat.snapshot.unitName || "", description: String(cat.data.description || ""), status: state?.status ?? "COMUNICADA" };
}

export async function ownAccidentStates(context: AppContext, ids: string[]) {
  if (!ids.length || !context.user.employeeId) return [];
  return readOwnAccidentMilestones(context.database ?? db, context.user.employeeId, ids);
}
