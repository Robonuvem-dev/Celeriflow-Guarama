import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { healthUnits } from "@/db/schema/health-workforce";
import { healthCareAgreements } from "@/db/schema/health-agreements";
import { healthProcedurePriceTables, healthProcedurePriceItems } from "@/db/schema/health-production";
import { healthSusProcedures } from "@/db/schema/health-catalogs";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PriceTableForm } from "./PriceTableForm";
export default async function HealthPricesPage() {
  const context = await getTenantContextForModule("SAUDE"), unitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const database = context.database ?? db;
  const [units, agreements, tableRows] = await Promise.all([
    database.select({ id: healthUnits.id, name: healthUnits.name }).from(healthUnits).where(and(eq(healthUnits.isActive, true), unitIds ? inArray(healthUnits.id, unitIds) : undefined)).orderBy(asc(healthUnits.name)),
    database.select({ id: healthCareAgreements.id, name: healthCareAgreements.name }).from(healthCareAgreements).where(eq(healthCareAgreements.isActive, true)).orderBy(asc(healthCareAgreements.name)),
    database.select({ table: healthProcedurePriceTables, unit: { name: healthUnits.name }, agreement: { name: healthCareAgreements.name } }).from(healthProcedurePriceTables).innerJoin(healthUnits, eq(healthUnits.id, healthProcedurePriceTables.unitId)).leftJoin(healthCareAgreements, eq(healthCareAgreements.id, healthProcedurePriceTables.agreementId)).where(unitIds ? inArray(healthProcedurePriceTables.unitId, unitIds) : undefined).orderBy(desc(healthProcedurePriceTables.createdAt)).limit(50),
  ]);
  const items = await database.select({ item: healthProcedurePriceItems, procedure: { code: healthSusProcedures.code, description: healthSusProcedures.description } }).from(healthProcedurePriceItems).innerJoin(healthSusProcedures, eq(healthSusProcedures.id, healthProcedurePriceItems.procedureId)).where(inArray(healthProcedurePriceItems.tableId, tableRows.map(row => row.table.id)));
  const tables = tableRows.map(row => ({ ...row.table, unit: row.unit, agreement: row.agreement, items: items.filter(item => item.item.tableId === row.table.id).map(item => ({ ...item.item, procedure: item.procedure })) }));
  return <main className="space-y-4 p-4"><header><Link href="/saude/producao" className="text-sm underline">Produção e faturamento</Link><h1 className="text-xl font-semibold">Tabelas auxiliares de preços com vigência</h1></header><PriceTableForm units={units} agreements={agreements}/><section className="space-y-2"><h2 className="font-semibold">Últimas 50 versões publicadas no escopo autorizado</h2>{tables.map(table => <details key={table.id} className="rounded border bg-white p-3 text-sm"><summary className="cursor-pointer font-semibold">{table.unit.name} · {table.code} · versão {table.version} · {table.name}</summary><p>{table.agreement?.name || "Tabela auxiliar geral da unidade"} · {table.validFrom.toLocaleDateString("pt-BR", { timeZone: "UTC" })} a {table.validUntil.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</p><p>Fonte: {table.sourceReference} · publicada por {table.actorUsuarioId} em {table.createdAt.toLocaleString("pt-BR")}</p>{table.items.map(item => <p key={item.id}>{item.procedure.code} · {item.procedure.description} · R$ {item.unitValue.toFixed(6)}</p>)}</details>)}</section></main>;
}
