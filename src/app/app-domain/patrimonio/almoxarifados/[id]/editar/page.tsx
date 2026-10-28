import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { WarehouseForm } from "../../WarehouseForm";
import { updateWarehouseAction } from "../../actions";
import { asc, eq, or } from "drizzle-orm";
import { db } from "@/db/client";
import { warehouses } from "@/db/schema/assets-stock";
import { employees } from "@/db/schema/administration";
import { costCenters as costCenterTable } from "@/db/schema/master-data";

export default async function EditarAlmoxarifadoPage({ params }: { params: Promise<{ id: string }> }) {
  await getTenantContextForModule("PATRIMONIO");
  const { id } = await params;
  const [loaded] = await db.select({ warehouse: warehouses, manager: { name: employees.name } }).from(warehouses).leftJoin(employees, eq(employees.id, warehouses.managerId)).where(eq(warehouses.id, id)).limit(1);
  const warehouse = loaded ? { ...loaded.warehouse, manager: loaded.manager } : undefined;
  if (!warehouse) notFound();
  const costCenters = await db.select({ id: costCenterTable.id, code: costCenterTable.code, name: costCenterTable.name }).from(costCenterTable)
    .where(or(eq(costCenterTable.isActive, true), warehouse.costCenterId ? eq(costCenterTable.id, warehouse.costCenterId) : undefined)).orderBy(asc(costCenterTable.code), asc(costCenterTable.name));
  const action = updateWarehouseAction.bind(null, warehouse.id);

  return <WarehouseForm title={`Editar Almoxarifado · ${warehouse.name}`} submitLabel="Salvar alterações" costCenters={costCenters} action={action} initial={{ ...warehouse, managerName: warehouse.manager?.name || "" }} />;
}
