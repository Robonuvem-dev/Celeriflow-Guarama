import { NextRequest, NextResponse } from "next/server";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listMyRecertificationCampaigns } from "@/lib/rh/recertification";
import { deleteUploadedDocument, uploadFile } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { portalRequired } from "@/db/repositories/portal-servidor/records";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  let blob: Awaited<ReturnType<typeof uploadFile>> | undefined;
  let recorded = false;
  try {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== request.headers.get("host")) return NextResponse.json({ error: "Origem da solicitação inválida." }, { status: 403 });
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") return NextResponse.json({ error: "Acesso funcional indisponível." }, { status: 403 });
    if (!checkRateLimit(`recertification-upload:${access.context.user.id}`).allowed) return NextResponse.json({ error: "Aguarde antes de enviar outro documento." }, { status: 429 });
    const data = await request.formData(), id = String(data.get("campaignRuleId") || "");
    const executor = access.context.database ?? db;
    const campaign = (await listMyRecertificationCampaigns(executor, access.employee.id)).find(row => row.id === id), now = new Date();
    if (!campaign?.evidenceDocumentClassCode || now < new Date(campaign.startsAt) || now > new Date(campaign.endsAt) || campaign.request && !["PENDENTE_CORRECAO"].includes(campaign.request.status)) return NextResponse.json({ error: "Campanha indisponível para comprovação." }, { status: 403 });
    const employee = await portalRequired<{ personId: string | null }>(executor, sql`SELECT "personId" FROM "Employee" WHERE id=${access.employee.id}`);
    if (!employee.personId) return NextResponse.json({ error: "Vinculação ao Cadastro Único pendente." }, { status: 403 });
    const file = data.get("file");
    if (!(file instanceof File) || !["application/pdf", "image/png", "image/jpeg"].includes(file.type)) return NextResponse.json({ error: "Envie PDF, JPG ou PNG." }, { status: 400 });
    blob = await uploadFile(file);
    let documentVersionId = "";
    await ingestGedDocument(databaseConnection, { title: file.name, documentType: "Comprovação de recadastramento", documentClassCode: campaign.evidenceDocumentClassCode, fileUrl: blob.url, content: new Uint8Array(await file.arrayBuffer()), actorUsuarioId: access.context.user.id, afterCreate: async (tx, documentId) => {
      await tx.execute(sql`UPDATE "Document" SET "personId"=${employee.personId},"updatedAt"=${new Date()} WHERE id=${documentId}`);
      const version = await portalRequired<{ id: string }>(tx, sql`SELECT id FROM "DocumentVersion" WHERE "documentId"=${documentId} AND "versionNumber"=1 LIMIT 1`);
      documentVersionId = version.id;
    } });
    recorded = true;
    return NextResponse.json({ documentVersionId, title: file.name }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    if (blob && !recorded) await deleteUploadedDocument(blob).catch(() => undefined);
    return NextResponse.json({ error: "Não foi possível receber a comprovação. Confira tamanho, formato e classe documental configurada pelo RH." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
}
