import { getTenantContextForModule, assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { getFile, downloadFilename } from "@/lib/platform/blob";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { healthFamilies, healthHouseholds, healthMicroareas, healthTerritoryAreas, healthFamilyDocuments } from "@/db/schema/health-territory";
import { documents } from "@/db/schema/registry";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const context = await getTenantContextForModule("SAUDE"), parameters = await params;
  const database = context.database ?? db;
  const [family] = await database.select({ masterFamilyId: healthFamilies.masterFamilyId, unitId: healthFamilies.unitId, territoryUnitId: healthTerritoryAreas.unitId }).from(healthFamilies).leftJoin(healthHouseholds, eq(healthHouseholds.id, healthFamilies.householdId)).leftJoin(healthMicroareas, eq(healthMicroareas.id, healthHouseholds.microareaId)).leftJoin(healthTerritoryAreas, eq(healthTerritoryAreas.id, healthMicroareas.areaId)).where(eq(healthFamilies.id, decodeURIComponent(parameters.id))).limit(1);
  if (!family) throw new Error("Família não encontrada.");
  const unitId = family.unitId || family.territoryUnitId;
  if (unitId) assertHealthUnitAccess(context.user, unitId); else if (context.user.hasHealthAccessScope) return Response.json({ error: "Família fora do escopo autorizado." }, { status: 403 });
  const [link] = await database.select({ document: { title: documents.title, fileUrl: documents.fileUrl } }).from(healthFamilyDocuments).innerJoin(documents, eq(documents.id, healthFamilyDocuments.documentId)).where(and(eq(healthFamilyDocuments.familyId, family.masterFamilyId || "__SEM_FAMILIA__"), eq(healthFamilyDocuments.documentId, decodeURIComponent(parameters.documentId)))).limit(1);
  if (!link) return Response.json({ error: "Documento não encontrado." }, { status: 404 });
  const file = await getFile(link.document.fileUrl); if (!file) return Response.json({ error: "Arquivo indisponível." }, { status: 404 });
  return new Response(file.stream, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `inline; filename="${downloadFilename(link.document.title)}"`, "Cache-Control": "no-store" } });
}
