import { sql, type SQL } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { recyclingMovements, recyclingMaterialBindings } from "@/db/schema/environment-recycling";
import { instanceParameters } from "@/db/schema/instance-configuration";
import { recyclingEntryKey } from "@/lib/environment/recycling-catalog";
import { RecyclingReportError, recyclingReportMonthCount, recyclingReportPage, type RecyclingReportData, type RecyclingReportFilters, type RecyclingReportRow } from "@/lib/environment/recycling-reports";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";

function source(instanceId: string, f: RecyclingReportFilters) {
  const conditions: SQL[] = [sql`m."instanceId"=${instanceId}`, sql`m."occurredOn"<=${f.to}::date`];
  if (f.typeCode) conditions.push(sql`b."typeKey"=${recyclingEntryKey({ kind: "types", code: f.typeCode })}`);
  if (f.materialCode) conditions.push(sql`m."materialKey"=${recyclingEntryKey({ kind: "materials", code: f.materialCode })}`);
  if (f.depotCode) conditions.push(sql`m."depotKey"=${recyclingEntryKey({ kind: "depots", code: f.depotCode })}`);
  return sql`SELECT m.id,m."materialKey" AS material_key,m."depotKey" AS depot_key,b."typeKey" AS type_key,b."unitKey" AS unit_key,
    m.kind,m.quantity,m.amount,m."occurredOn" AS day,m."createdAt" AS created,
    COALESCE(NULLIF(pm.valor->>'code',''),m.snapshot->'material'->>'code',m."materialKey") AS code,
    COALESCE(NULLIF(pm.valor->>'name',''),m.snapshot->'material'->>'name','Material indisponível') AS name,
    COALESCE(NULLIF(pt.valor->>'code',''),m.snapshot->'materialType'->>'code',b."typeKey") AS type_code,
    COALESCE(NULLIF(pt.valor->>'name',''),m.snapshot->'materialType'->>'name','Tipo indisponível') AS type,
    COALESCE(NULLIF(pu.valor->>'name',''),m.snapshot->'unit'->>'name','Unidade indisponível') AS unit,
    COALESCE(NULLIF(pd.valor->>'name',''),m.snapshot->'depot'->>'name','Depósito indisponível') AS depot,
    COALESCE(NULLIF(pd.valor->>'code',''),m.snapshot->'depot'->>'code',m."depotKey") AS depot_code
    FROM ${recyclingMovements} AS m
    JOIN ${recyclingMaterialBindings} AS b ON b."instanceId"=m."instanceId" AND b."materialKey"=m."materialKey"
    LEFT JOIN ${instanceParameters} AS pm ON pm."configuracaoInstanciaId"=m."instanceId" AND pm.chave=m."materialKey"
    LEFT JOIN ${instanceParameters} AS pd ON pd."configuracaoInstanciaId"=m."instanceId" AND pd.chave=m."depotKey"
    LEFT JOIN ${instanceParameters} AS pt ON pt."configuracaoInstanciaId"=m."instanceId" AND pt.chave=b."typeKey"
    LEFT JOIN ${instanceParameters} AS pu ON pu."configuracaoInstanciaId"=m."instanceId" AND pu.chave=b."unitKey"
    WHERE ${sql.join(conditions, sql` AND `)}`;
}
function latest(field: "code" | "name" | "type" | "type_code" | "unit" | "depot" | "depot_code") {
  return sql`(array_agg(${sql.identifier(field)} ORDER BY day DESC,created DESC,id DESC))[1]`;
}
function groups(f: RecyclingReportFilters) {
  if (f.view === "sales") return sql`SELECT type_key AS id,${latest("type_code")} AS code,${latest("type")} AS name,${latest("type")} AS type,
    ''::text AS unit,''::text AS depot,''::text AS "depotCode",0::numeric AS opening,0::numeric AS incoming,0::numeric AS outgoing,0::numeric AS balance,
    sum(amount) AS revenue,count(*)::text AS movements FROM source WHERE kind='EXIT' AND day>=${f.from}::date GROUP BY type_key`;
  const perDepot = f.view === "depots";
  return sql`SELECT material_key ${perDepot ? sql`|| ':' || depot_key` : sql``} AS id,${latest("code")} AS code,${latest("name")} AS name,${latest("type")} AS type,${latest("unit")} AS unit,
    ${perDepot ? latest("depot") : sql`'Todos os depósitos do filtro'::text`} AS depot,${perDepot ? latest("depot_code") : sql`''::text`} AS "depotCode",
    sum(CASE WHEN day<${f.from}::date THEN CASE WHEN kind='ENTRY' THEN quantity ELSE -quantity END ELSE 0 END) AS opening,
    sum(CASE WHEN day>=${f.from}::date AND kind='ENTRY' THEN quantity ELSE 0 END) AS incoming,
    sum(CASE WHEN day>=${f.from}::date AND kind='EXIT' THEN quantity ELSE 0 END) AS outgoing,
    sum(CASE WHEN kind='ENTRY' THEN quantity ELSE -quantity END) AS balance,
    sum(CASE WHEN day>=${f.from}::date AND kind='EXIT' THEN amount ELSE 0 END) AS revenue,
    count(*) FILTER (WHERE day>=${f.from}::date)::text AS movements
    FROM source GROUP BY material_key,type_key,unit_key ${perDepot ? sql`,depot_key` : sql``}`;
}
type RawRow = Omit<RecyclingReportRow, "opening" | "incoming" | "outgoing" | "balance" | "revenue"> & { opening: string; incoming: string; outgoing: string; balance: string; revenue: string };
/** Invoke inside one read-only REPEATABLE READ transaction, so count/data agree. */
export async function loadRecyclingReport(database: DatabaseExecutor, instanceId: string, filters: RecyclingReportFilters, requestedPage?: string, all = false): Promise<RecyclingReportData> {
  const base = source(instanceId, filters);
  let stats: { total: number; revenue: string; maximum: string };
  let cte: SQL;
  if (filters.view === "monthly") {
    cte = sql`WITH source AS (${base}), totals AS (SELECT date_trunc('month',day)::date AS month,sum(amount) AS revenue,count(*)::text AS movements FROM source WHERE kind='EXIT' AND day>=${filters.from}::date GROUP BY date_trunc('month',day)), report AS (
      SELECT to_char(month,'YYYY-MM') AS id,to_char(month,'YYYY-MM') AS code,to_char(month,'MM/YYYY') AS name,''::text AS type,''::text AS unit,''::text AS depot,''::text AS "depotCode",
      0::numeric AS opening,0::numeric AS incoming,0::numeric AS outgoing,0::numeric AS balance,COALESCE(t.revenue,0) AS revenue,COALESCE(t.movements,'0') AS movements
      FROM generate_series(date_trunc('month',${filters.from}::date),date_trunc('month',${filters.to}::date),interval '1 month') AS months(month) LEFT JOIN totals AS t USING(month))`;
    const result = await database.execute<{ revenue: string; maximum: string }>(sql`WITH source AS (${base}), totals AS (SELECT date_trunc('month',day) AS month,sum(amount) AS revenue FROM source WHERE kind='EXIT' AND day>=${filters.from}::date GROUP BY date_trunc('month',day)) SELECT COALESCE(sum(revenue),0)::text AS revenue,COALESCE(max(revenue),0)::text AS maximum FROM totals`);
    stats = { total: recyclingReportMonthCount(filters), revenue: result.rows[0]?.revenue ?? "0", maximum: result.rows[0]?.maximum ?? "0" };
  } else {
    cte = sql`WITH source AS (${base}), report AS (${groups(filters)})`;
    const result = await database.execute<{ total: number; revenue: string; maximum: string }>(sql`${cte} SELECT count(*)::int AS total,COALESCE(sum(revenue),0)::text AS revenue,COALESCE(max(revenue),0)::text AS maximum FROM report`);
    stats = result.rows[0];
  }
  if (all && stats.total > 10_000) throw new RecyclingReportError("O relatório excede 10.000 registros. Restrinja os filtros para emitir o arquivo completo.");
  const page = all ? 1 : recyclingReportPage(requestedPage, stats.total);
  const byDepot = filters.view === "depots" ? sql`"depotCode",` : sql``;
  const order = filters.view === "monthly" ? sql`code,id` : filters.order === "description" ? sql`${byDepot}name,code,id` : sql`${byDepot}code,name,id`;
  const result = await database.execute<RawRow>(sql`${cte} SELECT id,code,name,type,unit,depot,"depotCode",opening::text,incoming::text,outgoing::text,balance::text,revenue::text,movements FROM report ORDER BY ${order} LIMIT ${all ? 10_000 : OPERATIONAL_PAGE_SIZE} OFFSET ${(page - 1) * OPERATIONAL_PAGE_SIZE}`);
  const rows = result.rows.map(row => ({ ...row, opening: new Decimal(row.opening).toFixed(3), incoming: new Decimal(row.incoming).toFixed(3), outgoing: new Decimal(row.outgoing).toFixed(3), balance: new Decimal(row.balance).toFixed(3), revenue: new Decimal(row.revenue).toFixed(2) }));
  return { filters, rows, page, total: stats.total, revenue: new Decimal(stats.revenue).toFixed(2), maximum: new Decimal(stats.maximum).toFixed(2) };
}
