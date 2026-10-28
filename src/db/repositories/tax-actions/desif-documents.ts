import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { databaseTimestamp } from "@/db/temporal";
import { Decimal } from "@/db/decimal";

type ReceiptWire = { id: string; status: string; receiptNumber: string | null; processedAt: string | null; competence: string; abrasfVersion: string; fileName: string; originMode: string; signaturePolicy: string; signatureStatus: string; institution: { name: string }; agency: { name: string } | null; _count: { assessments: number; trialBalances: number; packageMovements: number } };
export async function actionDesifReceipt(database: DatabaseExecutor, id: string) {
  const { rows } = await database.execute<ReceiptWire>(sql`SELECT b.id,b.status,b."receiptNumber",b."processedAt",b.competence,b."abrasfVersion",b."fileName",b."originMode",b."signaturePolicy",b."signatureStatus",jsonb_build_object('name',i.name) AS institution,CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('name',a.name) END AS agency,jsonb_build_object('assessments',(SELECT count(*)::integer FROM "DesifAssessment" d WHERE d."importBatchId"=b.id),'trialBalances',(SELECT count(*)::integer FROM "DesifTrialBalance" t WHERE t."importBatchId"=b.id),'packageMovements',(SELECT count(*)::integer FROM "DesifPackageMovement" m WHERE m."importBatchId"=b.id)) AS "_count" FROM "DesifImportBatch" b JOIN "DesifFinancialInstitution" i ON i.id=b."institutionId" LEFT JOIN "DesifAgency" a ON a.id=b."agencyId" WHERE b.id=${id} LIMIT 1`);
  const row = rows[0];
  return row ? { ...row, processedAt: row.processedAt === null ? null : databaseTimestamp(row.processedAt) } : null;
}
type AssessmentWire = { subtitle: { code: string }; revenueDecimal: string; deductionDecimal: string; taxableBaseDecimal: string; rate: string; grossTaxDecimal: string; creditDecimal: string; debitAdjustmentDecimal: string; taxDueDecimal: string };
type CaseWire = { institution: { name: string }; agency: { name: string } | null; competence: string; findingType: string; findingDescription: string; processId: string | null; serviceOrderNumber: string | null; assessment: AssessmentWire | null };
export async function actionDesifFiscalCase(database: DatabaseExecutor, id: string) {
  const { rows } = await database.execute<CaseWire>(sql`SELECT jsonb_build_object('name',i.name) AS institution,CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('name',a.name) END AS agency,c.competence,c."findingType",c."findingDescription",c."processId",c."serviceOrderNumber",CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('subtitle',jsonb_build_object('code',s.code),'revenueDecimal',d."revenueDecimal"::text,'deductionDecimal',d."deductionDecimal"::text,'taxableBaseDecimal',d."taxableBaseDecimal"::text,'rate',d.rate::text,'grossTaxDecimal',d."grossTaxDecimal"::text,'creditDecimal',d."creditDecimal"::text,'debitAdjustmentDecimal',d."debitAdjustmentDecimal"::text,'taxDueDecimal',d."taxDueDecimal"::text) END AS assessment FROM "DesifFiscalCase" c JOIN "DesifFinancialInstitution" i ON i.id=c."institutionId" LEFT JOIN "DesifAgency" a ON a.id=c."agencyId" LEFT JOIN "DesifAssessment" d ON d.id=c."assessmentId" LEFT JOIN "DesifSubtitle" s ON s.id=d."subtitleId" WHERE c.id=${id} LIMIT 1`);
  const row = rows[0];
  if (!row) return null;
  const a = row.assessment;
  return { ...row, assessment: a ? { ...a, revenueDecimal: new Decimal(a.revenueDecimal), deductionDecimal: new Decimal(a.deductionDecimal), taxableBaseDecimal: new Decimal(a.taxableBaseDecimal), rate: new Decimal(a.rate), grossTaxDecimal: new Decimal(a.grossTaxDecimal), creditDecimal: new Decimal(a.creditDecimal), debitAdjustmentDecimal: new Decimal(a.debitAdjustmentDecimal), taxDueDecimal: new Decimal(a.taxDueDecimal) } : null };
}
