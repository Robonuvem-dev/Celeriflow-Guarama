import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { WarehouseForm } from "../WarehouseForm";
import { createWarehouseAction } from "../actions";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { costCenters as costCenterTable } from "@/db/schema/master-data";

export default async function NovoAlmoxarifadoPage() {
  await getTenantContextForModule("PATRIMONIO");
  const costCenters = await db.select({ id: costCenterTable.id, code: costCenterTable.code, name: costCenterTable.name }).from(costCenterTable).where(eq(costCenterTable.isActive, true)).orderBy(asc(costCenterTable.code), asc(costCenterTable.name));
  return <WarehouseForm title="Novo Almoxarifado" submitLabel="Salvar almoxarifado" costCenters={costCenters} action={createWarehouseAction} />;
}
