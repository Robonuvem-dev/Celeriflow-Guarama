import { AccessError, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { previewNextAssetPatrimonyNumber } from "@/lib/patrimonio/identifiers";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export async function GET(request: Request) {
  try {
    await getTenantContextForModule("PATRIMONIO");
    const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) || "";
    const pattern = `%${q}%`;
    const receiptItems = (await db.execute<{ id: string; quantity: number; quantityIncorporated: number; brand: string | null; model: string | null; serialNumber: string | null; code: string; name: string; description: string | null; receiptNumber: string }>(sql`
      SELECT i.id, i.quantity, i."quantityIncorporated", i.brand, i.model, i."serialNumber", m.code, m.name, m.description, r.number AS "receiptNumber"
      FROM "PurchaseReceiptItem" i JOIN "PurchaseReceipt" r ON r.id=i."purchaseReceiptId" JOIN "Material" m ON m.id=i."materialId"
      WHERE r.status='APPROVED' AND m.type='PATRIMONIO' ${q ? sql`AND (m.name ILIKE ${pattern} OR m.code ILIKE ${pattern} OR r.number ILIKE ${pattern} OR i.brand ILIKE ${pattern} OR i.model ILIKE ${pattern} OR i."serialNumber" ILIKE ${pattern})` : sql``}
      ORDER BY i."createdAt" DESC, i.id ASC LIMIT 100`)).rows;
    const options = receiptItems
      .filter((item) => item.quantityIncorporated < item.quantity)
      .slice(0, 20)
      .map((item) => ({
        id: item.id,
        label: `${item.receiptNumber} · ${item.code} · ${item.name}`,
        remaining: item.quantity - item.quantityIncorporated,
        name: item.name,
        description: item.description,
        brand: item.brand,
        model: item.model,
        serialNumber: item.serialNumber,
      }));
    const suggestedPatrimonyNumber = options.length ? await previewNextAssetPatrimonyNumber(db) : null;
    return Response.json({ options, suggestedPatrimonyNumber }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof AccessError ? error.message : "Não foi possível consultar os itens recebidos." },
      { status: error instanceof AccessError ? error.status : 500 },
    );
  }
}
