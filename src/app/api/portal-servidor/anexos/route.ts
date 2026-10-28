import { NextRequest, NextResponse } from "next/server";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listFunctionalServices } from "@/lib/portal-servidor/service-catalog";
import { deleteUploadedDocument, uploadFile } from "@/lib/platform/blob";
import { readOwnFunctionalRequest } from "@/lib/portal-servidor/functional-requests";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { enqueueHrIntegration } from "@/lib/rh/workforce-service";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { changePortalEvent, portalRequired } from "@/db/repositories/portal-servidor/records";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  let blob: Awaited<ReturnType<typeof uploadFile>> | undefined;
  let recorded = false;
  try {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== request.headers.get("host")) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") return NextResponse.json({ error: "Acesso funcional indisponível." }, { status: 403 });
    const rate = checkRateLimit(`functional-upload:${access.context.user.id}`);
    if (!rate.allowed) return NextResponse.json({ error: "Aguarde antes de enviar outro documento." }, { status: 429 });
    const data = await request.formData();
    const serviceId = String(data.get("serviceId") || ""), code = String(data.get("code") || "");
    const requestId = String(data.get("requestId") || "");
    const executor = access.context.database ?? db;
    const own = requestId ? await readOwnFunctionalRequest(executor, access.employee.id, requestId) : null;
    if (own && (!own.payload.awaitingComplement || own.request.status !== "EM_ANALISE" || ["Arquivado", "Cancelado", "Concluído"].includes(own.process.status))) return NextResponse.json({ error: "Requerimento sem pendência documental aberta." }, { status: 403 });
    const service = own ? { id: own.payload.serviceId, configuration: own.payload.configuration } : (await listFunctionalServices(executor, access.employee.id)).find(item => item.id === serviceId);
    const requirement = service?.configuration.requiredDocuments.find(item => item.code === code);
    if (!service || !requirement) return NextResponse.json({ error: "Documento não exigido pelo serviço disponível." }, { status: 400 });
    const file = data.get("file");
    const allowed = ["application/pdf", "image/png", "image/jpeg", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.oasis.opendocument.text"];
    if (!(file instanceof File) || !allowed.includes(file.type)) return NextResponse.json({ error: "Envie PDF, DOC, DOCX, XLS, XLSX, ODT, JPG ou PNG." }, { status: 400 });
    blob = await uploadFile(file);
    let uploadEventId = "";
    await ingestGedDocument(databaseConnection, {
      title: requirement.label, documentType: "Anexo funcional", documentClassCode: requirement.documentClassCode,
      fileUrl: blob.url, content: new Uint8Array(await file.arrayBuffer()), publicLabel: "Documento funcional",
      actorUsuarioId: access.context.user.id,
      afterCreate: async (tx, documentId) => {
        const employee = await portalRequired<{ personId: string | null }>(tx, sql`SELECT "personId" FROM "Employee" WHERE id=${access.employee.id}`);
        await tx.execute(sql`UPDATE "Document" SET "personId"=${employee.personId},"updatedAt"=${new Date()} WHERE id=${documentId}`);
        const event = await enqueueHrIntegration(tx, { sourceKey: `PORTAL:ANEXO:${documentId}`, domain: "PORTAL", environment: "INTERNO", eventType: "ANEXO_FUNCIONAL_RECEBIDO", payload: { employeeId: access.employee.id, actorId: access.context.user.id, serviceId: service.id, serviceVersion: service.configuration.version, code, documentId, requestId: null, targetRequestId: requestId || null, fileUrl: blob!.url, pathname: blob!.pathname } });
        await changePortalEvent(tx, event.id, { status: "RECEBIDO" });
        uploadEventId = event.id;
      },
    });
    recorded = true;
    return NextResponse.json({ uploadEventId, filename: file.name }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    if (blob && !recorded) await deleteUploadedDocument(blob).catch(() => undefined);
    return NextResponse.json({ error: "Não foi possível receber o documento. Confira o formato, tamanho e classe documental do serviço." }, { status: 400 });
  }
}
