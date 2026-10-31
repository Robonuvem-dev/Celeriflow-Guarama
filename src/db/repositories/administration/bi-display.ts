import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { institutions, secretariats } from "@/db/schema/administration";
import { biDisplayAssets, biDisplayChannels, biDisplayVersions } from "@/db/schema/bi-display";
import { displayPeriod, type DisplayDataset, type DisplaySlide } from "@/lib/bi/display-model";

export const municipalDisplayChannel = "municipal-public";

export async function loadDisplayIdentity(db: DatabaseExecutor) {
  const [institution] = await db.select({ name: institutions.name, logoUrl: institutions.logoUrl }).from(institutions).orderBy(asc(institutions.createdAt), asc(institutions.id)).limit(1);
  return institution ?? { name: "Prefeitura Municipal", logoUrl: null };
}
export async function loadDisplayChannel(db: DatabaseExecutor) {
  const [channel] = await db.select().from(biDisplayChannels).where(eq(biDisplayChannels.id, municipalDisplayChannel));
  return channel ?? null;
}
export async function loadDisplayEditorOptions(db: DatabaseExecutor) {
  const [options, assets, versions] = await Promise.all([
    db.select({ id: secretariats.id, name: secretariats.name }).from(secretariats).orderBy(asc(secretariats.name)),
    db.select({ id: biDisplayAssets.id, name: biDisplayAssets.name }).from(biDisplayAssets).orderBy(desc(biDisplayAssets.createdAt)).limit(100),
    db.select({ id: biDisplayVersions.id, number: biDisplayVersions.number, createdAt: biDisplayVersions.createdAt, config: biDisplayVersions.config }).from(biDisplayVersions).where(eq(biDisplayVersions.channelId, municipalDisplayChannel)).orderBy(desc(biDisplayVersions.number)).limit(20),
  ]);
  return { secretariats: options, assets: assets.map(asset => ({ ...asset, url: `/api/administracao/bi/smarttv/imagens/${asset.id}` })), versions: versions.map(version => ({ id: version.id, number: version.number, title: version.config.title, createdAt: version.createdAt.toISOString() })) };
}
export async function loadDisplayVersion(db: DatabaseExecutor, id: string) {
  const [version] = await db.select().from(biDisplayVersions).where(and(eq(biDisplayVersions.id, id), eq(biDisplayVersions.channelId, municipalDisplayChannel)));
  return version ?? null;
}

export async function queryDisplayDataset(db: DatabaseExecutor, slide: DisplaySlide, now: Date): Promise<DisplayDataset> {
  const period = displayPeriod(slide.period, now);
  if (slide.kind === "image") return { metrics: {}, chart: [], periodLabel: "Informação institucional" };
  const selection = slide.secretariatId;
  const demandScope = selection ? sql`COALESCE(d."secretariatId", dep."secretariatId") = ${selection}` : sql`TRUE`;
  const start = period.start ? sql`AND d."createdAt" >= (${period.start}::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC'` : sql``;
  const status = sql`translate(lower(trim(d.status)), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc')`;
  const resolved = sql`${status} IN ('concluida','concluido','encerrada','encerrado','resolvida','resolvido')`;
  const cancelled = sql`${status} IN ('cancelada','cancelado')`;
  const open = sql`NOT (${resolved} OR ${cancelled})`;
  const needsDemands = slide.metrics.some(key => key !== "employees" && key !== "secretariats" && key !== "departments" && key !== "units") || slide.chart === "demands" || slide.chart === "timeline";
  const metrics: DisplayDataset["metrics"] = {};
  if (slide.metrics.some(key => ["employees", "secretariats", "departments", "units"].includes(key))) {
    const result = await db.execute<Record<string, number>>(sql`SELECT
      (SELECT count(*)::int FROM "Employee" WHERE "isActive" AND ${selection ? sql`"secretariatId" = ${selection}` : sql`TRUE`}) AS employees,
      (SELECT count(*)::int FROM "Secretariat" WHERE "isActive" AND ${selection ? sql`id = ${selection}` : sql`TRUE`}) AS secretariats,
      (SELECT count(*)::int FROM "Department" WHERE "isActive" AND ${selection ? sql`"secretariatId" = ${selection}` : sql`TRUE`}) AS departments,
      (SELECT count(*)::int FROM "AdministrativeUnit" WHERE "isActive" AND ${selection ? sql`"secretariatId" = ${selection}` : sql`TRUE`}) AS units`);
    for (const key of slide.metrics) if (key in result.rows[0]) metrics[key] = Number(result.rows[0][key]);
  }
  if (needsDemands) {
    const result = await db.execute<Record<string, number>>(sql`SELECT count(*)::int AS demands,
      count(*) FILTER (WHERE ${open})::int AS "openDemands", count(*) FILTER (WHERE ${resolved})::int AS "resolvedDemands",
      count(*) FILTER (WHERE ${cancelled})::int AS "cancelledDemands",
      count(*) FILTER (WHERE ${open} AND d.deadline < ${now.toISOString()}::timestamp)::int AS "overdueDemands"
      FROM "InternalDemand" d LEFT JOIN "Department" dep ON dep.id = d."departmentId"
      WHERE ${demandScope} ${start} AND d."createdAt" <= ${now.toISOString()}::timestamp`);
    for (const key of slide.metrics) if (key in result.rows[0]) metrics[key] = Number(result.rows[0][key]);
  }
  let chart: DisplayDataset["chart"] = [];
  if (slide.chart === "demands" || slide.chart === "timeline") {
    const group = slide.chart === "demands" ? sql`COALESCE(s.name, 'Sem secretaria')` : sql`to_char(d."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')`;
    const result = await db.execute<{ name: string; value: number }>(sql`SELECT ${group} AS name, count(*)::int AS value
      FROM "InternalDemand" d LEFT JOIN "Department" dep ON dep.id=d."departmentId"
      LEFT JOIN "Secretariat" s ON s.id=COALESCE(d."secretariatId", dep."secretariatId")
      WHERE ${demandScope} ${start} AND d."createdAt" <= ${now.toISOString()}::timestamp
      GROUP BY ${group} ORDER BY ${slide.chart === "timeline" ? sql`name ASC` : sql`value DESC, name ASC`}`);
    chart = result.rows.map(row => ({ name: row.name, value: Number(row.value) }));
  } else if (slide.chart === "employees") {
    const result = await db.execute<{ name: string; value: number }>(sql`SELECT COALESCE(s.name, 'Sem secretaria') AS name, count(*)::int AS value
      FROM "Employee" e LEFT JOIN "Secretariat" s ON s.id=e."secretariatId"
      WHERE e."isActive" AND ${selection ? sql`e."secretariatId" = ${selection}` : sql`TRUE`}
      GROUP BY s.name ORDER BY value DESC, name ASC`);
    chart = result.rows.map(row => ({ name: row.name, value: Number(row.value) }));
  }
  return { metrics, chart, chartMax: Math.max(1, ...chart.map(item => item.value)), periodLabel: `${period.label}${slide.metrics.some(key => ["employees", "secretariats", "departments", "units"].includes(key)) || slide.chart === "employees" ? " · Estrutura/equipe: posição atual" : ""}` };
}
