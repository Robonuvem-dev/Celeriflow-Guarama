import { and, asc, desc, eq, getTableColumns, ilike, isNotNull } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import type { PharmacyPageUnits } from "../../../lib/contracts/health-pharmacy-pages";
import { healthCallPanels as panels, healthPanelCalls as calls } from "../../schema/health-regulation";
import { pharmacyRequests as requests } from "../../schema/health-pharmacy";
import { patients } from "../../schema/health-registration";
import { people } from "../../schema/people";
import { warehouses } from "../../schema/assets-stock";
import { pharmacyIds, pharmacyPatients, pharmacyUnits, pharmacyUnitScope } from "./common";

export async function readPharmacyCallsPage(db: DatabaseExecutor, units: PharmacyPageUnits, q: string) {
  const [panelRows, patientRows, requestRows, callRows, healthUnits] = await Promise.all([
    db.select().from(panels).where(and(eq(panels.isActive, true), pharmacyUnitScope(panels.unitId, units))).orderBy(asc(panels.unitId), asc(panels.sector)),
    pharmacyPatients(db, units, q, 200),
    db.select({ ...getTableColumns(requests), patientFullName: people.fullName, destinationWarehouse: warehouses }).from(requests).innerJoin(warehouses, eq(warehouses.id, requests.destinationWarehouseId)).innerJoin(patients, eq(patients.id, requests.patientId)).innerJoin(people, eq(people.id, patients.personId)).where(and(isNotNull(requests.patientId), pharmacyIds(requests.status, ["OPEN", "PARTIAL"]), pharmacyUnitScope(warehouses.healthUnitId, units), q ? ilike(people.fullName, `%${q}%`) : undefined)).orderBy(asc(requests.requestedAt)).limit(200),
    db.select({ ...getTableColumns(calls), panel: panels }).from(calls).innerJoin(panels, eq(panels.id, calls.panelId)).where(pharmacyUnitScope(panels.unitId, units)).orderBy(desc(calls.calledAt)).limit(20), pharmacyUnits(db, units),
  ]);
  return { panels: panelRows, patients: patientRows, requests: requestRows.map(({ patientFullName, ...row }) => ({ ...row, patient: { person: { fullName: patientFullName } } })), calls: callRows, healthUnits };
}
