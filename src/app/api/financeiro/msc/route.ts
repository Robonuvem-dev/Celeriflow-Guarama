import { AccessError, getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { generateMunicipalMscArchive } from "@/lib/financeiro/msc-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "issueReports");
    const archive = await generateMunicipalMscArchive(context.prisma, { usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, { reportingScopeEntryId: params.get("reportingScopeEntryId"), period: params.get("period") });
    return new Response(new Uint8Array(archive.bytes), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${archive.filename}"`, "Cache-Control": "private, no-store", "X-MSC-CSV-SHA256": archive.csvHash, "X-MSC-Evidence-SHA256": archive.evidenceHash, "X-MSC-Archive-SHA256": archive.archiveHash } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível conciliar os dados da MSC." }, { status: error instanceof AccessError ? error.status : 400, headers: { "Cache-Control": "private, no-store" } });
  }
}
