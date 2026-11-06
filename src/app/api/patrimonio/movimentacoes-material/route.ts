import { db } from "@/db/client";
import { materialMovements, materialStocks, warehouses } from "@/db/schema/assets-stock";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export async function GET(request: Request) {
  try {
    await getTenantContextForModule("PATRIMONIO");
    const { searchParams } = new URL(request.url);
    const materialId = searchParams.get("materialId");
    const periodStart = searchParams.get("periodStart");
    const periodEnd = searchParams.get("periodEnd");

    if (!materialId) {
      return Response.json({ movements: [] });
    }

    const conditions = [eq(materialMovements.materialId, materialId)];

    if (periodStart) {
      conditions.push(gte(materialMovements.date, new Date(`${periodStart}T00:00:00.000Z`)));
    }
    if (periodEnd) {
      conditions.push(lte(materialMovements.date, new Date(`${periodEnd}T23:59:59.999Z`)));
    }

    const rows = await db
      .select({
        id: materialMovements.id,
        date: materialMovements.date,
        type: materialMovements.type,
        quantity: materialMovements.quantity,
        unitValue: materialMovements.unitValue,
        unitValueDecimal: materialMovements.unitValueDecimal,
        totalValueDecimal: materialMovements.totalValueDecimal,
        reason: materialMovements.reason,
        warehouseName: warehouses.name,
        batchNumber: materialStocks.batchNumber,
      })
      .from(materialMovements)
      .innerJoin(warehouses, eq(warehouses.id, materialMovements.warehouseId))
      .leftJoin(materialStocks, eq(materialStocks.id, materialMovements.stockId))
      .where(and(...conditions))
      .orderBy(desc(materialMovements.date))
      .limit(100);

    const movements = rows.map((r) => {
      const unitCost = r.unitValue !== null && r.unitValue !== undefined
        ? Number(r.unitValue)
        : r.unitValueDecimal !== null && r.unitValueDecimal !== undefined
          ? Number(r.unitValueDecimal)
          : null;
      const totalCost = r.totalValueDecimal !== null && r.totalValueDecimal !== undefined
        ? Number(r.totalValueDecimal)
        : unitCost !== null
          ? unitCost * Number(r.quantity)
          : null;

      return {
        id: r.id,
        date: r.date.toLocaleString("pt-BR"),
        type: r.type,
        quantity: Number(r.quantity),
        unitCost,
        totalCost,
        notes: r.reason || "—",
        warehouseName: r.warehouseName,
        batchNumber: r.batchNumber || "—",
      };
    });

    return Response.json({ movements });
  } catch (error) {
    console.error("Erro ao buscar movimentações analíticas:", error);
    return Response.json({ error: "Falha na consulta" }, { status: 500 });
  }
}
