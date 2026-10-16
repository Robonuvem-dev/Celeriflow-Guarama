import { getPlanningContext } from "./access";
import type { PlanningJurisdiction } from "./policy";
import { ingestPlanningDocument } from "./documents";
import { AccessError, canPerformModuleOperation } from "@/lib/platform/tenant-context";

export async function planningDocumentUploadResponse(request: Request, jurisdiction: PlanningJurisdiction) {
  try {
    const context = await getPlanningContext(jurisdiction);
    if (!canPerformModuleOperation(context.user, "DOCUMENTOS", "create")) throw new AccessError("Ingresso documental não autorizado.", 403);
    if (Number(request.headers.get("content-length") ?? 0) > 21 * 1024 * 1024) return Response.json({ error: "Arquivo excede o limite de 20 MB." }, { status: 413 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Selecione um arquivo." }, { status: 400 });
    const input = Object.fromEntries([...form.entries()].filter(([key, value]) => key !== "file" && typeof value === "string" && value !== ""));
    return Response.json({ id: await ingestPlanningDocument(context, input, file) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error && !error.message.includes("Invalid `") ? error.message : "Não foi possível registrar o documento." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
