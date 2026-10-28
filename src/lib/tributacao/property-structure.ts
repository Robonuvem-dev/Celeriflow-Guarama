import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import { listMunicipalPropertyProfiles, listSelectedProperties, propertySelectionPredicate } from "@/db/repositories/tax-property/records";
import type { PropertyStructure } from "@/db/repositories/tax-property/contracts";
import type { TaxActor } from "./index";
import { assertPropertyCadastralAccess } from "./property-access";
import { taxScopeSnapshot } from "./scope";

/** Totals use current, explicit unit/land links in one municipal origin. */
export async function readPropertyStructure(connection: DatabaseConnection, actor: TaxActor, propertyId: string): Promise<PropertyStructure | null> {
  return withDatabaseTransaction(connection, tx => readPropertyStructureInTransaction(tx, actor, propertyId), { isolationLevel: "repeatable read" });
}

export async function readPropertyStructureInTransaction(tx: DatabaseTransaction, actor: TaxActor, propertyId: string): Promise<PropertyStructure | null> {
    const { property, profile, scope } = await assertPropertyCadastralAccess(tx, actor, propertyId);
    if (!profile || typeof scope.governmentEntityId !== "string" || typeof scope.budgetUnitId !== "string") return null;
    const entries = await listMunicipalPropertyProfiles(tx, scope.budgetUnitId, scope.governmentEntityId);
    const latest = new Map<string, typeof entries[number]>(); for (const entry of entries) if (!latest.has(entry.entityId)) latest.set(entry.entityId, entry);
    const landId = scope.kind === "Terreno" ? property.id : scope.kind === "Unidade" && typeof scope.parentId === "string" ? scope.parentId : null;
    if (!landId || taxScopeSnapshot(latest.get(landId)?.data).kind !== "Terreno") return null;
    const unitIds = [...latest.values()].filter(entry => { const data = taxScopeSnapshot(entry.data); return data.kind === "Unidade" && data.parentId === landId; }).map(entry => entry.entityId);
    const rows = await listSelectedProperties(tx, propertySelectionPredicate({}, [landId, ...unitIds]), "inscription");
    const land = rows.find(row => row.id === landId); if (!land) return null;
    const units = rows.filter(row => row.id !== landId && !["Inativo", "Baixado", "Remembrado", "Desmembrado"].includes(row.status));
    const complete = units.every(row => row.builtArea !== null && Number.isFinite(row.builtArea) && row.builtArea >= 0);
    const total = complete ? units.reduce((sum, row) => sum.plus(String(row.builtArea)), new Decimal(0)).toFixed(6) : null;
    return { land: { id: land.id, inscription: land.municipalInsc ?? land.registration ?? land.id }, totalUnitBuiltArea: total, units: units.map(row => ({ id: row.id, inscription: row.municipalInsc ?? row.registration ?? row.id, builtArea: row.builtArea, mode: taxScopeSnapshot(latest.get(row.id)?.data).unitMode === "ENGLOBADA" ? "Englobada" : "Autônoma" })) };
}
