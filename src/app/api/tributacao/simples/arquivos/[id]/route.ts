import { createHash } from "node:crypto";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";
import { firstActionRegistryEntry, actionOriginExists } from "@/db/repositories/tax-actions/registry";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const { id } = await params;
    const database = taxActionConnection(context).db;
    const output = new URL(request.url).searchParams.get("tipo") === "saida";
    const row = await firstActionRegistryEntry(database, "SIMPLES_OPTION_FILE", id, output ? "SIMPLES_OPTION_EXPORT" : "SIMPLES_OPTION_FILE");
    if (!row) throw new Error("Arquivo não encontrado.");
    const data = taxScopeSnapshot(row.data);
    if (!isSystemAdministrator(user) && !user.allowedBudgetUnitIds.includes(String(data.budgetUnitId))) throw new Error("Arquivo fora da UG autorizada.");
    if (!await actionOriginExists(database, String(data.governmentEntityId), String(data.budgetUnitId))) throw new Error("Origem do arquivo não conciliada.");
    const bytes = output ? Buffer.from(String(data.content), "utf8") : Buffer.from(String(data.originalBase64), "base64");
    if (createHash("sha256").update(bytes).digest("hex") !== data.checksum) throw new Error("Integridade do arquivo inválida.");
    const filename = String(data.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    return new Response(bytes, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Arquivo indisponível." }, { status: 403, headers: { "Cache-Control": "private, no-store" } }); }
}
