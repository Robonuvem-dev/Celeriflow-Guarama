import "server-only";
import { ZodError } from "zod";
import { AccessError } from "@/lib/platform/tenant-context";
import { getPlanningContext } from "./access";
import type { PlanningJurisdiction } from "./policy";
import { generatePlanningReport, persistPlanningReport, readPreservedPlanningReport } from "./reports";
import { generateReportPdf } from "@/lib/financeiro/report-export";
import { renderTabularCsv } from "@/lib/reports/tabular-renderers";
import { createDefaultReportTemplate, type ReportEmissionMetadata, type ReportInstitutionIdentity } from "@/lib/reports/report-template";
import { planningPdfDataset } from "./report-presentation";
import { publishPlanningReport, readPlanningArchivedFile } from "./publication";

export async function planningReportResponse(request: Request, jurisdiction: PlanningJurisdiction) {
  try {
    const query = new URL(request.url).searchParams;
    const filters = Object.fromEntries([...query].filter(([, value]) => value !== ""));
    filters.instrumentIds = [filters.instrumentIds, ...query.getAll("additionalInstrumentIds")].filter(Boolean).join(",");
    const context = await getPlanningContext(jurisdiction);
    const snapshotId = query.get("snapshotId");
    const preserved = snapshotId ? await readPreservedPlanningReport(context, snapshotId) : null;
    const dataset = preserved?.dataset ?? await generatePlanningReport(context, filters);
    const document = dataset as typeof dataset & { planningIdentity?: ReportInstitutionIdentity; planningEmission?: ReportEmissionMetadata };
    const presentation = { institution: document.planningIdentity ?? null, template: { ...createDefaultReportTemplate(), orientation: "LANDSCAPE" as const }, emission: document.planningEmission ?? { issuedAt: new Date().toISOString(), issuedBy: context.user.name } };
    const format = query.get("format") ?? "PDF";
    if (!["PDF", "CSV"].includes(format)) return Response.json({ error: "Formato inválido." }, { status: 400 });
    if (snapshotId) { const archived = await readPlanningArchivedFile(context, snapshotId, format as "PDF" | "CSV"); if (archived) return new Response(new Uint8Array(archived.bytes), { headers: { "Content-Type": archived.contentType, "Content-Disposition": `attachment; filename="${archived.filename}"`, "Cache-Control": "private, no-store", "X-Report-File-SHA256": archived.hash, "X-Report-Dataset-Hash": preserved!.hash } }); }
    const body = format === "PDF" ? new Uint8Array(await generateReportPdf(planningPdfDataset(dataset), presentation)) : renderTabularCsv(dataset, presentation);
    return new Response(body, { headers: { "Content-Type": format === "PDF" ? "application/pdf" : "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="planejamento-${(preserved?.reportType ?? filters.type).toLowerCase()}-${dataset.year}.${format.toLowerCase()}"`, "Cache-Control": "private, no-store", ...(preserved ? { "X-Report-Hash": preserved.hash } : {}) } });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) return Response.json({ error: error.issues.map((row) => row.message).join(" ") }, { status: 400 });
    return Response.json({ error: error instanceof Error && !error.message.includes("Invalid `") ? error.message : "Não foi possível emitir o relatório." }, { status: 400 });
  }
}

export async function planningReportSnapshotResponse(request: Request, jurisdiction: PlanningJurisdiction) {
  try {
    const context = await getPlanningContext(jurisdiction); const input = await request.json(); const snapshot = await persistPlanningReport(context, input);
    if (input.publishSimultaneous === true || input.publishSimultaneous === "true") {
      try { const published = await publishPlanningReport(context, { snapshotId: snapshot.id, format: input.format ?? "PDF", reason: input.publicationReason ?? "Publicação solicitada na emissão orçamentária" }); return Response.json({ id: snapshot.id, hash: snapshot.hash, status: snapshot.status, publicationStatus: published.status, publicUrl: published.publicUrl, fileHash: published.fileHash }); }
      catch (error) { return Response.json({ id: snapshot.id, hash: snapshot.hash, status: snapshot.status, publicationStatus: "FAILED", publicationError: error instanceof Error && !error.message.includes("Invalid `") ? error.message : "Publicação não confirmada; o documento interno foi preservado." }); }
    }
    return Response.json({ id: snapshot.id, hash: snapshot.hash, status: snapshot.status });
  }
  catch (error) {
    const message = error instanceof ZodError ? error.issues.map((row) => row.message).join(" ") : error instanceof Error && !error.message.includes("Invalid `") ? error.message : "Não foi possível preservar o relatório.";
    return Response.json({ error: message }, { status: error instanceof AccessError ? 403 : 400 });
  }
}
