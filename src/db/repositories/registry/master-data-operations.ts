import { and, desc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { MasterDataValidationError, assertNoSelfReference } from "@/lib/cadastros/master-data-service";
import type { MasterDataCatalog } from "@/app/app-domain/cadastros/master-data-types";
import type { BankBranchInput, BankInput, CatalogItemInput, CityInput, CostCenterInput, CurrencyInput, FamilyInput, GovernmentEntityInput, LegalReportSignerInput, LegalTextInput, NeighborhoodInput, StreetInput, TaxInput } from "@/lib/contracts/master-data";
import { PersistenceError } from "../../errors";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { people } from "../../schema/people";
import { companies } from "../../schema/registry";
import { administrativeUnits, departments, employees, secretariats } from "../../schema/administration";
import { cities, neighborhoods, states, streets } from "../../schema/localities";
import { bankBranches, banks, catalogItems, costCenters, currencies, families, familyMembers, governmentEntities, healthCbos, legalReportSigners, legalTexts, legalTextVersions, taxes } from "../../schema/master-data";

function requireId(rows: { id: string }[]): string {
  if (!rows[0]) throw new PersistenceError("not-found", "O registro não foi encontrado.");
  return rows[0].id;
}

export async function assertHierarchy(db: DatabaseExecutor, catalog: "entity" | "costCenter", id: string | null, parentId: string | null): Promise<void> {
  if (!parentId) return;
  if (id) assertNoSelfReference(id, parentId);
  const visited = new Set<string>();
  let cursor: string | null = parentId;
  while (cursor) {
    if (cursor === id || visited.has(cursor)) throw new MasterDataValidationError("A hierarquia informada contém um ciclo.");
    visited.add(cursor);
    const rows: { parentId: string | null }[] = catalog === "entity"
      ? await db.select({ parentId: governmentEntities.parentId }).from(governmentEntities).where(and(eq(governmentEntities.id, cursor), eq(governmentEntities.status, "ATIVA"))).limit(1)
      : await db.select({ parentId: costCenters.parentId }).from(costCenters).where(and(eq(costCenters.id, cursor), eq(costCenters.isActive, true))).limit(1);
    if (!rows[0]) throw new MasterDataValidationError("O registro pai não existe ou está inativo.");
    cursor = rows[0].parentId;
  }
}

export async function countActivePeople(db: DatabaseExecutor, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(people).where(and(inArray(people.id, ids), ne(people.status, "Inativo")));
  return row.count;
}

export async function findActiveReference(db: DatabaseExecutor, kind: "entity" | "secretariat" | "state" | "bank" | "person" | "employee", id: string): Promise<{ id: string } | null> {
  switch (kind) {
    case "entity": return (await db.select({ id: governmentEntities.id }).from(governmentEntities).where(and(eq(governmentEntities.id, id), eq(governmentEntities.status, "ATIVA"))).limit(1))[0] ?? null;
    case "secretariat": return (await db.select({ id: secretariats.id }).from(secretariats).where(and(eq(secretariats.id, id), eq(secretariats.isActive, true))).limit(1))[0] ?? null;
    case "state": return (await db.select({ id: states.id }).from(states).where(and(eq(states.id, id), eq(states.status, "ATIVO"))).limit(1))[0] ?? null;
    case "bank": return (await db.select({ id: banks.id }).from(banks).where(and(eq(banks.id, id), eq(banks.status, "ATIVO"))).limit(1))[0] ?? null;
    case "person": return (await db.select({ id: people.id }).from(people).where(and(eq(people.id, id), ne(people.status, "Inativo"))).limit(1))[0] ?? null;
    case "employee": return (await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, id), eq(employees.isActive, true))).limit(1))[0] ?? null;
  }
}

export async function findActiveCompany(db: DatabaseExecutor, id: string): Promise<{ id: string; cnpj: string } | null> {
  const [row] = await db.select({ id: companies.id, cnpj: companies.cnpj }).from(companies).where(and(eq(companies.id, id), eq(companies.status, "Ativo"))).limit(1);
  return row ?? null;
}

export async function findActiveDepartment(db: DatabaseExecutor, id: string): Promise<{ id: string; secretariatId: string } | null> {
  const [row] = await db.select({ id: departments.id, secretariatId: departments.secretariatId }).from(departments).where(and(eq(departments.id, id), eq(departments.isActive, true))).limit(1);
  return row ?? null;
}

export async function findActiveUnit(db: DatabaseExecutor, id: string): Promise<{ id: string; secretariatId: string } | null> {
  const [row] = await db.select({ id: administrativeUnits.id, secretariatId: administrativeUnits.secretariatId }).from(administrativeUnits).where(and(eq(administrativeUnits.id, id), eq(administrativeUnits.isActive, true))).limit(1);
  return row ?? null;
}

export async function findActiveCity(db: DatabaseExecutor, id: string): Promise<{ id: string; name: string; state: { uf: string } } | null> {
  const [row] = await db.select({ id: cities.id, name: cities.name, state: { uf: states.uf } }).from(cities).innerJoin(states, eq(cities.stateId, states.id)).where(and(eq(cities.id, id), eq(cities.status, "ATIVA"))).limit(1);
  return row ?? null;
}

export async function findActiveCityNeighborhood(db: DatabaseExecutor, id: string, cityId: string): Promise<{ id: string } | null> {
  const [row] = await db.select({ id: neighborhoods.id }).from(neighborhoods).where(and(eq(neighborhoods.id, id), eq(neighborhoods.cityId, cityId), eq(neighborhoods.status, "Ativo"))).limit(1);
  return row ?? null;
}

export async function saveFamily(tx: DatabaseTransaction, id: string | null, input: FamilyInput, memberIds: string[]): Promise<string> {
  const familyId = id ? requireId(await tx.update(families).set(input).where(eq(families.id, id)).returning({ id: families.id })) : requireId(await tx.insert(families).values(input).returning({ id: families.id }));
  for (const personId of memberIds) {
    const data = { status: "ATIVO", leftAt: null, isRepresentative: personId === input.responsiblePersonId };
    await tx.insert(familyMembers).values({ familyId, personId, ...data }).onConflictDoUpdate({ target: [familyMembers.familyId, familyMembers.personId], set: { ...data, updatedAt: new Date() } });
  }
  await tx.update(familyMembers).set({ status: "INATIVO", leftAt: new Date(), isRepresentative: false }).where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.status, "ATIVO"), memberIds.length ? notInArray(familyMembers.personId, memberIds) : undefined));
  return familyId;
}

export async function saveGovernmentEntity(db: DatabaseExecutor, id: string | null, input: GovernmentEntityInput): Promise<string> {
  return id ? requireId(await db.update(governmentEntities).set(input).where(eq(governmentEntities.id, id)).returning({ id: governmentEntities.id })) : requireId(await db.insert(governmentEntities).values(input).returning({ id: governmentEntities.id }));
}
export async function saveCostCenter(db: DatabaseExecutor, id: string | null, input: CostCenterInput): Promise<string> {
  return id ? requireId(await db.update(costCenters).set(input).where(eq(costCenters.id, id)).returning({ id: costCenters.id })) : requireId(await db.insert(costCenters).values(input).returning({ id: costCenters.id }));
}
export async function saveCity(db: DatabaseExecutor, id: string | null, input: CityInput): Promise<string> {
  return id ? requireId(await db.update(cities).set(input).where(eq(cities.id, id)).returning({ id: cities.id })) : requireId(await db.insert(cities).values(input).returning({ id: cities.id }));
}
export async function saveNeighborhood(db: DatabaseExecutor, id: string | null, input: NeighborhoodInput): Promise<string> {
  if (id) return requireId(await db.update(neighborhoods).set(input).where(eq(neighborhoods.id, id)).returning({ id: neighborhoods.id }));
  if (!input.cityId || !input.city || !input.state) throw new MasterDataValidationError("Cidade é obrigatória para novos bairros.");
  return requireId(await db.insert(neighborhoods).values({ ...input, cityId: input.cityId, city: input.city, state: input.state }).returning({ id: neighborhoods.id }));
}
export async function saveStreet(db: DatabaseExecutor, id: string | null, input: StreetInput): Promise<string> {
  if (id) return requireId(await db.update(streets).set(input).where(eq(streets.id, id)).returning({ id: streets.id }));
  if (!input.cityId || !input.city || !input.state) throw new MasterDataValidationError("Cidade é obrigatória para novos logradouros.");
  return requireId(await db.insert(streets).values({ ...input, cityId: input.cityId, city: input.city, state: input.state }).returning({ id: streets.id }));
}
export async function saveBank(db: DatabaseExecutor, id: string | null, input: BankInput): Promise<string> {
  return id ? requireId(await db.update(banks).set(input).where(eq(banks.id, id)).returning({ id: banks.id })) : requireId(await db.insert(banks).values(input).returning({ id: banks.id }));
}
export async function saveBankBranch(db: DatabaseExecutor, id: string | null, input: BankBranchInput): Promise<string> {
  return id ? requireId(await db.update(bankBranches).set(input).where(eq(bankBranches.id, id)).returning({ id: bankBranches.id })) : requireId(await db.insert(bankBranches).values(input).returning({ id: bankBranches.id }));
}
export async function saveTax(db: DatabaseExecutor, id: string | null, input: TaxInput): Promise<string> {
  return id ? requireId(await db.update(taxes).set(input).where(eq(taxes.id, id)).returning({ id: taxes.id })) : requireId(await db.insert(taxes).values(input).returning({ id: taxes.id }));
}
export async function saveCurrency(tx: DatabaseTransaction, id: string | null, input: CurrencyInput): Promise<string> {
  if (input.isDefault) await tx.update(currencies).set({ isDefault: false }).where(and(eq(currencies.isDefault, true), id ? ne(currencies.id, id) : undefined));
  return id ? requireId(await tx.update(currencies).set(input).where(eq(currencies.id, id)).returning({ id: currencies.id })) : requireId(await tx.insert(currencies).values(input).returning({ id: currencies.id }));
}
export async function saveCatalogItem(db: DatabaseExecutor, id: string | null, input: CatalogItemInput): Promise<string> {
  return id ? requireId(await db.update(catalogItems).set(input).where(eq(catalogItems.id, id)).returning({ id: catalogItems.id })) : requireId(await db.insert(catalogItems).values(input).returning({ id: catalogItems.id }));
}
export async function saveHealthCbo(db: DatabaseExecutor, id: string | null, input: { code: string; description: string }): Promise<string> {
  return id ? requireId(await db.update(healthCbos).set(input).where(eq(healthCbos.id, id)).returning({ id: healthCbos.id })) : requireId(await db.insert(healthCbos).values(input).returning({ id: healthCbos.id }));
}
export async function saveLegalReportSigner(db: DatabaseExecutor, id: string | null, input: LegalReportSignerInput): Promise<string> {
  return id ? requireId(await db.update(legalReportSigners).set(input).where(eq(legalReportSigners.id, id)).returning({ id: legalReportSigners.id })) : requireId(await db.insert(legalReportSigners).values(input).returning({ id: legalReportSigners.id }));
}
export async function saveLegalText(tx: DatabaseTransaction, id: string | null, input: LegalTextInput, content: string): Promise<string> {
  if (!id) {
    const targetId = requireId(await tx.insert(legalTexts).values(input).returning({ id: legalTexts.id }));
    await tx.insert(legalTextVersions).values({ legalTextId: targetId, versionNumber: 1, content, summary: input.summary, publicationDate: input.publicationDate, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil });
    return targetId;
  }
  const [current] = await tx.select({ id: legalTexts.id }).from(legalTexts).where(eq(legalTexts.id, id)).limit(1);
  if (!current) throw new MasterDataValidationError("Texto jurídico não encontrado.");
  const [latest] = await tx.select().from(legalTextVersions).where(eq(legalTextVersions.legalTextId, id)).orderBy(desc(legalTextVersions.versionNumber)).limit(1);
  await tx.update(legalTexts).set(input).where(eq(legalTexts.id, id));
  const changed = !latest || latest.content !== content || latest.summary !== input.summary || latest.publicationDate?.getTime() !== input.publicationDate?.getTime() || latest.effectiveFrom?.getTime() !== input.effectiveFrom?.getTime() || latest.effectiveUntil?.getTime() !== input.effectiveUntil?.getTime();
  if (changed) await tx.insert(legalTextVersions).values({ legalTextId: id, versionNumber: (latest?.versionNumber || 0) + 1, content, summary: input.summary, publicationDate: input.publicationDate, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil });
  return id;
}

export async function setMasterDataActive(db: DatabaseExecutor, catalog: MasterDataCatalog, id: string, active: boolean): Promise<void> {
  switch (catalog) {
    case "families": requireId(await db.update(families).set({ status: active ? "ATIVA" : "INATIVA" }).where(eq(families.id, id)).returning({ id: families.id })); break;
    case "entities": requireId(await db.update(governmentEntities).set({ status: active ? "ATIVA" : "INATIVA" }).where(eq(governmentEntities.id, id)).returning({ id: governmentEntities.id })); break;
    case "costCenters": requireId(await db.update(costCenters).set({ isActive: active }).where(eq(costCenters.id, id)).returning({ id: costCenters.id })); break;
    case "cities": requireId(await db.update(cities).set({ status: active ? "ATIVA" : "INATIVA" }).where(eq(cities.id, id)).returning({ id: cities.id })); break;
    case "neighborhoods": requireId(await db.update(neighborhoods).set({ status: active ? "Ativo" : "Inativo" }).where(eq(neighborhoods.id, id)).returning({ id: neighborhoods.id })); break;
    case "streets": requireId(await db.update(streets).set({ status: active ? "Ativo" : "Inativo" }).where(eq(streets.id, id)).returning({ id: streets.id })); break;
    case "banks": requireId(await db.update(banks).set({ status: active ? "ATIVO" : "INATIVO" }).where(eq(banks.id, id)).returning({ id: banks.id })); break;
    case "branches": requireId(await db.update(bankBranches).set({ status: active ? "ATIVA" : "INATIVA" }).where(eq(bankBranches.id, id)).returning({ id: bankBranches.id })); break;
    case "taxes": requireId(await db.update(taxes).set({ isActive: active }).where(eq(taxes.id, id)).returning({ id: taxes.id })); break;
    case "currencies": requireId(await db.update(currencies).set({ status: active ? "ATIVA" : "INATIVA", ...(!active ? { isDefault: false } : {}) }).where(eq(currencies.id, id)).returning({ id: currencies.id })); break;
    case "products": requireId(await db.update(catalogItems).set({ isActive: active }).where(eq(catalogItems.id, id)).returning({ id: catalogItems.id })); break;
    case "cbos": requireId(await db.update(healthCbos).set({ isActive: active }).where(eq(healthCbos.id, id)).returning({ id: healthCbos.id })); break;
    case "signers": requireId(await db.update(legalReportSigners).set({ status: active ? "ATIVO" : "INATIVO" }).where(eq(legalReportSigners.id, id)).returning({ id: legalReportSigners.id })); break;
    case "legalTexts": requireId(await db.update(legalTexts).set({ status: active ? "VIGENTE" : "INATIVO" }).where(eq(legalTexts.id, id)).returning({ id: legalTexts.id })); break;
  }
}
