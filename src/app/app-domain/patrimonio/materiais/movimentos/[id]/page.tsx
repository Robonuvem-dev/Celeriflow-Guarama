import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContextForModule, isSystemAdministrator, canViewModule } from "@/lib/platform/tenant-context";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { materialMovements, materials, warehouses } from "@/db/schema/assets-stock";
import { departments } from "@/db/schema/administration";
export default async function StockMovementOrigin({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("PATRIMONIO"), { id } = await params;
  if (!isSystemAdministrator(context.user) && !context.user.departmentId) notFound();
  const [loaded] = await db.select({ movement: materialMovements, material: { code: materials.code, name: materials.name, unitOfMeasure: materials.unitOfMeasure }, warehouse: { name: warehouses.name }, department: { name: departments.name },
    fleetConsumption: sql<{ id: string; unitId: string; unit: { code: string; departmentId: string } } | null>`(SELECT json_build_object('id',c.id,'unitId',c."unitId",'unit',json_build_object('code',u.code,'departmentId',u."departmentId")) FROM "FleetConsumption" c JOIN "FleetUnit" u ON u.id=c."unitId" WHERE c."stockMovementId"=${materialMovements.id})` }).from(materialMovements)
    .innerJoin(materials, eq(materials.id, materialMovements.materialId)).innerJoin(warehouses, eq(warehouses.id, materialMovements.warehouseId)).leftJoin(departments, eq(departments.id, materialMovements.departmentId))
    .where(and(eq(materialMovements.id, id), isSystemAdministrator(context.user) ? undefined : or(eq(materialMovements.departmentId, context.user.departmentId!), sql`EXISTS (SELECT 1 FROM "FleetConsumption" c JOIN "FleetUnit" u ON u.id=c."unitId" WHERE c."stockMovementId"=${materialMovements.id} AND u."departmentId"=${context.user.departmentId})`))).limit(1);
  const m = loaded ? { ...loaded.movement, material: loaded.material, warehouse: loaded.warehouse, department: loaded.department, fleetConsumption: loaded.fleetConsumption } : undefined;
  if (!m) notFound();
  return <PageFrame className="space-y-3"><PageHeader title="Movimento de material · Almoxarifado" action={<Link href="/patrimonio/materiais" className="rounded border bg-white px-3 py-2 text-sm">Materiais</Link>} /><dl className="grid gap-4 rounded-md border bg-white p-4 text-sm sm:grid-cols-2">{Object.entries({ "Identificação": m.id, "Tipo": m.type, "Material": `${m.material.code} · ${m.material.name}`, "Quantidade": `${m.quantity} ${m.material.unitOfMeasure}`, "Custo unitário": m.unitValue == null ? "Não informado" : m.unitValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), "Data da movimentação": m.date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), "Almoxarifado": m.warehouse.name, "Setor destinatário": m.department?.name || "Sem setor", "Motivo": m.reason || "—" }).map(([key, value]) => <div key={key}><dt className="text-xs text-slate-500">{key}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl>{m.fleetConsumption && canViewModule(context.user, "FROTAS") && (isSystemAdministrator(context.user) || m.fleetConsumption.unit.departmentId === context.user.departmentId) && <Link href={`/frotas?area=consumos&unitId=${encodeURIComponent(m.fleetConsumption.unitId)}`} className="block rounded border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">Abrir consumo apropriado em Frotas · {m.fleetConsumption.unit.code}</Link>}</PageFrame>;
}
