import "server-only";
import { Prisma } from "@prisma/client";
import { getCurrentTenantContext } from "@/lib/platform/tenant-context";
import { FleetControlError, lockFleetResources } from "./control-access";
import { stableFleetHash } from "./control-policy";
import { arriveFleetTrip, departFleetTrip } from "./control-motion";
import type { FleetScope } from "./service";

export async function getFleetDriverPortal() {
  const context = await getCurrentTenantContext();
  const employee = context.user.employeeId ? await context.prisma.employee.findFirst({ where: { id: context.user.employeeId, isActive: true }, select: { id: true, personId: true, departmentId: true } }) : null;
  const identity = employee?.personId ? { personId: employee.personId } : await context.prisma.citizenRegistryIdentity.findFirst({ where: { usuarioId: context.user.id, revokedAt: null, person: { status: "Ativo" } }, select: { personId: true } });
  const driver = identity?.personId ? await context.prisma.fleetDriver.findFirst({ where: { personId: identity.personId, active: true, ...(employee ? { employeeId: employee.id } : { outsourced: true }) } }) : null;
  const departmentId = employee?.departmentId || driver?.departmentId;
  if (!driver || !departmentId) throw new FleetControlError("Conta sem vínculo canônico de motorista ativo.");
  const scope: FleetScope = { actorId: context.user.id, employeeId: employee?.id || null, departmentId, administrator: false, canIssueStock: false, canReadAssets: false };
  return { context, driver, scope };
}
export async function operateFleetDriverPortal(requestId: string, operation: "depart" | "arrive", data: Record<string, unknown>) {
  const access = await getFleetDriverPortal(), payload = operation === "depart" ? { ...data, driverId: access.driver.id } : data;
  return access.context.prisma.$transaction(async (tx) => {
    await lockFleetResources(tx, [`REQUEST:${requestId}`]);
    const hash = stableFleetHash({ operation, payload }), previous = await tx.fleetControlEvent.findUnique({ where: { requestId } });
    if (previous) { if (previous.actorId !== access.context.user.id || previous.payloadHash !== hash || previous.targetType !== "TRIP" || !await tx.fleetTrip.findFirst({ where: { id: previous.targetId, driverId: access.driver.id }, select: { id: true } })) throw new FleetControlError("Confirmação não autorizada."); return { recorded: true }; }
    if (operation === "arrive" && !await tx.fleetTrip.findFirst({ where: { id: String(data.tripId || ""), driverId: access.driver.id }, select: { id: true } })) throw new FleetControlError("Saída não pertence ao motorista autenticado.");
    const result = operation === "depart" ? await departFleetTrip(tx, access.scope, payload) : await arriveFleetTrip(tx, access.scope, payload);
    await tx.fleetControlEvent.create({ data: { requestId, actorId: access.context.user.id, payloadHash: hash, operation: `DRIVER_${operation}`, targetType: "TRIP", targetId: result.id, unitId: result.unitId, snapshot: payload as Prisma.InputJsonValue } });
    return { recorded: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
