import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { JsonValue } from "@/db/json";
import { withDatabaseTransaction } from "@/db/transaction";
import { constructionPlanExtractions } from "@/db/schema/construction-integrations";
import { findConstructionCaseForAccess } from "@/db/repositories/infrastructure/construction-access";
import { listConstructionPlanPropertyZones } from "@/db/repositories/infrastructure/construction-integrations";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { getTenantContextForModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { extractConstructionPlan, comparePlanZoning, PLAN_MAX_BYTES } from "@/lib/obras/construction-extraction";
import { uploadFile } from "@/lib/platform/blob";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { constructionActionMessage } from "@/lib/obras/construction-errors";

export const runtime = "nodejs";
const json = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
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
    const item = await findConstructionCaseForAccess(databaseConnection.db, data.caseId, access);
    if (!item) throw new AccessError("Processo indisponível.", 404);
    const [previous] = await databaseConnection.db.select().from(constructionPlanExtractions).where(eq(constructionPlanExtractions.requestKey, data.requestKey)).limit(1);
    if (previous) {
      if (previous.caseId !== item.id || previous.createdBy !== context.user.id) throw new AccessError("Referência indisponível.", 404);
      return NextResponse.json({ id: previous.id });
    }
    const properties = await listConstructionPlanPropertyZones(databaseConnection.db, item.id);
    const result = await extractConstructionPlan(new Uint8Array(await file.arrayBuffer()));
    const today = new Date();
    const comparison = properties.map((property) => {
      const zone = property.zone;
      return { realEstateId: property.realEstateId, ...comparePlanZoning(result.measurements, zone ? { id: zone.id, version: zone.version, legalBasis: zone.legalBasis, minimumLandArea: zone.minimumLandArea.toString(), maxFloorAreaRatio: zone.maxFloorAreaRatio.toString(), active: zone.startsAt <= today && (!zone.endsAt || zone.endsAt >= today) } : null) };
    });
    if (properties.length > 1) {
      result.limitations.push("Processo com múltiplos imóveis: medições da prancha não foram atribuídas individualmente aos lotes; comparação territorial inconclusiva.");
      for (const entry of comparison) entry.status = "INSUFFICIENT_EVIDENCE";
    }
    const blob = await uploadFile(file);
    const saved = await withDatabaseTransaction(databaseConnection, async (tx) => {
      if (!await findConstructionCaseForAccess(tx, data.caseId, access)) throw new AccessError("Processo indisponível.", 404);
      const [row] = await tx.insert(constructionPlanExtractions).values({ ...data, filename: file.name.slice(0, 200), sourceUrl: blob.url, sourceHash: result.sourceHash, engine: result.engine, model: result.model, status: result.status, pages: json(result.pages), measurements: json(result.measurements), comparison: json(comparison), limitations: result.limitations, createdBy: context.user.id }).returning();
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionPlanExtraction", targetId: row.id });
      return row;
    });
    return NextResponse.json({ id: saved.id });
  } catch (error) { return NextResponse.json({ error: error instanceof z.ZodError ? error.message : constructionActionMessage(error, "Não foi possível extrair a prancha.") }, { status: error instanceof AccessError ? error.status : 400 }); }
}
