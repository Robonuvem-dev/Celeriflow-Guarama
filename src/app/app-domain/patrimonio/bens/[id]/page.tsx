import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContextForModule, canPerformModuleOperation, canViewModule } from "@/lib/platform/tenant-context";
import { assetOperationWhere } from "@/lib/patrimonio/asset-operations";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { AssetOperationsClient } from "./AssetOperationsClient";
import { and, asc, count as rowCount, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { assets, assetMaintenances, assetTransfers } from "@/db/schema/assets";
import { departments, employees } from "@/db/schema/administration";

export const dynamic = "force-dynamic";
const day = (v: Date | null) => v?.toISOString().slice(0, 10).split("-").reverse().join("/") || "—";
export default async function AssetDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const context = await getTenantContextForModule("PATRIMONIO"), { id: routeId } = await params;
  let id: string;
  try { id = decodeURIComponent(routeId); } catch { notFound(); }
  const page = Math.min(100000, Math.max(1, Number.parseInt((await searchParams).page || "1", 10) || 1));
  const scope = assetOperationWhere(context);
  const [loaded] = await db.select({ asset: assets, department: { name: departments.name }, responsible: { name: employees.name }, fleetUnit: sql<{ id: string; code: string; name: string; status: string } | null>`(SELECT json_build_object('id',u.id,'code',u.code,'name',u.name,'status',u.status) FROM "FleetUnit" u WHERE u."assetId"=${assets.id})` }).from(assets)
    .leftJoin(departments, eq(departments.id, assets.departmentId)).leftJoin(employees, eq(employees.id, assets.responsibleId))
    .where(and(eq(assets.id, id), scope.departmentId ? eq(assets.departmentId, scope.departmentId) : undefined)).limit(1);
  const asset = loaded ? { ...loaded.asset, department: loaded.department, responsible: loaded.responsible, fleetUnit: loaded.fleetUnit } : undefined;
  if (!asset) notFound();
  const fromDepartments = alias(departments, "transfer_origin"), toDepartments = alias(departments, "transfer_destination");
  const maintenanceSelection = { maintenance: assetMaintenances, fleetOrderId: sql<string | null>`(SELECT o.id FROM "FleetWorkOrder" o WHERE o."assetMaintenanceId"="AssetMaintenance"."id")` };
  const [maintenances, count, open, transfers] = await Promise.all([
    db.select(maintenanceSelection).from(assetMaintenances).where(eq(assetMaintenances.assetId, id)).orderBy(desc(assetMaintenances.startDate), desc(assetMaintenances.id)).limit(10).offset((page - 1) * 10)
      .then(rows => rows.map(row => ({ ...row.maintenance, fleetOrder: row.fleetOrderId ? { id: row.fleetOrderId } : null }))),
    db.select({ count: rowCount() }).from(assetMaintenances).where(eq(assetMaintenances.assetId, id)).then(rows => rows[0].count),
    db.select(maintenanceSelection).from(assetMaintenances).where(and(eq(assetMaintenances.assetId, id), inArray(assetMaintenances.status, ["Solicitada", "Em manutenção"]))).orderBy(asc(assetMaintenances.startDate), asc(assetMaintenances.id))
      .then(rows => rows.map(row => ({ ...row.maintenance, fleetOrder: row.fleetOrderId ? { id: row.fleetOrderId } : null }))),
    db.select({ transfer: assetTransfers, fromDepartment: { name: fromDepartments.name }, toDepartment: { name: toDepartments.name }, toResponsible: { name: employees.name } }).from(assetTransfers)
      .leftJoin(fromDepartments, eq(fromDepartments.id, assetTransfers.fromDepartmentId)).leftJoin(toDepartments, eq(toDepartments.id, assetTransfers.toDepartmentId)).leftJoin(employees, eq(employees.id, assetTransfers.toResponsibleId))
      .where(eq(assetTransfers.assetId, id)).orderBy(desc(assetTransfers.date), desc(assetTransfers.id)).limit(10)
      .then(rows => rows.map(row => ({ ...row.transfer, fromDepartment: row.fromDepartment, toDepartment: row.toDepartment, toResponsible: row.toResponsible }))),
  ]);
  return <PageFrame className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
    <PageHeader title={`${asset.code || asset.patrimonyNumber} · ${asset.name}`} action={<Link href="/patrimonio/bens" className="rounded border bg-white px-3 py-2 text-sm">Bens patrimoniais</Link>} />
    <p className="text-xs text-slate-600">Código do equipamento: {asset.code || "Não identificado"} · Tombamento: {asset.patrimonyNumber}</p>
    <dl className="grid gap-3 rounded-md border bg-white p-4 text-sm sm:grid-cols-3">{Object.entries({ "Setor de origem": asset.department?.name || "Sem setor", "Responsável": asset.responsible?.name || "Não informado", "Situação patrimonial": asset.status, "Marca / modelo": [asset.brand, asset.model].filter(Boolean).join(" / ") || "—", "Documento de aquisição": asset.invoiceNumber || "—", "Valor contábil": asset.currentValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) }).map(([title, value]) => <div key={title}><dt className="text-xs text-slate-500">{title}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
    {asset.fleetUnit && canViewModule(context.user, "FROTAS") && <Link href={`/frotas?unitId=${encodeURIComponent(asset.fleetUnit.id)}`} className="block rounded border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">Abrir unidade em Frotas · {asset.fleetUnit.code} · {asset.fleetUnit.name}</Link>}
    <AssetOperationsClient key={asset.updatedAt.toISOString()} assetId={id} version={asset.updatedAt.toISOString()} canUpdate={!['Baixado', 'Inativo'].includes(asset.status) && canPerformModuleOperation(context.user, "PATRIMONIO", "update")} maintenances={open.map(m => ({ id: m.id, description: m.description, startDate: m.startDate.toISOString().slice(0, 10), status: m.status, fleetOrderId: m.fleetOrder?.id || null }))} />
    <section className="rounded-md border bg-white"><h2 className="border-b p-3 text-sm font-semibold">Histórico de manutenções · origem compartilhada</h2><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-50"><tr>{["Início / conclusão", "Serviços", "Situação", "Custo de serviços", "OS de origem"].map(v => <th key={v} className="p-3 font-medium">{v}</th>)}</tr></thead><tbody>{maintenances.map(m => <tr key={m.id} className="border-t"><td className="p-3">{day(m.startDate)} / {day(m.endDate)}</td><td className="max-w-80 whitespace-pre-wrap p-3">{m.description}</td><td className="p-3">{m.status}</td><td className="p-3">{m.cost == null ? "Não informado" : m.cost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td><td className="p-3">{m.fleetOrder?.id || "Patrimônio"}</td></tr>)}{!maintenances.length && <tr><td colSpan={5} className="p-4 text-slate-500">Nenhuma manutenção neste recorte.</td></tr>}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-xs"><span>{count} manutenção(ões) · página {page}</span><div className="flex gap-3">{page > 1 && <Link href={`?page=${page - 1}`}>Anterior</Link>}{page * 10 < count && <Link href={`?page=${page + 1}`}>Próxima</Link>}</div></div></section>
    <section className="rounded-md border bg-white p-4"><h2 className="text-sm font-semibold">Últimas 10 transferências aprovadas</h2><ul className="mt-3 space-y-3 text-sm">{transfers.map(t => <li key={t.id}>{day(t.date)} · {t.fromDepartment?.name || "Sem setor"} → {t.toDepartment?.name || "Sem setor"} · {t.toResponsible?.name || "Sem responsável"}<p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{t.reason}</p></li>)}{!transfers.length && <li className="text-slate-500">Nenhuma transferência registrada.</li>}</ul></section>
    <Link href="/patrimonio/ciclo-vida" className="inline-block rounded border bg-white px-3 py-2 text-sm">Depreciação, ajustes e baixa patrimonial</Link>
  </PageFrame>;
}
