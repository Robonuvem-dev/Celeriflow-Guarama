import { desc, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import { databaseTimestamp } from "@/db/temporal";
import { pageActiveDebts } from "@/db/schema/taxation-pages";
import type { ActiveDebtRow } from "@/lib/contracts/taxation-pages";

function debtScope(allowedBudgetUnitIds?: string[]) {
  if (allowedBudgetUnitIds === undefined) return sql`true`;
  if (!allowedBudgetUnitIds.length) return sql`false`;
  return sql`(d."budgetUnitId" IN (${sql.join(allowedBudgetUnitIds.map(id => sql`${id}`), sql`, `)}) OR (d."budgetUnitId" IS NULL AND EXISTS (SELECT 1 FROM "TaxAssessment" a WHERE a.id=d."assessmentId" AND a."calculationSnapshot"->'budgetUnitId' IN (${sql.join(allowedBudgetUnitIds.map(id => sql`${JSON.stringify(id)}::jsonb`), sql`, `)}))))`;
}
export async function readVisibleDebtIds(database: DatabaseExecutor, allowedBudgetUnitIds: string[]): Promise<string[]> {
  return (await database.execute<{ id: string }>(sql`SELECT d.id FROM "ActiveDebt" d WHERE ${debtScope(allowedBudgetUnitIds)}`)).rows.map(row => row.id);
}
type PortfolioRaw = { id: string; name: string; status: string; items: { id: string; activeDebtId: string; outstandingDecimal: string }[] };
type Protest = { id: string; batchNumber: string; status: string; items: { id: string; activeDebtId: string; status: string; returnCode: string | null; returnMessage: string | null }[] };
type ExecutionRaw = { id: string; batchNumber: string; internalProtocol: string; status: string; prosecutor: string | null; cases: { id: string; internalProtocol: string; activeDebtId: string; status: string; prosecutor: string | null; mniStatus: string; nextHearingAt: string | null; events: { eventType: string; description: string }[] }[] };
type GuideRaw = { id: string; guideNumber: string | null; status: string; totalValue: number; totalValueDecimal: string | null; assessment: { activeDebt: { id: string } | null } };
type VersionRaw = { id: string; activeDebtId: string; versionNumber: number; cdaNumber: string; annotation: string | null; signatureStatus: string; createdAt: string };
type DebtPageSource = {
  debts: ActiveDebtRow[];
  portfolios: (Omit<PortfolioRaw, "items"> & { items: { id: string; activeDebtId: string; outstandingDecimal: Decimal }[] })[];
  protestBatches: Protest[];
  executionBatches: (Omit<ExecutionRaw, "cases"> & { cases: (Omit<ExecutionRaw["cases"][number], "nextHearingAt"> & { nextHearingAt: Date | null })[] })[];
  guides: (Omit<GuideRaw, "totalValueDecimal"> & { totalValueDecimal: Decimal | null })[];
  budgetUnits: { id: string; code: string; name: string }[];
  versions: (Omit<VersionRaw, "createdAt"> & { createdAt: Date })[];
  suspensions: { id: string; activeDebtId: string; reason: string; status: string }[];
  events: { activeDebtId: string; eventType: string; description: string }[];
};
export async function readActiveDebtPage(database: DatabaseExecutor, allowedBudgetUnitIds: string[] | undefined, visibleDebtIds: string[]): Promise<DebtPageSource> {
  const visible = visibleDebtIds.length ? sql`i."activeDebtId" IN (${sql.join(visibleDebtIds.map(id => sql`${id}`), sql`, `)})` : sql`false`;
  const portfolioScope = allowedBudgetUnitIds === undefined ? sql`true` : sql`EXISTS (SELECT 1 FROM "TaxDaPortfolioItem" i WHERE i."portfolioId"=p.id AND ${visible}) AND NOT EXISTS (SELECT 1 FROM "TaxDaPortfolioItem" i WHERE i."portfolioId"=p.id AND NOT (${visible}))`;
  const protestScope = allowedBudgetUnitIds === undefined ? sql`true` : sql`EXISTS (SELECT 1 FROM "TaxProtestItem" i WHERE i."batchId"=b.id AND ${visible}) AND NOT EXISTS (SELECT 1 FROM "TaxProtestItem" i WHERE i."batchId"=b.id AND NOT (${visible}))`;
  const executionScope = allowedBudgetUnitIds === undefined ? sql`true` : sql`EXISTS (SELECT 1 FROM "TaxExecutionCase" i WHERE i."batchId"=b.id AND ${visible}) AND NOT EXISTS (SELECT 1 FROM "TaxExecutionCase" i WHERE i."batchId"=b.id AND NOT (${visible}))`;
  const assessmentScope = allowedBudgetUnitIds === undefined ? sql`true` : allowedBudgetUnitIds.length ? sql`a."calculationSnapshot"->'budgetUnitId' IN (${sql.join(allowedBudgetUnitIds.map(id => sql`${JSON.stringify(id)}::jsonb`), sql`, `)})` : sql`false`;
  const unitScope = allowedBudgetUnitIds === undefined ? sql`true` : allowedBudgetUnitIds.length ? sql`u.id IN (${sql.join(allowedBudgetUnitIds.map(id => sql`${id}`), sql`, `)})` : sql`false`;
  const [debts, portfolios, protests, executions, guides, units] = await Promise.all([
    database.select().from(pageActiveDebts).where(allowedBudgetUnitIds === undefined ? undefined : inArray(pageActiveDebts.id, visibleDebtIds)).orderBy(desc(pageActiveDebts.createdAt)).limit(200),
    database.execute<PortfolioRaw>(sql`SELECT p.id,p.name,p.status,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'activeDebtId',i."activeDebtId",'outstandingDecimal',i."outstandingDecimal"::text)) FROM "TaxDaPortfolioItem" i WHERE i."portfolioId"=p.id),'[]'::jsonb) AS items FROM "TaxDaPortfolio" p WHERE ${portfolioScope} ORDER BY p."createdAt" DESC LIMIT 50`),
    database.execute<Protest>(sql`SELECT b.id,b."batchNumber",b.status,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'activeDebtId',i."activeDebtId",'status',i.status,'returnCode',i."returnCode",'returnMessage',i."returnMessage")) FROM "TaxProtestItem" i WHERE i."batchId"=b.id),'[]'::jsonb) AS items FROM "TaxProtestBatch" b WHERE ${protestScope} ORDER BY b."createdAt" DESC LIMIT 50`),
    database.execute<ExecutionRaw>(sql`SELECT b.id,b."batchNumber",b."internalProtocol",b.status,b.prosecutor,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'internalProtocol',c."internalProtocol",'activeDebtId',c."activeDebtId",'status',c.status,'prosecutor',c.prosecutor,'mniStatus',c."mniStatus",'nextHearingAt',c."nextHearingAt",'events',COALESCE((SELECT jsonb_agg(jsonb_build_object('eventType',e."eventType",'description',e.description) ORDER BY e."createdAt" DESC) FROM (SELECT * FROM "TaxExecutionEvent" e WHERE e."caseId"=c.id ORDER BY e."createdAt" DESC LIMIT 6) e),'[]'::jsonb))) FROM "TaxExecutionCase" c WHERE c."batchId"=b.id),'[]'::jsonb) AS cases FROM "TaxExecutionBatch" b WHERE ${executionScope} ORDER BY b."createdAt" DESC LIMIT 50`),
    database.execute<GuideRaw>(sql`SELECT g.id,g."guideNumber",g.status,g."totalValue",g."totalValueDecimal"::text,jsonb_build_object('activeDebt',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('id',d.id) END) AS assessment FROM "TaxGuide" g JOIN "TaxAssessment" a ON a.id=g."assessmentId" LEFT JOIN "ActiveDebt" d ON d."assessmentId"=a.id WHERE g.status NOT IN ('Cancelada','Paga') AND ${assessmentScope} ORDER BY g."createdAt" DESC LIMIT 100`),
    database.execute<{ id: string; code: string; name: string }>(sql`SELECT u.id,u.code,u.name FROM "BudgetUnit" u JOIN "PlanningEntityUnit" p ON p."budgetUnitId"=u.id WHERE ${unitScope} ORDER BY u.code ASC`),
  ]);
  const ids = debts.map(row => row.id);
  const debtIds = ids.length ? sql`"activeDebtId" IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})` : sql`false`;
  const [versions, suspensions, events] = await Promise.all([
    database.execute<VersionRaw>(sql`SELECT id,"activeDebtId","versionNumber","cdaNumber",annotation,"signatureStatus","createdAt" FROM "TaxCdaVersion" WHERE ${debtIds} ORDER BY "versionNumber" ASC`),
    database.execute<DebtPageSource["suspensions"][number]>(sql`SELECT id,"activeDebtId",reason,status FROM "TaxDebtSuspension" WHERE ${debtIds} ORDER BY "createdAt" DESC`),
    database.execute<DebtPageSource["events"][number]>(sql`SELECT "activeDebtId","eventType",description FROM "TaxActiveDebtEvent" WHERE ${debtIds} ORDER BY "createdAt" DESC LIMIT 400`),
  ]);
  return { debts, portfolios: portfolios.rows.map(row => ({ ...row, items: row.items.map(item => ({ ...item, outstandingDecimal: new Decimal(item.outstandingDecimal) })) })), protestBatches: protests.rows, executionBatches: executions.rows.map(row => ({ ...row, cases: row.cases.map(item => ({ ...item, nextHearingAt: item.nextHearingAt === null ? null : databaseTimestamp(item.nextHearingAt) })) })), guides: guides.rows.map(row => ({ ...row, totalValueDecimal: row.totalValueDecimal === null ? null : new Decimal(row.totalValueDecimal) })), budgetUnits: units.rows, versions: versions.rows.map(row => ({ ...row, createdAt: databaseTimestamp(row.createdAt) })), suspensions: suspensions.rows, events: events.rows };
}
