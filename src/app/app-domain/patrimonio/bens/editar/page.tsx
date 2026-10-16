import Link from "next/link";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { assetOperationWhere } from "@/lib/patrimonio/asset-operations";
import { AssetEditForm } from "../[id]/editar/AssetEditForm";
import { EquipmentCustodyEditForm } from "./EquipmentCustodyEditForm";

export default async function EditarBemPage({ searchParams }: { searchParams: Promise<{ id?: string; kind?: string }> }) {
  const context = await getTenantContextForModuleOperation("PATRIMONIO", "update");
  const params = await searchParams;
  const scope = assetOperationWhere(context);
  if (params.kind === "custody" && params.id) {
    const equipment = await context.prisma.equipmentCustody.findFirst({ where: { id: params.id, ...(scope.departmentId ? { departmentId: scope.departmentId as string } : {}) }, include: { department: { select: { name: true } }, responsible: { select: { name: true } } } });
    if (equipment) return <EquipmentCustodyEditForm equipment={{ id: equipment.id, code: equipment.code, name: equipment.name, serialNumber: equipment.serialNumber || "", status: equipment.status, department: equipment.department.name, responsible: equipment.responsible.name }} />;
  } else if (params.id) {
    const [asset, categories] = await Promise.all([
      context.prisma.asset.findFirst({ where: { id: params.id, ...scope } }),
      context.prisma.assetCategory.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    if (asset && asset.status !== "Baixado") return <AssetEditForm asset={{ id: asset.id, code: asset.code, patrimonyNumber: asset.patrimonyNumber, name: asset.name, description: asset.description || "", brand: asset.brand || "", model: asset.model || "", serialNumber: asset.serialNumber || "", categoryId: asset.categoryId }} categories={categories} />;
    if (asset?.status === "Baixado") return <section className="p-4 text-sm"><p>O bem está baixado. O cadastro permanece disponível para consulta do histórico.</p><Link href={`/patrimonio/bens/${encodeURIComponent(asset.id)}`} className="text-emerald-800 underline">Consultar ficha do bem</Link></section>;
  }
  return <section className="p-4 text-sm"><h1 className="font-semibold">Bem indisponível para edição</h1><p>O registro não foi localizado no seu setor autorizado. Atualize a listagem e selecione o bem novamente.</p><Link href="/patrimonio/bens" className="text-emerald-800 underline">Voltar à lista de bens</Link></section>;
}
