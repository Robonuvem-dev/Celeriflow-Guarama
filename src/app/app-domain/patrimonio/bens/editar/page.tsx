import Link from "next/link";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { assetOperationWhere } from "@/lib/patrimonio/asset-operations";
import { AssetEditForm } from "../[id]/editar/AssetEditForm";
import { EquipmentCustodyEditForm } from "./EquipmentCustodyEditForm";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assets, assetCategories } from "@/db/schema/assets";
import { equipmentCustodies } from "@/db/schema/assets-stock";
import { departments, employees } from "@/db/schema/administration";

export default async function EditarBemPage({ searchParams }: { searchParams: Promise<{ id?: string; kind?: string }> }) {
  const context = await getTenantContextForModuleOperation("PATRIMONIO", "update");
  const params = await searchParams;
  const scope = assetOperationWhere(context);
  if (params.kind === "custody" && params.id) {
    const [loaded] = await db.select({ equipment: equipmentCustodies, department: { name: departments.name }, responsible: { name: employees.name } }).from(equipmentCustodies)
      .innerJoin(departments, eq(departments.id, equipmentCustodies.departmentId)).innerJoin(employees, eq(employees.id, equipmentCustodies.responsibleId))
      .where(and(eq(equipmentCustodies.id, params.id), scope.departmentId ? eq(equipmentCustodies.departmentId, scope.departmentId) : undefined)).limit(1);
    const equipment = loaded ? { ...loaded.equipment, department: loaded.department, responsible: loaded.responsible } : undefined;
    if (equipment) return <EquipmentCustodyEditForm equipment={{ id: equipment.id, code: equipment.code, name: equipment.name, serialNumber: equipment.serialNumber || "", status: equipment.status, department: equipment.department.name, responsible: equipment.responsible.name }} />;
  } else if (params.id) {
    const [asset, categories] = await Promise.all([
      db.select().from(assets).where(and(eq(assets.id, params.id), scope.departmentId ? eq(assets.departmentId, scope.departmentId) : undefined)).limit(1).then(rows => rows[0]),
      db.select({ id: assetCategories.id, name: assetCategories.name }).from(assetCategories).where(eq(assetCategories.isActive, true)).orderBy(asc(assetCategories.name)),
    ]);
    if (asset && asset.status !== "Baixado") return <AssetEditForm asset={{ id: asset.id, code: asset.code, patrimonyNumber: asset.patrimonyNumber, name: asset.name, description: asset.description || "", brand: asset.brand || "", model: asset.model || "", serialNumber: asset.serialNumber || "", categoryId: asset.categoryId }} categories={categories} />;
    if (asset?.status === "Baixado") return <section className="p-4 text-sm"><p>O bem está baixado. O cadastro permanece disponível para consulta do histórico.</p><Link href={`/patrimonio/bens/${encodeURIComponent(asset.id)}`} className="text-emerald-800 underline">Consultar ficha do bem</Link></section>;
  }
  return <section className="p-4 text-sm"><h1 className="font-semibold">Bem indisponível para edição</h1><p>O registro não foi localizado no seu setor autorizado. Atualize a listagem e selecione o bem novamente.</p><Link href="/patrimonio/bens" className="text-emerald-800 underline">Voltar à lista de bens</Link></section>;
}
