import { and, asc, desc, eq, ilike, inArray, isNotNull, like, ne, or, sql, type SQL } from "drizzle-orm";
import { alias, type PgTable } from "drizzle-orm/pg-core";
import type { MasterDataCatalog } from "@/app/app-domain/cadastros/master-data-types";
import type { MasterDataPageData } from "@/lib/contracts/master-data";
import type { DatabaseExecutor } from "../../transaction";
import { people } from "../../schema/people";
import { addresses, companies } from "../../schema/registry";
import { administrativeUnits, departments, employees, secretariats } from "../../schema/administration";
import { cities, neighborhoods, states, streets } from "../../schema/localities";
import { bankBranches, banks, catalogItems, costCenters, currencies, families, familyMembers, governmentEntities, healthCbos, legalReportSigners, legalTexts, legalTextVersions, taxes } from "../../schema/master-data";

const PAGE_SIZE = 20;
const dateValue = (value: Date | null) => value?.toISOString().slice(0, 10) || "";
const options = (rows: { id: string; label: string }[]) => rows.map(row => ({ value: row.id, label: row.label }));

async function countRows(db: DatabaseExecutor, table: PgTable, where?: SQL): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(table).where(where);
  return row.count;
}

async function personOptions(db: DatabaseExecutor) {
  return options(await db.select({ id: people.id, label: people.fullName }).from(people).where(ne(people.status, "Inativo")).orderBy(asc(people.fullName)).limit(500));
}
async function entityOptions(db: DatabaseExecutor, ordered = true) {
  const query = db.select({ id: governmentEntities.id, label: governmentEntities.name }).from(governmentEntities).where(eq(governmentEntities.status, "ATIVA"));
  return options(await (ordered ? query.orderBy(asc(governmentEntities.name)) : query));
}
async function cityOptions(db: DatabaseExecutor) {
  const rows = await db.select({ id: cities.id, name: cities.name, uf: states.uf }).from(cities).innerJoin(states, eq(cities.stateId, states.id)).where(eq(cities.status, "ATIVA")).orderBy(asc(cities.name));
  return options(rows.map(row => ({ id: row.id, label: `${row.name}/${row.uf}` })));
}

export async function loadMasterDataPage(db: DatabaseExecutor, catalog: MasterDataCatalog, query: string, page: number): Promise<MasterDataPageData> {
  const offset = (page - 1) * PAGE_SIZE;
  const pattern = `%${query}%`;
  switch (catalog) {
    case "families": {
      const where = query ? or(ilike(families.code, pattern), sql`EXISTS (SELECT 1 FROM "Person" p WHERE p.id=${families.responsiblePersonId} AND p."fullName" ILIKE ${pattern})`) : undefined;
      const [records, total, persons] = await Promise.all([
        db.select({ record: families, responsible: people.fullName }).from(families).leftJoin(people, eq(families.responsiblePersonId, people.id)).where(where).orderBy(desc(families.updatedAt)).offset(offset).limit(PAGE_SIZE),
        countRows(db, families, where), personOptions(db),
      ]);
      const ids = records.map(row => row.record.id);
      const members = ids.length ? await db.select({ familyId: familyMembers.familyId, personId: familyMembers.personId, fullName: people.fullName }).from(familyMembers).innerJoin(people, eq(familyMembers.personId, people.id)).where(and(inArray(familyMembers.familyId, ids), eq(familyMembers.status, "ATIVO"))) : [];
      const socialAddresses = ids.length ? await db.execute<{ familyId: string; streetName: string | null; number: string | null }>(sql`SELECT s."masterFamilyId" AS "familyId", a."streetName", a.number FROM "SocialFamily" s JOIN ${addresses} a ON a.id=s."addressId" WHERE s."masterFamilyId" IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`) : { rows: [] };
      return { total, options: { people: persons }, rows: records.map(({ record, responsible }) => {
        const group = members.filter(member => member.familyId === record.id);
        const address = socialAddresses.rows.find(row => row.familyId === record.id);
        return { id: record.id, active: record.status === "ATIVA", values: { code: record.code || "", responsiblePersonId: record.responsiblePersonId || "", responsible: responsible || "-", memberIds: group.map(member => member.personId), members: group.map(member => member.fullName).join(", "), address: address ? `${address.streetName || ""}, ${address.number || ""}` : "-", status: record.status } };
      }) };
    }
    case "entities": {
      const parent = alias(governmentEntities, "entityParent");
      const where = query ? or(ilike(governmentEntities.code, pattern), ilike(governmentEntities.name, pattern)) : undefined;
      const [records, total, parents, companyRows] = await Promise.all([
        db.select({ record: governmentEntities, parent: parent.name, company: companies.corporateName }).from(governmentEntities).leftJoin(parent, eq(governmentEntities.parentId, parent.id)).leftJoin(companies, eq(governmentEntities.companyId, companies.id)).where(where).orderBy(asc(governmentEntities.name)).offset(offset).limit(PAGE_SIZE),
        countRows(db, governmentEntities, where), entityOptions(db),
        db.select({ id: companies.id, label: companies.corporateName }).from(companies).where(eq(companies.status, "Ativo")).orderBy(asc(companies.corporateName)).limit(500),
      ]);
      return { total, options: { parents, companies: options(companyRows) }, rows: records.map(({ record, parent, company }) => ({ id: record.id, active: record.status === "ATIVA", values: { code: record.code, name: record.name, type: record.type, cnpj: record.cnpj || "", companyId: record.companyId || "", company: company || "-", parentId: record.parentId || "", parent: parent || "-" } })) };
    }
    case "costCenters": {
      const parent = alias(costCenters, "costCenterParent");
      const where = query ? or(ilike(costCenters.code, pattern), ilike(costCenters.name, pattern)) : undefined;
      const [records, total, parents, entities, secretariatRows, departmentRows, unitRows] = await Promise.all([
        db.select({ record: costCenters, parent: parent.name, entity: governmentEntities.name, secretariat: secretariats.name }).from(costCenters).leftJoin(parent, eq(costCenters.parentId, parent.id)).leftJoin(governmentEntities, eq(costCenters.governmentEntityId, governmentEntities.id)).leftJoin(secretariats, eq(costCenters.secretariatId, secretariats.id)).where(where).orderBy(asc(costCenters.code)).offset(offset).limit(PAGE_SIZE),
        countRows(db, costCenters, where),
        db.select({ id: costCenters.id, label: costCenters.name }).from(costCenters).where(eq(costCenters.isActive, true)), entityOptions(db, false),
        db.select({ id: secretariats.id, label: secretariats.name }).from(secretariats).where(eq(secretariats.isActive, true)),
        db.select({ id: departments.id, label: departments.name }).from(departments).where(eq(departments.isActive, true)),
        db.select({ id: administrativeUnits.id, label: administrativeUnits.name }).from(administrativeUnits).where(eq(administrativeUnits.isActive, true)),
      ]);
      return { total, options: { parents: options(parents), entities, secretariats: options(secretariatRows), departments: options(departmentRows), units: options(unitRows) }, rows: records.map(({ record, parent, entity, secretariat }) => ({ id: record.id, active: record.isActive, values: { code: record.code, name: record.name, description: record.description || "", parentId: record.parentId || "", parent: parent || "-", governmentEntityId: record.governmentEntityId || "", entity: entity || "-", secretariatId: record.secretariatId || "", secretariat: secretariat || "-", departmentId: record.departmentId || "", administrativeUnitId: record.administrativeUnitId || "" } })) };
    }
    case "cities": {
      const where = query ? or(ilike(cities.name, pattern), like(cities.ibgeCode, pattern)) : undefined;
      const [records, total, stateRows] = await Promise.all([
        db.select({ record: cities, uf: states.uf, state: states.name }).from(cities).innerJoin(states, eq(cities.stateId, states.id)).where(where).orderBy(asc(cities.name)).offset(offset).limit(PAGE_SIZE),
        countRows(db, cities, where), db.select({ id: states.id, uf: states.uf, name: states.name }).from(states).where(eq(states.status, "ATIVO")).orderBy(asc(states.name)),
      ]);
      return { total, options: { states: options(stateRows.map(row => ({ id: row.id, label: `${row.uf} - ${row.name}` }))) }, rows: records.map(({ record, uf, state }) => ({ id: record.id, active: record.status === "ATIVA", values: { name: record.name, ibgeCode: record.ibgeCode, stateId: record.stateId, state: `${uf} - ${state}` } })) };
    }
    case "neighborhoods": {
      const where = query ? ilike(neighborhoods.name, pattern) : undefined;
      const [records, total, cityRows] = await Promise.all([
        db.select({ record: neighborhoods, city: cities.name }).from(neighborhoods).leftJoin(cities, eq(neighborhoods.cityId, cities.id)).where(where).orderBy(asc(neighborhoods.name)).offset(offset).limit(PAGE_SIZE), countRows(db, neighborhoods, where), cityOptions(db),
      ]);
      return { total, options: { cities: cityRows }, rows: records.map(({ record, city }) => ({ id: record.id, active: record.status === "Ativo", values: { name: record.name, type: record.type, cityId: record.cityId || "", city: city || record.city, adminRegion: record.adminRegion || "", notes: record.notes || "" } })) };
    }
    case "streets": {
      const where = query ? ilike(streets.name, pattern) : undefined;
      const [records, total, cityRows, neighborhoodRows] = await Promise.all([
        db.select({ record: streets, city: cities.name, neighborhood: neighborhoods.name }).from(streets).leftJoin(cities, eq(streets.cityId, cities.id)).leftJoin(neighborhoods, eq(streets.neighborhoodId, neighborhoods.id)).where(where).orderBy(asc(streets.name)).offset(offset).limit(PAGE_SIZE), countRows(db, streets, where), cityOptions(db),
        db.select({ id: neighborhoods.id, label: neighborhoods.name }).from(neighborhoods).where(and(isNotNull(neighborhoods.cityId), eq(neighborhoods.status, "Ativo"))).orderBy(asc(neighborhoods.name)).limit(1000),
      ]);
      return { total, options: { cities: cityRows, neighborhoods: options(neighborhoodRows) }, rows: records.map(({ record, city, neighborhood }) => ({ id: record.id, active: record.status === "Ativo", values: { name: record.name, type: record.type, zipCode: record.zipCode || "", cityId: record.cityId || "", city: city || record.city, neighborhoodId: record.neighborhoodId || "", neighborhood: neighborhood || "-" } })) };
    }
    case "banks": {
      const where = query ? or(ilike(banks.name, pattern), like(banks.compe, pattern), like(banks.ispb, pattern)) : undefined;
      const [records, total] = await Promise.all([db.select().from(banks).where(where).orderBy(asc(banks.compe)).offset(offset).limit(PAGE_SIZE), countRows(db, banks, where)]);
      return { total, options: {}, rows: records.map(record => ({ id: record.id, active: record.status === "ATIVO", values: { compe: record.compe, ispb: record.ispb, name: record.name, shortName: record.shortName } })) };
    }
    case "branches": {
      const where = query ? or(ilike(bankBranches.name, pattern), like(bankBranches.code, pattern)) : undefined;
      const [records, total, bankRows, cityRows] = await Promise.all([
        db.select({ record: bankBranches, bank: banks.shortName, city: cities.name }).from(bankBranches).innerJoin(banks, eq(bankBranches.bankId, banks.id)).leftJoin(cities, eq(bankBranches.cityId, cities.id)).where(where).orderBy(asc(banks.name), asc(bankBranches.code)).offset(offset).limit(PAGE_SIZE), countRows(db, bankBranches, where),
        db.select({ id: banks.id, compe: banks.compe, shortName: banks.shortName }).from(banks).where(eq(banks.status, "ATIVO")).orderBy(asc(banks.name)),
        db.select({ id: cities.id, label: cities.name }).from(cities).where(eq(cities.status, "ATIVA")).orderBy(asc(cities.name)),
      ]);
      return { total, options: { banks: options(bankRows.map(row => ({ id: row.id, label: `${row.compe} - ${row.shortName}` }))), cities: options(cityRows) }, rows: records.map(({ record, bank, city }) => ({ id: record.id, active: record.status === "ATIVA", values: { bankId: record.bankId, bank, code: record.code, name: record.name, cnpj: record.cnpj || "", cityId: record.cityId || "", city: city || "-" } })) };
    }
    case "taxes": {
      const where = query ? or(ilike(taxes.name, pattern), ilike(taxes.code, pattern)) : undefined;
      const [records, total] = await Promise.all([db.select().from(taxes).where(where).orderBy(asc(taxes.name)).offset(offset).limit(PAGE_SIZE), countRows(db, taxes, where)]);
      return { total, options: {}, rows: records.map(record => ({ id: record.id, active: record.isActive, values: { code: record.code || "", name: record.name, taxType: record.taxType, governmentLevel: record.governmentLevel || "", revenueNature: record.revenueNature || "", effectiveFrom: dateValue(record.effectiveFrom), effectiveUntil: dateValue(record.effectiveUntil), description: record.description || "" } })) };
    }
    case "currencies": {
      const where = query ? or(ilike(currencies.name, pattern), ilike(currencies.isoCode, pattern)) : undefined;
      const [records, total] = await Promise.all([db.select().from(currencies).where(where).orderBy(desc(currencies.isDefault), asc(currencies.isoCode)).offset(offset).limit(PAGE_SIZE), countRows(db, currencies, where)]);
      return { total, options: {}, rows: records.map(record => ({ id: record.id, active: record.status === "ATIVA", values: { isoCode: record.isoCode, name: record.name, symbol: record.symbol, decimalPlaces: String(record.decimalPlaces), isDefault: record.isDefault } })) };
    }
    case "products": {
      const where = query ? or(ilike(catalogItems.name, pattern), ilike(catalogItems.code, pattern)) : undefined;
      const [records, total] = await Promise.all([db.select().from(catalogItems).where(where).orderBy(asc(catalogItems.name)).offset(offset).limit(PAGE_SIZE), countRows(db, catalogItems, where)]);
      return { total, options: {}, rows: records.map(record => ({ id: record.id, active: record.isActive, values: { code: record.code || "", name: record.name, description: record.description || "", unit: record.unit, category: record.category || "", productKind: record.productKind, specification: record.specification || "", externalCode: record.externalCode || "" } })) };
    }
    case "cbos": {
      const where = query ? or(ilike(healthCbos.description, pattern), like(healthCbos.code, pattern)) : undefined;
      const [records, total] = await Promise.all([db.select().from(healthCbos).where(where).orderBy(asc(healthCbos.code)).offset(offset).limit(PAGE_SIZE), countRows(db, healthCbos, where)]);
      return { total, options: {}, rows: records.map(record => ({ id: record.id, active: record.isActive, values: { code: record.code, description: record.description } })) };
    }
    case "signers": {
      const where = query ? ilike(legalReportSigners.signingRole, pattern) : undefined;
      const [records, total, persons, employeeRows, entities] = await Promise.all([
        db.select({ record: legalReportSigners, person: people.fullName, employee: employees.name, entity: governmentEntities.name }).from(legalReportSigners).leftJoin(people, eq(legalReportSigners.personId, people.id)).leftJoin(employees, eq(legalReportSigners.employeeId, employees.id)).leftJoin(governmentEntities, eq(legalReportSigners.governmentEntityId, governmentEntities.id)).where(where).orderBy(asc(legalReportSigners.signatureOrder), desc(legalReportSigners.createdAt)).offset(offset).limit(PAGE_SIZE),
        countRows(db, legalReportSigners, where), personOptions(db), db.select({ id: employees.id, label: employees.name }).from(employees).where(eq(employees.isActive, true)).orderBy(asc(employees.name)).limit(500), entityOptions(db),
      ]);
      return { total, options: { people: persons, employees: options(employeeRows), entities }, rows: records.map(({ record, person, employee, entity }) => ({ id: record.id, active: record.status === "ATIVO", values: { personId: record.personId || "", employeeId: record.employeeId || "", signer: person || employee || "-", governmentEntityId: record.governmentEntityId || "", entity: entity || "-", signingRole: record.signingRole, reportTypes: record.reportTypes, signatureOrder: String(record.signatureOrder), effectiveFrom: dateValue(record.effectiveFrom), effectiveUntil: dateValue(record.effectiveUntil) } })) };
    }
    case "legalTexts": {
      const where = query ? or(ilike(legalTexts.number, pattern), ilike(legalTexts.summary, pattern)) : undefined;
      const latest = db.select({ legalTextId: legalTextVersions.legalTextId, content: legalTextVersions.content, versionNumber: legalTextVersions.versionNumber }).from(legalTextVersions).where(sql`${legalTextVersions.versionNumber} = (SELECT max(v."versionNumber") FROM "LegalTextVersion" v WHERE v."legalTextId"=${legalTextVersions.legalTextId})`).as("latestVersion");
      const [records, total, entities] = await Promise.all([
        db.select({ record: legalTexts, entity: governmentEntities.name, content: latest.content, version: latest.versionNumber }).from(legalTexts).leftJoin(governmentEntities, eq(legalTexts.governmentEntityId, governmentEntities.id)).leftJoin(latest, eq(latest.legalTextId, legalTexts.id)).where(where).orderBy(desc(legalTexts.updatedAt)).offset(offset).limit(PAGE_SIZE), countRows(db, legalTexts, where), entityOptions(db),
      ]);
      return { total, options: { entities }, rows: records.map(({ record, entity, content, version }) => ({ id: record.id, active: record.status === "VIGENTE", values: { type: record.type, number: record.number, summary: record.summary, governmentLevel: record.governmentLevel, issuingBody: record.issuingBody, publicationDate: dateValue(record.publicationDate), effectiveFrom: dateValue(record.effectiveFrom), effectiveUntil: dateValue(record.effectiveUntil), governmentEntityId: record.governmentEntityId || "", entity: entity || "-", content: content || "", version: String(version || 0) } })) };
    }
  }
}
