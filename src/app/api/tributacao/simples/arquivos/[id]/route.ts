import { createHash } from "node:crypto";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { prisma, user } = await getTenantContextForModule("TRIBUTACAO"); const { id } = await params;
    const output = new URL(request.url).searchParams.get("tipo") === "saida";
    const row = await prisma.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "SIMPLES_OPTION_FILE", entityId: id, category: output ? "SIMPLES_OPTION_EXPORT" : "SIMPLES_OPTION_FILE" } });
    const data = taxScopeSnapshot(row.data);
    if (!isSystemAdministrator(user) && !user.allowedBudgetUnitIds.includes(String(data.budgetUnitId))) throw new Error("Arquivo fora da UG autorizada.");
    if (!await prisma.planningEntityUnit.findFirst({ where: { governmentEntityId: String(data.governmentEntityId), budgetUnitId: String(data.budgetUnitId) } })) throw new Error("Origem do arquivo não conciliada.");
    const bytes = output ? Buffer.from(String(data.content), "utf8") : Buffer.from(String(data.originalBase64), "base64");
    if (createHash("sha256").update(bytes).digest("hex") !== data.checksum) throw new Error("Integridade do arquivo inválida.");
    const filename = String(data.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    return new Response(bytes, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Arquivo indisponível." }, { status: 403, headers: { "Cache-Control": "private, no-store" } }); }
}
