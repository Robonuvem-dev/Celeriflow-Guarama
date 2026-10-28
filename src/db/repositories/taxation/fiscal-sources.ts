import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";

export type FiscalMeshSources = {
  nfse: string | null; declared: string | null; rate: string | null;
  desif: string | null; card: string | null; hasSimple: boolean; hasRegistration: boolean;
};

/** Only fiscal source projections; all numerics remain driver strings. */
export async function readFiscalMeshSources(db: DatabaseExecutor, taxpayerId: string, document: string, competence: string): Promise<FiscalMeshSources> {
  const invoiceCompetence = `${competence.slice(5, 7)}/${competence.slice(0, 4)}`;
  const result = await db.execute<FiscalMeshSources>(sql`SELECT
    (SELECT sum("serviceValueDecimal")::text FROM "Invoice" WHERE "providerId"=${taxpayerId} AND competence IN (${competence},${invoiceCompetence}) AND status='Emitida') AS nfse,
    s."declaredServiceDecimal"::text AS declared, s.rate::text AS rate,
    (s.id IS NOT NULL) AS "hasSimple",
    (SELECT sum(d."revenueDecimal")::text FROM "DesifAssessment" d JOIN "DesifAgency" a ON a.id=d."agencyId" JOIN "DesifFinancialInstitution" i ON i.id=a."institutionId" WHERE d.competence=${competence} AND i."taxpayerId"=${taxpayerId}) AS desif,
    (SELECT "valorApuradoBancos"::text FROM "TaxAuditCrossCheck" WHERE ${document}<>'' AND "cnpjCpfContribuinte"=${document} ORDER BY "dataCruzamento" DESC LIMIT 1) AS card,
    EXISTS (SELECT 1 FROM "EconomicRegistration" WHERE "taxpayerId"=${taxpayerId} AND status='Ativo') AS "hasRegistration"
    FROM (SELECT 1) base LEFT JOIN LATERAL (SELECT id,"declaredServiceDecimal",rate FROM "SimplesFiscalRecord" WHERE "taxpayerId"=${taxpayerId} AND competence=${competence} AND status='VALIDO' ORDER BY "createdAt" DESC LIMIT 1) s ON true`);
  const row = result.rows[0];
  if (!row) throw new Error("Fontes da malha fiscal indisponíveis.");
  return row;
}
