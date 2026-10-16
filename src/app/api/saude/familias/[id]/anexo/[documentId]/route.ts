import { getTenantContextForModule, assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { getFile, downloadFilename } from "@/lib/platform/blob";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const context = await getTenantContextForModule("SAUDE"), parameters = await params;
  const family = await context.prisma.healthFamily.findUniqueOrThrow({ where: { id: decodeURIComponent(parameters.id) }, include: { household: { include: { microarea: { include: { area: true } } } } } });
  const unitId = family.unitId || family.household?.microarea?.area.unitId;
  if (unitId) assertHealthUnitAccess(context.user, unitId); else if (context.user.hasHealthAccessScope) return Response.json({ error: "Família fora do escopo autorizado." }, { status: 403 });
  const link = await context.prisma.healthFamilyDocument.findFirst({ where: { familyId: family.masterFamilyId || "__SEM_FAMILIA__", documentId: decodeURIComponent(parameters.documentId) }, include: { document: true } });
  if (!link) return Response.json({ error: "Documento não encontrado." }, { status: 404 });
  const file = await getFile(link.document.fileUrl); if (!file) return Response.json({ error: "Arquivo indisponível." }, { status: 404 });
  return new Response(file.stream, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `inline; filename="${downloadFilename(link.document.title)}"`, "Cache-Control": "no-store" } });
}
