import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { databaseTimestamp } from "@/db/temporal";
import { listPageTaxpayers } from "./registry";
import type { TaxpayerDetails } from "@/lib/contracts/registry";

export async function readPageServiceRequests(database: DatabaseExecutor): Promise<{ id: string; serviceType: string; status: string; taxpayer: TaxpayerDetails; process: { protocolNumber: string } | null }[]> {
  const result = await database.execute<{ id: string; serviceType: string; status: string; taxpayerId: string; process: { protocolNumber: string } | null }>(sql`SELECT r.id,r."serviceType",r.status,r."taxpayerId",CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('protocolNumber',p."protocolNumber") END AS process FROM "TaxServiceRequest" r LEFT JOIN "Process" p ON p.id=r."processId" ORDER BY r."createdAt" DESC LIMIT 10`);
  const taxpayers = await listPageTaxpayers(database, { ids: result.rows.map(row => row.taxpayerId) });
  return result.rows.map(({ taxpayerId, ...row }) => { const taxpayer = taxpayers.find(item => item.id === taxpayerId); if (!taxpayer) throw new Error("Contribuinte fiscal não encontrado."); return { ...row, taxpayer }; });
}
export async function readPageCertificateEvaluations(database: DatabaseExecutor): Promise<{ id: string; result: string; pendingCount: number; evaluatedAt: Date; taxpayer: TaxpayerDetails }[]> {
  const result = await database.execute<{ id: string; result: string; pendingCount: number; evaluatedAt: string; taxpayerId: string }>(sql`SELECT id,result,"pendingCount","evaluatedAt","taxpayerId" FROM "TaxCertificateEvaluation" ORDER BY "evaluatedAt" DESC LIMIT 10`);
  const taxpayers = await listPageTaxpayers(database, { ids: result.rows.map(row => row.taxpayerId) });
  return result.rows.map(({ taxpayerId, evaluatedAt, ...row }) => { const taxpayer = taxpayers.find(item => item.id === taxpayerId); if (!taxpayer) throw new Error("Contribuinte fiscal não encontrado."); return { ...row, evaluatedAt: databaseTimestamp(evaluatedAt), taxpayer }; });
}
