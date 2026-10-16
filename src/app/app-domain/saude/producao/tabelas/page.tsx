import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PriceTableForm } from "./PriceTableForm";
export default async function HealthPricesPage() {
  const context = await getTenantContextForModule("SAUDE"), unitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const [units, agreements, tables] = await Promise.all([
    context.prisma.healthUnit.findMany({ where: { isActive: true, ...(unitIds ? { id: { in: unitIds } } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    context.prisma.healthCareAgreement.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    context.prisma.healthProcedurePriceTable.findMany({ where: unitIds ? { unitId: { in: unitIds } } : {}, orderBy: { createdAt: "desc" }, take: 50, include: { unit: { select: { name: true } }, agreement: { select: { name: true } }, items: { include: { procedure: { select: { code: true, description: true } } } } } }),
  ]);
  return <main className="space-y-4 p-4"><header><Link href="/saude/producao" className="text-sm underline">Produção e faturamento</Link><h1 className="text-xl font-semibold">Tabelas auxiliares de preços com vigência</h1></header><PriceTableForm units={units} agreements={agreements}/><section className="space-y-2"><h2 className="font-semibold">Últimas 50 versões publicadas no escopo autorizado</h2>{tables.map(table => <details key={table.id} className="rounded border bg-white p-3 text-sm"><summary className="cursor-pointer font-semibold">{table.unit.name} · {table.code} · versão {table.version} · {table.name}</summary><p>{table.agreement?.name || "Tabela auxiliar geral da unidade"} · {table.validFrom.toLocaleDateString("pt-BR", { timeZone: "UTC" })} a {table.validUntil.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</p><p>Fonte: {table.sourceReference} · publicada por {table.actorUsuarioId} em {table.createdAt.toLocaleString("pt-BR")}</p>{table.items.map(item => <p key={item.id}>{item.procedure.code} · {item.procedure.description} · R$ {item.unitValue.toFixed(6)}</p>)}</details>)}</section></main>;
}
