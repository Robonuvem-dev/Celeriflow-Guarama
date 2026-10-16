import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getTenantContextForModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import { extractConstructionPlan, comparePlanZoning, PLAN_MAX_BYTES } from "@/lib/obras/construction-extraction";
import { uploadFile } from "@/lib/platform/blob";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContextForModuleOperation("OBRAS", "update");
    const access = await resolveConstructionAccess(context);
    if (!access.administrator && !access.roles.some((role) => ["ANALYST", "MANAGER"].includes(role))) throw new AccessError("Extração restrita à análise técnica.", 403);
    if (Number(request.headers.get("content-length")) > PLAN_MAX_BYTES + 65536) throw new Error("Arquivo superior a 15 MB.");
    const form = await request.formData();
    const data = z.object({ caseId: z.string().min(1), requestKey: z.uuid() }).parse({ caseId: form.get("caseId"), requestKey: form.get("requestKey") });
    const file = form.get("file");
    if (!(file instanceof File) || file.type !== "application/pdf" || file.size > PLAN_MAX_BYTES) throw new Error("Selecione um PDF de até 15 MB.");
    const scope = { AND: [{ id: data.caseId }, constructionCaseWhere(access)] };
    const item = await context.prisma.constructionCase.findFirst({ where: scope, include: { properties: { include: { realEstate: { include: { constructionZone: { include: { zone: true } } } } } } } });
    if (!item) throw new AccessError("Processo indisponível.", 404);
    const previous = await context.prisma.constructionPlanExtraction.findUnique({ where: { requestKey: data.requestKey } });
    if (previous) {
      if (previous.caseId !== item.id || previous.createdBy !== context.user.id) throw new AccessError("Referência indisponível.", 404);
      return NextResponse.json({ id: previous.id });
    }
    const result = await extractConstructionPlan(new Uint8Array(await file.arrayBuffer()));
    const today = new Date();
    const comparison = item.properties.map((property) => {
      const zone = property.realEstate.constructionZone?.zone;
      return { realEstateId: property.realEstateId, ...comparePlanZoning(result.measurements, zone ? { id: zone.id, version: zone.version, legalBasis: zone.legalBasis, minimumLandArea: zone.minimumLandArea.toString(), maxFloorAreaRatio: zone.maxFloorAreaRatio.toString(), active: zone.startsAt <= today && (!zone.endsAt || zone.endsAt >= today) } : null) };
    });
    if (item.properties.length > 1) {
      result.limitations.push("Processo com múltiplos imóveis: medições da prancha não foram atribuídas individualmente aos lotes; comparação territorial inconclusiva.");
      for (const entry of comparison) entry.status = "INSUFFICIENT_EVIDENCE";
    }
    const blob = await uploadFile(file);
    const saved = await context.prisma.$transaction(async (tx) => {
      if (!await tx.constructionCase.findFirst({ where: scope, select: { id: true } })) throw new AccessError("Processo indisponível.", 404);
      const row = await tx.constructionPlanExtraction.create({ data: { ...data, filename: file.name.slice(0, 200), sourceUrl: blob.url, sourceHash: result.sourceHash, engine: result.engine, model: result.model, status: result.status, pages: result.pages as unknown as Prisma.InputJsonValue, measurements: result.measurements as unknown as Prisma.InputJsonValue, comparison: comparison as unknown as Prisma.InputJsonValue, limitations: result.limitations, createdBy: context.user.id } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionPlanExtraction", targetId: row.id });
      return row;
    });
    return NextResponse.json({ id: saved.id });
  } catch (error) { return NextResponse.json({ error: error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível extrair a prancha." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
