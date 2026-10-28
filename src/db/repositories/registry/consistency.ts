import { eq, sql } from "drizzle-orm";
import { analyzeCanonicalIdentityIssues, type CanonicalIdentitySource, type IdentityIssue } from "@/lib/cadastros/canonical-identity-policy";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { people } from "../../schema/people";
import { companies, suppliers, taxpayers } from "../../schema/registry";
import { consistencyIssues, consistencyRuns } from "../../schema/master-data";

export async function readCanonicalDatabaseIdentityIssues(db: DatabaseExecutor): Promise<IdentityIssue[]> {
  const [personRows, companyRows, taxpayerRows, supplierRows, creditorResult] = await Promise.all([
    db.select({ id: people.id, cpf: people.cpf }).from(people),
    db.select({ id: companies.id, cnpj: companies.cnpj }).from(companies),
    db.select({ id: taxpayers.id, taxpayerType: taxpayers.taxpayerType, personId: taxpayers.personId, companyId: taxpayers.companyId }).from(taxpayers),
    db.select({ id: suppliers.id, personId: suppliers.personId, companyId: suppliers.companyId }).from(suppliers),
    db.execute<CanonicalIdentitySource["creditors"][number]>(sql`SELECT id, "personId", "companyId", "supplierId", document FROM "Creditor"`),
  ]);
  return analyzeCanonicalIdentityIssues({ persons: personRows, companies: companyRows, taxpayers: taxpayerRows, suppliers: supplierRows, creditors: creditorResult.rows });
}

export async function runMasterDataConsistency(tx: DatabaseTransaction): Promise<string> {
  const [run] = await tx.insert(consistencyRuns).values({ area: "CADASTROS", runType: "INTEGRIDADE_REFERENCIAL" }).returning({ id: consistencyRuns.id });
  const checks = await Promise.all([
    tx.execute<{ id: string }>(sql`SELECT id FROM "Employee" WHERE "personId" IS NULL`),
    tx.execute<{ id: string }>(sql`SELECT id FROM "BankAccount" WHERE "bankId" IS NULL`),
    tx.execute<{ id: string }>(sql`SELECT id FROM "Neighborhood" WHERE "cityId" IS NULL`),
    tx.execute<{ id: string }>(sql`SELECT id FROM "Street" WHERE "cityId" IS NULL`),
    tx.execute<{ id: string }>(sql`SELECT id FROM "HealthProfessional" WHERE cbo IS NOT NULL AND "cboId" IS NULL`),
    tx.execute<{ id: string }>(sql`SELECT id FROM "SocialFamily" WHERE "masterFamilyId" IS NULL`),
    tx.execute<{ id: string }>(sql`SELECT id FROM "HealthFamily" WHERE "masterFamilyId" IS NULL`),
    tx.execute<{ id: string }>(sql`SELECT id FROM "Material" WHERE "catalogItemId" IS NULL`),
  ]);
  const definitions = [
    ["EMPLOYEE_WITHOUT_PERSON", "Employee", "ALTA", "Servidor sem vínculo com pessoa mestre"],
    ["BANK_ACCOUNT_WITHOUT_MASTER", "BankAccount", "ALTA", "Conta bancária sem banco mestre"],
    ["NEIGHBORHOOD_WITHOUT_CITY", "Neighborhood", "MEDIA", "Bairro sem cidade mestre"],
    ["STREET_WITHOUT_CITY", "Street", "MEDIA", "Logradouro sem cidade mestre"],
    ["PROFESSIONAL_WITHOUT_CBO_MASTER", "HealthProfessional", "MEDIA", "Profissional com CBO textual sem vínculo ao catálogo"],
    ["SOCIAL_FAMILY_WITHOUT_MASTER", "SocialFamily", "ALTA", "Família setorial social sem família mestre"],
    ["HEALTH_FAMILY_WITHOUT_MASTER", "HealthFamily", "ALTA", "Família setorial de saúde sem família mestre"],
    ["MATERIAL_WITHOUT_CATALOG_ITEM", "Material", "MEDIA", "Material sem produto mestre"],
  ] as const;
  const issues = checks.flatMap((result, index) => result.rows.map(row => ({ runId: run.id, area: "CADASTROS", issueType: definitions[index][0], recordType: definitions[index][1], recordId: row.id, severity: definitions[index][2], description: definitions[index][3] })));
  const identityIssues = (await readCanonicalDatabaseIdentityIssues(tx)).map(issue => ({ ...issue, runId: run.id, area: "CADASTROS" }));
  const allIssues = [...issues, ...identityIssues];
  // Keep parameter counts bounded without leaving the encompassing transaction.
  for (let offset = 0; offset < allIssues.length; offset += 500) await tx.insert(consistencyIssues).values(allIssues.slice(offset, offset + 500));
  await tx.update(consistencyRuns).set({ status: "CONCLUIDA", completedAt: new Date() }).where(eq(consistencyRuns.id, run.id));
  return run.id;
}
