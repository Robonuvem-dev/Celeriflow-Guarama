import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { InvoiceImportForm } from "./InvoiceImportForm";
export default async function PharmacyInvoicesPage() {
  const context = await getTenantContextForModule("SAUDE");
  const unitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const [warehouses, products, suppliers] = await Promise.all([
    context.prisma.warehouse.findMany({ where: { isActive: true, healthUnitId: unitIds ? { in: unitIds } : { not: null } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    context.prisma.material.findMany({ where: { isActive: true, healthProfile: { isActive: true } }, select: { id: true, name: true, unitOfMeasure: true }, orderBy: { name: "asc" } }),
    context.prisma.supplier.findMany({ where: { status: "Ativo", companyId: { not: null } }, include: { company: true } }),
  ]);
  return <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3"><header className="flex flex-wrap justify-between gap-3"><h1 className="font-semibold">Entrada farmacêutica por XML da NF-e</h1><Link href="/saude/farmacia" className="text-sm underline">Entradas e estoque</Link></header><InvoiceImportForm warehouses={warehouses} products={products.map(product => ({ id: product.id, name: product.name, unit: product.unitOfMeasure }))} suppliers={suppliers.map(supplier => ({ id: supplier.id, name: supplier.company!.corporateName, cnpj: supplier.company!.cnpj }))} /></div>;
}
