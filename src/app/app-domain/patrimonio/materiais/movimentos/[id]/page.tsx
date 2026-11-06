import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Calendar, DollarSign, FileText, Hash, Layers, Package, Warehouse } from "lucide-react";
import { getTenantContextForModule, isSystemAdministrator, canViewModule } from "@/lib/platform/tenant-context";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { materialMovements, materials, materialStocks, warehouses } from "@/db/schema/assets-stock";
import { departments } from "@/db/schema/administration";

function formatMovementType(type: string) {
  const normalized = type.toUpperCase();
  if (normalized === "ENTRY" || normalized === "ENTRADA") return { label: "Entrada", badge: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  if (normalized === "EXIT" || normalized === "SAIDA" || normalized === "SAÍDA") return { label: "Saída", badge: "border-rose-200 bg-rose-50 text-rose-800" };
  if (normalized === "TRANSFER" || normalized === "TRANSFERENCIA" || normalized === "TRANSFERÊNCIA") return { label: "Transferência", badge: "border-sky-200 bg-sky-50 text-sky-800" };
  if (normalized === "REVERSAL" || normalized === "ESTORNO") return { label: "Estorno", badge: "border-purple-200 bg-purple-50 text-purple-800" };
  if (normalized === "ADJUSTMENT" || normalized === "AJUSTE") return { label: "Ajuste", badge: "border-amber-200 bg-amber-50 text-amber-800" };
  return { label: type, badge: "border-slate-200 bg-slate-100 text-slate-800" };
}

export default async function StockMovementOrigin({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("PATRIMONIO");
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  if (!isSystemAdministrator(context.user) && !context.user.departmentId) notFound();

  const [loaded] = await db
    .select({
      movement: materialMovements,
      material: { code: materials.code, name: materials.name, unitOfMeasure: materials.unitOfMeasure },
      warehouse: { name: warehouses.name, address: warehouses.address, type: warehouses.type },
      department: { name: departments.name },
      stock: { batchNumber: materialStocks.batchNumber, expirationDate: materialStocks.expirationDate },
      fleetConsumption: sql<{ id: string; unitId: string; unit: { code: string; departmentId: string } } | null>`(SELECT json_build_object('id',c.id,'unitId',c."unitId",'unit',json_build_object('code',u.code,'departmentId',u."departmentId")) FROM "FleetConsumption" c JOIN "FleetUnit" u ON u.id=c."unitId" WHERE c."stockMovementId"=${materialMovements.id})`,
    })
    .from(materialMovements)
    .innerJoin(materials, eq(materials.id, materialMovements.materialId))
    .innerJoin(warehouses, eq(warehouses.id, materialMovements.warehouseId))
    .leftJoin(departments, eq(departments.id, materialMovements.departmentId))
    .leftJoin(materialStocks, eq(materialStocks.id, materialMovements.stockId))
    .where(
      and(
        eq(materialMovements.id, id),
        isSystemAdministrator(context.user)
          ? undefined
          : or(
              eq(materialMovements.departmentId, context.user.departmentId!),
              sql`EXISTS (SELECT 1 FROM "FleetConsumption" c JOIN "FleetUnit" u ON u.id=c."unitId" WHERE c."stockMovementId"=${materialMovements.id} AND u."departmentId"=${context.user.departmentId})`,
            ),
      ),
    )
    .limit(1);

  const m = loaded
    ? {
        ...loaded.movement,
        material: loaded.material,
        warehouse: loaded.warehouse,
        department: loaded.department,
        stock: loaded.stock,
        fleetConsumption: loaded.fleetConsumption,
      }
    : undefined;

  if (!m) notFound();

  const typeInfo = formatMovementType(m.type);
  const totalCost = m.unitValue != null ? Math.abs(m.quantity) * m.unitValue : null;

  const details = [
    { label: "Identificação", value: m.id, icon: Hash },
    { label: "Tipo", value: `${typeInfo.label} (${m.type})`, icon: Layers },
    { label: "Material", value: `${m.material.code} · ${m.material.name}`, icon: Package },
    { label: "Quantidade", value: `${m.quantity.toLocaleString("pt-BR")} ${m.material.unitOfMeasure}`, icon: Layers },
    {
      label: "Custo unitário",
      value: m.unitValue == null ? "Não informado" : m.unitValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      icon: DollarSign,
    },
    {
      label: "Custo total estimado",
      value: totalCost == null ? "Não informado" : totalCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      icon: DollarSign,
    },
    {
      label: "Data da movimentação",
      value: m.date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      icon: Calendar,
    },
    {
      label: "Almoxarifado / Endereço",
      value: `${m.warehouse.name}${m.warehouse.address ? ` · ${m.warehouse.address}` : ""}`,
      icon: Warehouse,
    },
    { label: "Setor destinatário", value: m.department?.name || "Sem setor", icon: Building2 },
    {
      label: "Lote / Validade",
      value: `${m.stock?.batchNumber ? `Lote ${m.stock.batchNumber}` : "Sem lote"}${m.stock?.expirationDate ? ` · Val. ${m.stock.expirationDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : ""}`,
      icon: Package,
    },
    { label: "Motivo / Observação", value: m.reason || "—", icon: FileText },
  ];

  return (
    <PageFrame className="mx-auto max-w-4xl space-y-4 p-4">
      <PageHeader
        title="Movimento Analítico de Material · Almoxarifado"
        action={
          <Link
            href="/patrimonio/materiais"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50"
          >
            <ArrowLeft className="size-4" />
            Voltar para Materiais
          </Link>
        }
      />

      <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Material Movimentado</p>
            <h2 className="mt-0.5 text-base font-semibold text-slate-900">
              {m.material.code} · {m.material.name}
            </h2>
          </div>
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${typeInfo.badge}`}>
            {typeInfo.label}
          </span>
        </div>

        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {details.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3.5">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Icon className="size-3.5 text-slate-400" />
                {label}
              </dt>
              <dd className="mt-1.5 break-words font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {m.fleetConsumption &&
        canViewModule(context.user, "FROTAS") &&
        (isSystemAdministrator(context.user) || m.fleetConsumption.unit.departmentId === context.user.departmentId) && (
          <Link
            href={`/frotas?area=consumos&unitId=${encodeURIComponent(m.fleetConsumption.unitId)}`}
            className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50/90 px-4 py-3 text-sm font-medium text-teal-900 shadow-2xs transition hover:bg-teal-100/80"
          >
            <span>Abrir consumo apropriado em Frotas · {m.fleetConsumption.unit.code}</span>
            <span className="text-xs font-semibold underline">Visualizar em Frotas →</span>
          </Link>
        )}
    </PageFrame>
  );
}
