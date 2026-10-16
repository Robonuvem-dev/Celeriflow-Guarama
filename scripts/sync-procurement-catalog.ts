import { config } from "dotenv";
import { syncMaterialCatalog } from "../src/lib/compras/shared-catalog";
config({ path: ".env.local", quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const apply = process.argv.includes("--apply");
  try {
    const materials = await prisma.material.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, catalogItemId: true } });
    const ambiguous = await prisma.catalogItem.findMany({ where: { materials: { some: {} } }, select: { id: true, materials: { select: { id: true } } } });
    if (ambiguous.some(row => row.materials.length !== 1)) throw new Error("Revise os itens com mais de um material vinculado antes da sincronização.");
    let linkedRequests = 0, linkedProcesses = 0;
    if (apply) for (const material of materials) {
      const result = await prisma.$transaction(async tx => {
        const catalog = await syncMaterialCatalog(tx, material.id);
        const requests = await tx.purchaseRequestItem.updateMany({ where: { catalogItemId: catalog.id, materialId: null }, data: { materialId: material.id } });
        const processes = await tx.purchaseProcessItem.updateMany({ where: { catalogItemId: catalog.id, materialId: null }, data: { materialId: material.id } });
        return { requests: requests.count, processes: processes.count };
      }, { timeout: 15000 });
      linkedRequests += result.requests; linkedProcesses += result.processes;
    }
    const remaining = await prisma.material.count({ where: { catalogItemId: null } });
    console.log(JSON.stringify({ mode: apply ? "APPLIED" : "READ_ONLY", materials: materials.length, initiallyUnlinked: materials.filter(row => !row.catalogItemId).length, remainingUnlinked: remaining, linkedRequests, linkedProcesses, stockQuantitiesChanged: false }));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
