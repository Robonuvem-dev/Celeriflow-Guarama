import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { fleetTrips, fleetUnits } from "../../schema/fleet";

export async function readDriverFleetOptions(database: DatabaseExecutor, departmentId: string, driverId: string) {
  const units = await database.select({ id: fleetUnits.id, name: fleetUnits.name, code: fleetUnits.code })
    .from(fleetUnits).where(and(eq(fleetUnits.departmentId, departmentId), eq(fleetUnits.status, "ATIVO"), inArray(fleetUnits.category, ["VEICULO", "MAQUINA"]))).orderBy(fleetUnits.code);
  const trips = await database.select({ id: fleetTrips.id, unitId: fleetTrips.unitId, destination: fleetTrips.destination })
    .from(fleetTrips).where(and(eq(fleetTrips.driverId, driverId), isNull(fleetTrips.returnedAt)));
  return { units, trips };
}
