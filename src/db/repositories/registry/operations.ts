import { eq, sql } from "drizzle-orm";
import type { CompanyMutation, CompanyRecord, DocumentInput, DocumentRecord, PersonMutation, PersonRecord, RealEstateInput, RealEstateMutation, RealEstateRecord, SupplierMutation, SupplierRecord } from "@/lib/contracts/registry";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import { PersistenceError } from "../../errors";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { people } from "../../schema/people";
import { addresses, companies, documents, realEstates, suppliers, taxpayers } from "../../schema/registry";

function requireRow<T>(rows: T[]): T {
  if (!rows[0]) throw new PersistenceError("not-found", "Registro não encontrado.");
  return rows[0];
}

function hasChanges(input: object): boolean {
  return Object.values(input).some(value => value !== undefined);
}

export async function insertPersonWithAddress(tx: DatabaseTransaction, person: Pick<PersonRecord, "fullName" | "cpf" | "gender" | "raceColor" | "motherName" | "email" | "phonePrimary" | "birthDate" | "status">, address: { zipCode: string; streetName: string; number: string; complement: string | null }): Promise<PersonRecord> {
  const record = requireRow(await tx.insert(people).values(person).returning());
  await tx.insert(addresses).values({ ...address, personId: record.id, addressType: "Residencial" });
  return record;
}

export async function insertCompany(db: DatabaseExecutor, input: Pick<CompanyRecord, "corporateName" | "cnpj" | "tradeName" | "emailPrimary" | "phone" | "municipalInsc" | "companyType" | "status">): Promise<CompanyRecord> {
  return requireRow(await db.insert(companies).values(input).returning());
}

export async function findPersonIdentity(db: DatabaseExecutor, id: string): Promise<{ id: string; cpf: string | null } | null> {
  const [row] = await db.select({ id: people.id, cpf: people.cpf }).from(people).where(eq(people.id, id)).limit(1);
  return row ?? null;
}

export async function findCompanyIdentity(db: DatabaseExecutor, id: string): Promise<{ id: string; cnpj: string } | null> {
  const [row] = await db.select({ id: companies.id, cnpj: companies.cnpj }).from(companies).where(eq(companies.id, id)).limit(1);
  return row ?? null;
}

export async function updatePerson(db: DatabaseExecutor, id: string, input: PersonMutation): Promise<PersonRecord> {
  if (!hasChanges(input)) return requireRow(await db.select().from(people).where(eq(people.id, id)).limit(1));
  return requireRow(await db.update(people).set(input).where(eq(people.id, id)).returning());
}

export async function validatePersonTaxpayer(db: DatabaseExecutor, id: string, cpf?: string | null): Promise<void> {
  const identity = await findPersonIdentity(db, id);
  if (!identity) throw new PersistenceError("not-found", "Registro não encontrado.");
  requireValidCpf(cpf || identity.cpf);
}

export async function updateCompany(db: DatabaseExecutor, id: string, input: CompanyMutation): Promise<CompanyRecord> {
  if (!hasChanges(input)) return requireRow(await db.select().from(companies).where(eq(companies.id, id)).limit(1));
  return requireRow(await db.update(companies).set(input).where(eq(companies.id, id)).returning());
}

export async function setPersonTaxpayer(db: DatabaseExecutor, personId: string, enabled: boolean, municipalInsc: string | null): Promise<void> {
  if (!enabled) { await db.delete(taxpayers).where(eq(taxpayers.personId, personId)); return; }
  await db.insert(taxpayers).values({ personId, taxpayerType: "PF", municipalInsc })
    .onConflictDoUpdate({ target: taxpayers.personId, set: { municipalInsc, updatedAt: new Date() } });
}

export async function setCompanyTaxpayer(db: DatabaseExecutor, companyId: string, enabled: boolean, municipalInsc: string | null): Promise<void> {
  if (!enabled) { await db.delete(taxpayers).where(eq(taxpayers.companyId, companyId)); return; }
  await db.insert(taxpayers).values({ companyId, taxpayerType: "PJ", municipalInsc })
    .onConflictDoUpdate({ target: taxpayers.companyId, set: { municipalInsc, updatedAt: new Date() } });
}

export async function findSupplierByIdentity(db: DatabaseExecutor, input: { personId: string } | { companyId: string }): Promise<{ id: string } | null> {
  const [row] = await db.select({ id: suppliers.id }).from(suppliers).where("personId" in input ? eq(suppliers.personId, input.personId) : eq(suppliers.companyId, input.companyId)).limit(1);
  return row ?? null;
}

export async function insertSupplier(db: DatabaseExecutor, input: Pick<SupplierRecord, "personId" | "companyId" | "category" | "businessBranch" | "certificationsValidUntil" | "bankData" | "notes" | "status">): Promise<SupplierRecord> {
  return requireRow(await db.insert(suppliers).values(input).returning());
}

export async function findSupplierCompany(db: DatabaseExecutor, id: string): Promise<{ companyId: string | null } | null> {
  const [row] = await db.select({ companyId: suppliers.companyId }).from(suppliers).where(eq(suppliers.id, id)).limit(1);
  return row ?? null;
}

export async function updateSupplier(db: DatabaseExecutor, id: string, input: SupplierMutation): Promise<SupplierRecord> {
  // Prisma does not update @updatedAt for an empty data object.
  if (!hasChanges(input)) return requireRow(await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1));
  return requireRow(await db.update(suppliers).set(input).where(eq(suppliers.id, id)).returning());
}

export async function updatePropertyWithHistory(tx: DatabaseTransaction, actorId: string, id: string, input: RealEstateMutation): Promise<RealEstateRecord> {
  if (!actorId.trim()) throw new Error("Identifique o usuário da alteração imobiliária.");
  await tx.execute(sql`SELECT set_config('celeriflow.cadastral_actor', ${actorId}, true)`);
  if (!hasChanges(input)) return requireRow(await tx.select().from(realEstates).where(eq(realEstates.id, id)).limit(1));
  return requireRow(await tx.update(realEstates).set(input).where(eq(realEstates.id, id)).returning());
}

export async function insertPropertyWithHistory(tx: DatabaseTransaction, actorId: string, input: RealEstateInput): Promise<RealEstateRecord> {
  if (!actorId.trim()) throw new Error("Identifique o usuário da alteração imobiliária.");
  await tx.execute(sql`SELECT set_config('celeriflow.cadastral_actor', ${actorId}, true)`);
  return requireRow(await tx.insert(realEstates).values(input).returning());
}

export async function insertDocument(db: DatabaseExecutor, input: DocumentInput): Promise<DocumentRecord> {
  return requireRow(await db.insert(documents).values(input).returning());
}

export async function updateDocument(db: DatabaseExecutor, id: string, input: { title?: string; documentType?: string }): Promise<DocumentRecord> {
  if (!hasChanges(input)) return requireRow(await db.select().from(documents).where(eq(documents.id, id)).limit(1));
  return requireRow(await db.update(documents).set(input).where(eq(documents.id, id)).returning());
}

export async function deleteDocument(db: DatabaseExecutor, id: string): Promise<DocumentRecord> {
  return requireRow(await db.delete(documents).where(eq(documents.id, id)).returning());
}
