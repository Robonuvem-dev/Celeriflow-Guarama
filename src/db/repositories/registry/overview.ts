import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AdministrativeUnitRecord, DepartmentRecord, SecretariatRecord } from "@/lib/contracts/administration";
import type { ConsistencyIssueRecord, ConsistencyRunRecord } from "@/lib/contracts/master-data";
import type { DatabaseExecutor } from "../../transaction";
import { consistencyIssues, consistencyRuns } from "../../schema/master-data";
import { listDepartments, listSecretariats, listUnits } from "../administration/queries";

export async function loadRegistryDashboard(db: DatabaseExecutor): Promise<{ persons: number; companies: number; suppliers: number; realEstates: number; geral: number; estrutura: number; referencias: number; qualidade: number }> {
  const result = await db.execute<{ persons: number; companies: number; suppliers: number; realEstates: number; geral: number; estrutura: number; referencias: number; qualidade: number }>(sql`SELECT
    (SELECT count(*)::int FROM "Person") AS persons, (SELECT count(*)::int FROM "Company") AS companies,
    (SELECT count(*)::int FROM "Supplier") AS suppliers, (SELECT count(*)::int FROM "RealEstate") AS "realEstates",
    ((SELECT count(*) FROM "Family") + (SELECT count(*) FROM "GovernmentEntity"))::int AS geral,
    ((SELECT count(*) FROM "CostCenter") + (SELECT count(*) FROM "City"))::int AS estrutura,
    ((SELECT count(*) FROM "LegalText") + (SELECT count(*) FROM "Bank") + (SELECT count(*) FROM "Currency") + (SELECT count(*) FROM "CatalogItem"))::int AS referencias,
    (SELECT count(*)::int FROM "MasterDataConsistencyIssue" i WHERE i.status='ABERTA' AND i."runId"=(SELECT r.id FROM "MasterDataConsistencyRun" r WHERE r.area='CADASTROS' AND r.status='CONCLUIDA' ORDER BY r."startedAt" DESC LIMIT 1)) AS qualidade`);
  return result.rows[0];
}

export async function loadRegistryOrganogram(db: DatabaseExecutor): Promise<(SecretariatRecord & { departments: DepartmentRecord[]; units: AdministrativeUnitRecord[] })[]> {
  const [secretariats, departments, units] = await Promise.all([listSecretariats(db), listDepartments(db), listUnits(db)]);
  return secretariats.map(record => ({ ...record, departments: departments.filter(department => department.secretariatId === record.id), units: units.filter(unit => unit.secretariatId === record.id) }));
}

export async function loadConsistencyRuns(db: DatabaseExecutor, requestedRunId?: string): Promise<{ runs: (ConsistencyRunRecord & { _count: { issues: number } })[]; selectedRun: { id: string } | null }> {
  const [rows, selected] = await Promise.all([
    db.select({ record: consistencyRuns, issues: sql<number>`count(${consistencyIssues.id})::int` }).from(consistencyRuns)
      .leftJoin(consistencyIssues, eq(consistencyIssues.runId, consistencyRuns.id)).where(eq(consistencyRuns.area, "CADASTROS"))
      .groupBy(consistencyRuns.id).orderBy(desc(consistencyRuns.startedAt)).limit(8),
    db.select({ id: consistencyRuns.id }).from(consistencyRuns).where(and(eq(consistencyRuns.area, "CADASTROS"), requestedRunId ? eq(consistencyRuns.id, requestedRunId) : undefined)).orderBy(desc(consistencyRuns.startedAt)).limit(1),
  ]);
  return { runs: rows.map(row => ({ ...row.record, _count: { issues: row.issues } })), selectedRun: selected[0] ?? null };
}

export async function loadConsistencyIssues(db: DatabaseExecutor, runId: string, page: number): Promise<{ issues: ConsistencyIssueRecord[]; total: number }> {
  const where = and(eq(consistencyIssues.area, "CADASTROS"), eq(consistencyIssues.runId, runId));
  const [issues, [count]] = await Promise.all([
    db.select().from(consistencyIssues).where(where).orderBy(asc(consistencyIssues.severity), desc(consistencyIssues.detectedAt)).limit(20).offset((page - 1) * 20),
    db.select({ count: sql<number>`count(*)::int` }).from(consistencyIssues).where(where),
  ]);
  return { issues, total: count.count };
}
