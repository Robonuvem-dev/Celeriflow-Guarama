import { Prisma, type PrismaClient } from "@prisma/client";
import type { TaxActor } from "./index";
import { assertPropertyCadastralAccess } from "./property-access";
import { taxScopeSnapshot } from "./scope";

/** Totals use current, explicit unit/land links in one municipal origin. */
export async function readPropertyStructure(db: PrismaClient, actor: TaxActor, propertyId: string) {
  return db.$transaction(async tx => {
    const { property, profile, scope } = await assertPropertyCadastralAccess(tx, actor, propertyId);
    if (!profile || typeof scope.governmentEntityId !== "string" || typeof scope.budgetUnitId !== "string") return null;
    const entries = await tx.taxRegistryEntry.findMany({ where: { entityType: "REAL_ESTATE", category: "PROPERTY_PROFILE", AND: [{ data: { path: ["governmentEntityId"], equals: scope.governmentEntityId } }, { data: { path: ["budgetUnitId"], equals: scope.budgetUnitId } }] }, orderBy: { version: "desc" } });
    const latest = new Map<string, typeof entries[number]>(); for (const entry of entries) if (!latest.has(entry.entityId)) latest.set(entry.entityId, entry);
    const landId = scope.kind === "Terreno" ? property.id : scope.kind === "Unidade" && typeof scope.parentId === "string" ? scope.parentId : null;
    if (!landId || taxScopeSnapshot(latest.get(landId)?.data).kind !== "Terreno") return null;
    const unitIds = [...latest.values()].filter(entry => { const data = taxScopeSnapshot(entry.data); return data.kind === "Unidade" && data.parentId === landId; }).map(entry => entry.entityId);
    const rows = await tx.realEstate.findMany({ where: { id: { in: [landId, ...unitIds] } }, select: { id: true, municipalInsc: true, registration: true, builtArea: true, status: true }, orderBy: { municipalInsc: "asc" } });
    const land = rows.find(row => row.id === landId); if (!land) return null;
    const units = rows.filter(row => row.id !== landId && !["Inativo", "Baixado", "Remembrado", "Desmembrado"].includes(row.status));
    const complete = units.every(row => row.builtArea !== null && Number.isFinite(row.builtArea) && row.builtArea >= 0);
    const total = complete ? units.reduce((sum, row) => sum.plus(String(row.builtArea)), new Prisma.Decimal(0)).toFixed(6) : null;
    return { land: { id: land.id, inscription: land.municipalInsc ?? land.registration ?? land.id }, totalUnitBuiltArea: total, units: units.map(row => ({ id: row.id, inscription: row.municipalInsc ?? row.registration ?? row.id, builtArea: row.builtArea, mode: taxScopeSnapshot(latest.get(row.id)?.data).unitMode === "ENGLOBADA" ? "Englobada" : "Autônoma" })) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
