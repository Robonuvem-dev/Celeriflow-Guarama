import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { fleetControlEvents, fleetDrivers, fleetTrips } from "@/db/schema/fleet";
import { employees } from "@/db/schema/administration";
import { citizenRegistryIdentities } from "@/db/schema/citizen-access";
import { people } from "@/db/schema/people";
import { fleetDatabase, fleetJson } from "@/db/repositories/fleet/records";
import { getCurrentTenantContext } from "@/lib/platform/tenant-context";
import { FleetControlError, lockFleetResources } from "./control-access";
import { stableFleetHash } from "./control-policy";
import { arriveFleetTrip, departFleetTrip } from "./control-motion";
import type { FleetScope } from "./service";

export async function getFleetDriverPortal() {
  const context = await getCurrentTenantContext();
  const db = fleetDatabase(context);
  const employee = context.user.employeeId ? (await db.select({ id: employees.id, personId: employees.personId, departmentId: employees.departmentId }).from(employees).where(and(eq(employees.id, context.user.employeeId), eq(employees.isActive, true))).limit(1))[0] : null;
  const identity = employee?.personId ? { personId: employee.personId } : (await db.select({ personId: citizenRegistryIdentities.personId }).from(citizenRegistryIdentities).innerJoin(people, eq(people.id, citizenRegistryIdentities.personId)).where(and(eq(citizenRegistryIdentities.usuarioId, context.user.id), isNull(citizenRegistryIdentities.revokedAt), eq(people.status, "Ativo"))).limit(1))[0];
  const driver = identity?.personId ? (await db.select().from(fleetDrivers).where(and(eq(fleetDrivers.personId, identity.personId), eq(fleetDrivers.active, true), employee ? eq(fleetDrivers.employeeId, employee.id) : eq(fleetDrivers.outsourced, true))).limit(1))[0] : null;
  const departmentId = employee?.departmentId || driver?.departmentId;
  if (!driver || !departmentId) throw new FleetControlError("Conta sem vínculo canônico de motorista ativo.");
  const scope: FleetScope = { actorId: context.user.id, employeeId: employee?.id || null, departmentId, administrator: false, canIssueStock: false, canReadAssets: false };
  return { context, driver, scope };
}
export async function operateFleetDriverPortal(requestId: string, operation: "depart" | "arrive", data: Record<string, unknown>) {
  const access = await getFleetDriverPortal(), payload = operation === "depart" ? { ...data, driverId: access.driver.id } : data;
  return withDatabaseTransaction(databaseConnection, async (tx) => {
    await lockFleetResources(tx, [`REQUEST:${requestId}`]);
    const hash = stableFleetHash({ operation, payload }), [previous] = await tx.select().from(fleetControlEvents).where(eq(fleetControlEvents.requestId, requestId)).limit(1);
    if (previous) { if (previous.actorId !== access.context.user.id || previous.payloadHash !== hash || previous.targetType !== "TRIP" || !(await tx.select({ id: fleetTrips.id }).from(fleetTrips).where(and(eq(fleetTrips.id, previous.targetId), eq(fleetTrips.driverId, access.driver.id))).limit(1)).length) throw new FleetControlError("Confirmação não autorizada."); return { recorded: true }; }
    if (operation === "arrive" && !(await tx.select({ id: fleetTrips.id }).from(fleetTrips).where(and(eq(fleetTrips.id, String(data.tripId || "")), eq(fleetTrips.driverId, access.driver.id))).limit(1)).length) throw new FleetControlError("Saída não pertence ao motorista autenticado.");
    const result = operation === "depart" ? await departFleetTrip(tx, access.scope, payload) : await arriveFleetTrip(tx, access.scope, payload);
    await tx.insert(fleetControlEvents).values({ requestId, actorId: access.context.user.id, payloadHash: hash, operation: `DRIVER_${operation}`, targetType: "TRIP", targetId: result.id, unitId: result.unitId, snapshot: fleetJson(payload) });
    return { recorded: true };
  }, { isolationLevel: "serializable", timeoutMs: 30000 });
}
