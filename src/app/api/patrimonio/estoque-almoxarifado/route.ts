import { db } from "@/db/client";
import { materialStocks, materials } from "@/db/schema/assets-stock";
import { eq, desc } from "drizzle-orm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export async function GET(request: Request) {
  try {
    await getTenantContextForModule("PATRIMONIO");
    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get("warehouseId");

    if (!warehouseId) {
      return Response.json({ items: [] });
    }

    const rows = await db
      .select({
        id: materialStocks.id,
        quantity: materialStocks.quantity,
        batchNumber: materialStocks.batchNumber,
        material: {
          id: materials.id,
          code: materials.code,
          name: materials.name,
          unitOfMeasure: materials.unitOfMeasure,
        },
      })
      .from(materialStocks)
      .innerJoin(materials, eq(materials.id, materialStocks.materialId))
      .where(eq(materialStocks.warehouseId, warehouseId))
      .orderBy(desc(materialStocks.updatedAt));

    const items = rows.map((r) => {
      const physicalQuantity = Number(r.quantity || 0);
      const reservedQuantity = 0;
      const availableQuantity = physicalQuantity;
      return {
        id: r.id,
        code: r.material.code,
        name: r.material.name,
        unit: r.material.unitOfMeasure,
        physicalQuantity,
        reservedQuantity,
        availableQuantity,
        batchNumber: r.batchNumber,
      };
    });

    return Response.json({ items });
  } catch (error) {
    console.error("Erro ao buscar estoque do almoxarifado:", error);
    return Response.json({ error: "Falha na consulta de estoque" }, { status: 500 });
  }
}
