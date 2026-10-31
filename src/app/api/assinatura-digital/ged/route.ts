import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { gedJobs, gedSmartFolders, gedTemplates } from "@/db/schema/ged-management";
import { listGedSection, requireManagedDocument } from "@/db/repositories/documents/ged";
import { getGedContext, canUseGed } from "@/lib/documents/ged-access";
import { gedQuerySchema, type GedQuery, type GedCapability, type GedZone } from "@/lib/documents/ged-policy";
import { checkoutGed, confirmGedUpload, createGedFolder, decideGedReview, generateGedTemplate, listManagedFolders, moveGedFolder, processGedVersion, readGedDetail, recognizeGedZone, saveGedSmartFolder, saveGedTemplate, saveGedTerm, startGedReview, requestGedSignatures, resumeGedUpload } from "@/lib/documents/ged-service";
import { AccessError } from "@/lib/platform/access-error";
import { deleteManagedFolder, moveManagedDocument } from "@/lib/documents/ged-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
function failure(error: unknown) {
  if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) return Response.json({ error: "Revise os campos informados.", fields: error.issues.map(i => i.path.join(".")) }, { status: 400 });
  const message = error instanceof Error && !/query|constraint|postgres|duplicate|insert into|select |password|token|https?:\/\//i.test(error.message) ? error.message : "Não foi possível concluir a operação documental.";
  return Response.json({ error: message }, { status: 400 });
}
export async function GET(request: Request) {
  try {
    const context = await getGedContext();
    const params = new URL(request.url).searchParams;
    const detailId = params.get("documentId");
    if (detailId) return Response.json(await readGedDetail(context, detailId, z.coerce.number().int().positive().max(100000).parse(params.get("versionPage") || 1)), { headers: { "Cache-Control": "private, no-store" } });
    if (params.get("folders") === "1") return Response.json(await listManagedFolders(context, params.get("parentId")), { headers: { "Cache-Control": "private, no-store" } });
    const templateId = params.get("templateId");
    if (templateId) {
      const [template] = await (context.database ?? db).select().from(gedTemplates).where(eq(gedTemplates.id, templateId));
      if (!template || (template.ownerId !== context.user.id && (!template.departmentId || template.departmentId !== context.user.departmentId))) throw new Error("Modelo fora do seu escopo.");
      return Response.json({ id: template.id, templateKey: template.templateKey, name: template.name, content: template.content, markers: template.markers, version: template.version });
    }
    const section = z.enum(["acervo", "pesquisa", "pastas-inteligentes", "importacoes", "processamento", "tarefas", "fluxos", "modelos", "thesaurus", "classes"]).parse(params.get("section") || "acervo");
    let query: GedQuery = gedQuerySchema.parse({ text: params.get("text") || "", mode: params.get("mode") || "words", distance: params.get("distance") || 5, thesaurus: params.get("thesaurus") === "true", status: params.get("status") || "", folderId: params.get("folderId") || "" });
    if (params.get("smartId")) {
      const [folder] = await (context.database ?? db).select().from(gedSmartFolders).where(eq(gedSmartFolders.id, params.get("smartId")!));
      if (!folder || (!folder.shared && folder.ownerId !== context.user.id)) throw new Error("Pasta inteligente não encontrada.");
      query = gedQuerySchema.parse(folder.query);
    }
    const page = z.coerce.number().int().positive().max(100000).parse(params.get("page") || 1);
    return Response.json(await listGedSection(context, section, query, page), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
const commandSchema = z.object({ command: z.string().min(1), id: z.string().max(100).optional(), data: z.record(z.string(), z.unknown()).default({}) });
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new AccessError("Origem não permitida.", 403);
    const context = await getGedContext();
    const body = await request.text();
    if (body.length > 150_000) throw new Error("Dados excedem o limite da operação.");
    const { command, id = "", data } = commandSchema.parse(JSON.parse(body));
    const text = (key: string) => z.string().max(100_000).parse(data[key] ?? "");
    const requireCapability = (capability: GedCapability) => { if (!canUseGed(context.user, capability)) throw new AccessError("Operação documental não autorizada.", 403); };
    let result: unknown = null;
    switch (command) {
      case "confirm-upload": result = await confirmGedUpload(context, id, z.url().parse(data.url), text("comment")); break;
      case "resume-upload": result = await resumeGedUpload(context, id); break;
      case "archive-central": { const { archiveCentralInGed } = await import("@/lib/documents/ged-central-archive"); result = await archiveCentralInGed(context, id, text("classCode")); break; }
      case "checkout": await checkoutGed(context, id); break;
      case "cancel-checkout": await checkoutGed(context, id, true); break;
      case "create-folder": result = await createGedFolder(context, text("name"), text("parentId") || null); break;
      case "move-folder": await moveGedFolder(context, id, text("parentId") || null, text("name")); break;
      case "delete-folder": await deleteManagedFolder(context, id); break;
      case "move-document": await moveManagedDocument(context, id, text("folderId") || null); break;
      case "process": {
        const [job] = await (context.database ?? db).select().from(gedJobs).where(eq(gedJobs.id, id));
        if (!job) throw new Error("Processamento não encontrado.");
        await processGedVersion(context, job.versionId); break;
      }
      case "index-document": { const document = await requireManagedDocument(context, id); await processGedVersion(context, document.versionId); break; }
      case "ocr-zone": result = await recognizeGedZone(context, id, data as GedZone); break;
      case "save-smart": result = await saveGedSmartFolder(context, text("name"), data.query, data.shared === true); break;
      case "save-term": await saveGedTerm(context, text("term"), z.array(z.string()).parse(data.equivalents)); break;
      case "start-review": result = await startGedReview(context, id, data.assignments, text("dueAt")); break;
      case "decide-review": await decideGedReview(context, id, z.enum(["APPROVE", "RETURN"]).parse(data.decision), text("comment")); break;
      case "save-template": result = await saveGedTemplate(context, text("name"), text("content"), undefined, text("templateKey") || undefined); break;
      case "generate-template": result = await generateGedTemplate(context, id, z.record(z.string(), z.string().max(5000)).parse(data.values), text("classCode")); break;
      case "sign-request": {
        requireCapability("edit");
        result = await requestGedSignatures(context, id, z.array(z.string().min(1)).min(1).max(20).parse(data.signerIds));
        break;
      }
      case "review-document": {
        const { gedReviews } = await import("@/db/schema/ged-management");
        const [review] = await (context.database ?? db).select().from(gedReviews).where(eq(gedReviews.id, id));
        if (!review) throw new Error("Fluxo não encontrado.");
        await requireManagedDocument(context, review.documentId);
        result = { documentId: review.documentId }; break;
      }
      case "delete-smart": await (context.database ?? db).delete(gedSmartFolders).where(and(eq(gedSmartFolders.id, id), eq(gedSmartFolders.ownerId, context.user.id))); break;
      default: throw new Error("Operação documental desconhecida.");
    }
    return Response.json({ error: null, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
