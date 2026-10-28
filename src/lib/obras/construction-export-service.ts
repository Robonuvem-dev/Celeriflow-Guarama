import { and, desc, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { constructionFederalExportItems, constructionFederalExports } from "@/db/schema/construction-integrations";
import { listConstructionExportCases, listConstructionExportPermits } from "@/db/repositories/infrastructure/construction-integrations";
import type { ConstructionAccess } from "./construction-policy";
import { createExportSnapshot, exportRequestSchema, selectConstructionExportPermit, type ExportRecord } from "./construction-export";

export async function constructionExportRecords(db: DatabaseExecutor, access: ConstructionAccess, caseIds: string[]): Promise<ExportRecord[]> {
  const cases = await listConstructionExportCases(db, access, caseIds);
  if (cases.length !== caseIds.length) throw new Error("Há processos indisponíveis no lote.");
  const now = new Date();
  const { permits, versions } = await listConstructionExportPermits(db, caseIds, now);
  return cases.map((item) => {
    const permit = selectConstructionExportPermit(item.id, permits, versions, now);
    return { caseId: item.id, protocol: item.protocol, permitId: permit?.id || null, permitNumber: permit?.number || null, permitIssuedAt: permit?.publishedAt?.toISOString() || null, permitStatus: permit?.status || null, permitDocumentVersionId: permit?.documentVersionId || null, permitHashSha256: permit?.hashSha256 || null, permitValidUntil: permit?.validUntil?.toISOString() || null, ownerDocument: item.cpf || item.cnpj || null, properties: item.properties, area: item.totalArea.toFixed(4), startedAt: item.startedAt?.toISOString().slice(0, 10) || null };
  });
}

export async function persistConstructionExport(tx: DatabaseTransaction, access: ConstructionAccess, actor: string, input: unknown) {
  if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Lotes restritos ao gestor.");
  const data = exportRequestSchema.parse(input);
  const scope = access.administrator ? "GLOBAL" : access.departmentId!;
  // Serializes version allocation and rectification chain for this scope/period.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`construction-export:${scope}:${data.period}`}))`);
  const [repeated] = await tx.select().from(constructionFederalExports).where(eq(constructionFederalExports.requestKey, data.requestKey)).limit(1);
  if (repeated) {
    if (repeated.scope !== scope || repeated.createdBy !== actor) throw new Error("Referência indisponível.");
    return repeated;
  }
  const [latest] = await tx.select().from(constructionFederalExports).where(and(eq(constructionFederalExports.scope, scope), eq(constructionFederalExports.period, data.period))).orderBy(desc(constructionFederalExports.version)).limit(1);
  if (data.rectifiesId) {
    const [previous] = await tx.select().from(constructionFederalExports).where(eq(constructionFederalExports.id, data.rectifiesId)).limit(1);
    if (!previous || previous.scope !== scope || previous.period !== data.period || latest?.id !== previous.id) throw new Error("Retifique o lote mais recente da mesma competência e setor.");
  } else if (latest) throw new Error("Já existe lote nesta competência. Use retificação para preservar o histórico.");
  const records = await constructionExportRecords(tx, access, data.caseIds);
  const snapshot = createExportSnapshot(records, { period: data.period, version: (latest?.version || 0) + 1, rectifiesId: data.rectifiesId, reason: data.reason, createdAt: new Date().toISOString() });
  const [saved] = await tx.insert(constructionFederalExports).values({ requestKey: data.requestKey, scope, period: data.period, version: (latest?.version || 0) + 1, payload: snapshot.payload, hashSha256: snapshot.hashSha256, validationSnapshot: snapshot.validation, rectifiesId: data.rectifiesId, reason: data.reason, createdBy: actor }).returning();
  await tx.insert(constructionFederalExportItems).values(records.map(record => ({ exportId: saved.id, caseId: record.caseId })));
  return saved;
}
