import { and, asc, count, eq, getTableColumns, ilike, or } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { materials } from "../../schema/assets-stock";
import { healthMaterialProfiles as profiles, healthDcbSubstances as substances, healthCatmatUnitMappings as mappings } from "../../schema/health-pharmacy";
import { medicines } from "../../schema/health-prescriptions";
import { pharmacyIds, pharmacyPageNumber } from "./common";

export async function readPharmacyCatalogPage(db: DatabaseExecutor, search: { q: string; list: string; page?: string }) {
  const where = and(eq(materials.isActive, true), eq(profiles.isActive, true), search.list === "RENAME" ? eq(profiles.renameMember, true) : search.list === "REMUME" ? eq(profiles.remumeMember, true) : undefined,
    search.q.trim() ? or(ilike(materials.code, `%${search.q.trim()}%`), ilike(materials.name, `%${search.q.trim()}%`), ilike(profiles.catmatCode, `%${search.q.trim()}%`)) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(materials).innerJoin(profiles, eq(profiles.materialId, materials.id)).where(where);
  const page = pharmacyPageNumber(search.page, total);
  const [rows, substanceRows] = await Promise.all([
    db.select({ ...getTableColumns(materials), medicine: medicines, profile: profiles, dcbSubstance: substances }).from(materials).innerJoin(profiles, eq(profiles.materialId, materials.id)).leftJoin(medicines, eq(medicines.materialId, materials.id)).leftJoin(substances, eq(substances.id, profiles.dcbSubstanceId)).where(where).orderBy(asc(materials.name), asc(materials.id)).limit(20).offset((page - 1) * 20),
    db.select().from(substances).where(eq(substances.isActive, true)).orderBy(asc(substances.name)),
  ]);
  const unitMappings = await db.select().from(mappings).where(pharmacyIds(mappings.profileId, rows.map(row => row.profile.id)));
  return { total, page, substances: substanceRows, products: rows.map(({ profile, dcbSubstance, ...row }) => ({ ...row, healthProfile: { ...profile, dcbSubstance, catmatUnitMappings: unitMappings.filter(mapping => mapping.profileId === profile.id) } })) };
}
