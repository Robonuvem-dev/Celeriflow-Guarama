import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { databaseTimestamp } from "@/db/temporal";
import { Decimal } from "@/db/decimal";
import { taxes, economicRegistrations } from "@/db/schema/taxation-core";
import { pageParameters } from "@/db/schema/taxation-pages";
import { people } from "@/db/schema/people";
import { companies, taxpayers, realEstates } from "@/db/schema/registry";
import type { TaxParameterRow } from "@/lib/contracts/taxation-pages";

type BatchItemRaw = { id: string; targetId: string; status: string; taxableBase: string; simulatedAmount: string; assessmentId: string | null; error: string | null };
type BatchRaw = { id: string; year: number; status: string; reason: string; scheduledAt: string | null; items: BatchItemRaw[] };
type AnnualBatchSource = {
  taxes: { id: string; name: string }[]; parameters: TaxParameterRow[];
  taxpayers: { id: string; person: { fullName: string } | null; company: { corporateName: string } | null }[];
  properties: { id: string; municipalInsc: string | null }[]; registrations: { id: string; municipalInsc: string }[];
  batches: { id: string; year: number; status: string; reason: string; scheduledAt: Date | null; items: { id: string; targetId: string; status: string; taxableBase: Decimal; simulatedAmount: Decimal; assessmentId: string | null; error: string | null }[] }[];
  count: number;
};
export async function readAnnualBatchPage(database: DatabaseExecutor, actorUsuarioId: string, allowedBudgetUnitIds: string[] | undefined, query: string | undefined, page: number): Promise<AnnualBatchSource> {
  const units = allowedBudgetUnitIds === undefined ? sql`true` : allowedBudgetUnitIds.length ? sql`b."budgetUnitId" IN (${sql.join(allowedBudgetUnitIds.map(id => sql`${id}`), sql`, `)})` : sql`false`;
  const scope = sql`b."actorUsuarioId"=${actorUsuarioId} AND ${units}`;
  const [taxRows, parameters, taxpayerRows, properties, registrations, batchRows, counts] = await Promise.all([
    database.select({ id: taxes.id, name: taxes.name }).from(taxes).where(and(eq(taxes.isActive, true), sql`EXISTS (SELECT 1 FROM "TaxFinancialMapping" m JOIN "BankAccount" b ON b.id=m."defaultBankAccountId" JOIN "PlanningEntityUnit" u ON u."budgetUnitId"=b."budgetUnitId" WHERE m."taxId"=${taxes.id} AND ${units})`)).orderBy(asc(taxes.name)),
    database.select().from(pageParameters).where(eq(pageParameters.isActive, true)).orderBy(desc(pageParameters.effectiveFrom)),
    database.select({ id: taxpayers.id, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(and(eq(taxpayers.status, "Ativo"), query ? or(ilike(people.fullName, `%${query}%`), ilike(companies.corporateName, `%${query}%`)) : undefined)).orderBy(asc(taxpayers.id)).limit(500),
    database.select({ id: realEstates.id, municipalInsc: realEstates.municipalInsc }).from(realEstates).innerJoin(taxpayers, eq(taxpayers.id, realEstates.taxpayerId)).where(and(eq(taxpayers.status, "Ativo"), query ? ilike(realEstates.municipalInsc, `%${query}%`) : undefined)).orderBy(asc(realEstates.id)).limit(500),
    database.select({ id: economicRegistrations.id, municipalInsc: economicRegistrations.municipalInsc }).from(economicRegistrations).innerJoin(taxpayers, eq(taxpayers.id, economicRegistrations.taxpayerId)).where(and(eq(taxpayers.status, "Ativo"), query ? ilike(economicRegistrations.municipalInsc, `%${query}%`) : undefined)).orderBy(asc(economicRegistrations.id)).limit(500),
    database.execute<BatchRaw>(sql`SELECT b.id,b.year,b.status,b.reason,b."scheduledAt", COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'targetId',i."targetId",'status',i.status,'taxableBase',i."taxableBase"::text,'simulatedAmount',i."simulatedAmount"::text,'assessmentId',i."assessmentId",'error',i.error) ORDER BY i.id ASC) FROM "TaxAnnualBatchItem" i WHERE i."batchId"=b.id),'[]'::jsonb) AS items FROM "TaxAnnualBatch" b WHERE ${scope} ORDER BY b."createdAt" DESC,b.id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`),
    database.execute<{ count: number }>(sql`SELECT count(*)::integer AS count FROM "TaxAnnualBatch" b WHERE ${scope}`),
  ]);
  return { taxes: taxRows, parameters, taxpayers: taxpayerRows, properties, registrations, count: counts.rows[0]?.count ?? 0, batches: batchRows.rows.map(row => ({ ...row, scheduledAt: row.scheduledAt === null ? null : databaseTimestamp(row.scheduledAt), items: row.items.map(item => ({ ...item, taxableBase: new Decimal(item.taxableBase), simulatedAmount: new Decimal(item.simulatedAmount) })) })) };
}
