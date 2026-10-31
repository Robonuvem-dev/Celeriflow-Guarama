import { NextRequest, NextResponse } from "next/server";
import { AccessError, getCurrentTenantContext, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { downloadFilename, getFile } from "@/lib/platform/blob";
import { getAttendanceContext, getOmbudsmanReadContext } from "@/lib/attendance/access";
import { getProtocolContext } from "@/lib/protocols/access";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { db } from "@/db/client";
import { canDownloadConstructionCase, canDownloadLinkedOmbudsman, canDownloadLinkedProcess, canDownloadLinkedTicket, findDownloadConstructionArtifact, findDownloadConstructionVersion, findDownloadDocument, findDownloadEnvironmentDocument, findDownloadOccupationalOwner, listDownloadConstructionCaseIds, listDownloadPlanningOwners } from "@/db/repositories/platform/downloads";
import { assertSstClinicalAccess } from "@/lib/sst/access";
import { asoDocumentOwners } from "@/lib/sst/aso-flow-access";
import { assertConstructionGedSignature } from "@/lib/obras/construction-documents-service";
import { readConstructionPdf } from "@/lib/obras/construction-document-storage";
import { assertConstructionProjectStampDownload, findConstructionProjectStampByFile } from "@/lib/obras/construction-project-stamp";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { getPlanningContext } from "@/lib/planejamento/access";
import { readPlanningDocument } from "@/lib/planejamento/documents";
import { planningDocumentResponse } from "@/lib/planejamento/document-response";
import { eq } from "drizzle-orm";
import { gedEntries } from "@/db/schema/ged-management";
import { documentVersions } from "@/db/schema/document-workflow";
import { getGedContext } from "@/lib/documents/ged-access";
import { requireManagedDocument } from "@/db/repositories/documents/ged";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Faltando o parâmetro url" }, { status: 400 });
  }

  try {
    const context = await getCurrentTenantContext();
    const database = context.database ?? db;
    // The compatibility URL must enforce the same scope as GED/ZIP, including
    // immutable earlier versions that no longer match Document.fileUrl.
    const [managed] = await database.select({ id: gedEntries.documentId, versionId: documentVersions.id }).from(gedEntries)
      .innerJoin(documentVersions, eq(documentVersions.documentId, gedEntries.documentId)).where(eq(documentVersions.fileUrl, url)).limit(1);
    if (managed) {
      const ged = await getGedContext();
      await requireManagedDocument(ged, managed.id);
      const target = new URL("/api/assinatura-digital/ged/download", request.url);
      target.searchParams.set("items", JSON.stringify([{ id: managed.id, versionId: managed.versionId }]));
      target.searchParams.set("inline", "1");
      return NextResponse.redirect(target);
    }
    const constructionProjectStamp = await findConstructionProjectStampByFile(database, url);
    if (constructionProjectStamp && !constructionProjectStamp.publishedAt) throw new AccessError("Cópia derivada urbanística ainda não publicada.", 403);
    const constructionArtifact = await findDownloadConstructionArtifact(database, url);
    if (constructionArtifact) {
      if (constructionArtifact.status !== "PUBLISHED") throw new AccessError("Documento urbanístico não publicado ou substituído.", 403);
      await assertConstructionGedSignature(database, constructionArtifact.documentVersionId);
    }
    // Check occupational ownership independently of generic copies of the same file URL.
    const asoOwners = await asoDocumentOwners(database, url);
    if (asoOwners.length) {
      const sst = await getTenantContextForModule("SST");
      for (const owner of asoOwners) await assertSstClinicalAccess(sst, owner.budgetUnitId);
    }
    const occupational = await findDownloadOccupationalOwner(database, url);
    if (occupational) {
      const sst = await getTenantContextForModule("SST");
      await assertSstClinicalAccess(sst, occupational.budgetUnitId);
    }
    const owners = await listDownloadPlanningOwners(database, url);
    if (owners.length) {
      let first: { id: string; jurisdiction: "EXECUTIVE" | "LEGISLATIVE" } | undefined;
      const hashes = new Set<string>();
      for (const owner of owners) { const jurisdiction = owner.jurisdiction; if (!jurisdiction) throw new AccessError("Documento de entidade sem escopo ativo.", 403); const planning = await getPlanningContext(jurisdiction); const link = await readPlanningDocument(planning, owner.id); hashes.add(link.version.hashSha256); first ??= { id: owner.id, jurisdiction }; }
      if (hashes.size > 1) throw new AccessError("Versões vinculadas divergem quanto à integridade do arquivo.", 423);
      if (first) return planningDocumentResponse(first.jurisdiction, first.id);
    }
    let auditTarget: { type: string; id: string } | null = null;
    const document = await findDownloadDocument(database, url);
    const civilCaseIds = constructionArtifact ? [constructionArtifact.caseId] : constructionProjectStamp ? [constructionProjectStamp.caseId] : document?.processDocuments.length ? await listDownloadConstructionCaseIds(database, document.processDocuments.map(link => link.processId)) : [];
    if (civilCaseIds.length) {
      const civilContext = await getTenantContextForModule("OBRAS");
      const civilAccess = await resolveConstructionAccess(civilContext);
      if (!await canDownloadConstructionCase(civilContext.database ?? db, civilCaseIds, civilAccess)) throw new AccessError("Sem habilitação urbanística no setor responsável pelo documento.", 403);
    }

    if (asoOwners.length && document) {
      auditTarget = { type: "SST_ASO_DOCUMENT", id: document.id };
    } else if (document?.sstCertificateDocument) {
      const sst = await getTenantContextForModule("SST");
      await assertSstClinicalAccess(sst, document.sstCertificateDocument.certificate.budgetUnitId);
    } else if (document && (document.ticketLinks.length || document.ombudsmanLinks.length)) {
      let hasLinkedAccess = false;
      if (document.ombudsmanLinks.length) {
        const ombudsmanContext = await getOmbudsmanReadContext();
        hasLinkedAccess = await canDownloadLinkedOmbudsman(ombudsmanContext.database ?? db, document.ombudsmanLinks.map(link => link.ombudsmanId), ombudsmanContext);
      }
      if (!hasLinkedAccess && document.ticketLinks.length) {
        const attendance = await getAttendanceContext();
        hasLinkedAccess = await canDownloadLinkedTicket(attendance.database ?? db, document.ticketLinks.map(link => link.ticketId), attendance);
      }
      if (!hasLinkedAccess) throw new AccessError("Sem acesso ao documento vinculado.", 403);
    } else if (document?.processDocuments.length) {
      const protocol = await getProtocolContext();
      const process = await canDownloadLinkedProcess(protocol.database ?? db, document.processDocuments.map(link => link.processId), protocol);
      if (!process) throw new AccessError("Sem acesso ao documento vinculado.", 403);
    } else if (document?.healthStandardDocument) {
      await getTenantContextForModule("SAUDE");
      auditTarget = { type: "HEALTH_STANDARD_DOCUMENT", id: document.healthStandardDocument.id };
    } else if (document) {
      await getTenantContextForModule("DOCUMENTOS");
      auditTarget = { type: "DOCUMENT", id: document.id };
    } else {
      const envDocument = await findDownloadEnvironmentDocument(database, url);
      if (!envDocument) return NextResponse.json({ error: "Documento nao encontrado" }, { status: 404 });
      await getTenantContextForModule("MEIO_AMBIENTE");
      auditTarget = { type: "ENV_DOCUMENT", id: envDocument.id };
    }
    if (document) auditTarget = { type: "DOCUMENT", id: document.id };
    if (!auditTarget) throw new AccessError("Documento nao encontrado", 404);
    if (constructionProjectStamp) {
      const bytes = await assertConstructionProjectStampDownload(database, constructionProjectStamp);
      await writeAuditEvent(database, { actorUsuarioId: context.user.id, eventType: auditEventTypes.documentDownload, targetType: auditTarget.type, targetId: auditTarget.id });
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=projeto-aprovado-copia-derivada.pdf", "Cache-Control": "private, no-store" } });
    }
    if (constructionArtifact) {
      const bytes = await readConstructionPdf(url, constructionArtifact.hashSha256);
      await writeAuditEvent(database, { actorUsuarioId: context.user.id, eventType: auditEventTypes.documentDownload, targetType: auditTarget.type, targetId: auditTarget.id });
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${constructionArtifact.number.replaceAll("/", "-")}.pdf"`, "Cache-Control": "private, no-store" } });
    }
    if (document && url.startsWith("construction-local:")) {
      const version = await findDownloadConstructionVersion(database, document.id, url);
      if (!version) throw new AccessError("Versão complementar indisponível.", 404);
      const bytes = await readConstructionPdf(url, version.hashSha256);
      await writeAuditEvent(database, { actorUsuarioId: context.user.id, eventType: auditEventTypes.documentDownload, targetType: auditTarget.type, targetId: auditTarget.id });
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=complemento-revisado.pdf", "Cache-Control": "private, no-store" } });
    }
    const response = await getFile(url);

    if (!response || !response.stream) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
    }

    const contentType = response.blob?.contentType || "application/pdf";
    const filename = downloadFilename(response.blob.pathname);
    await writeAuditEvent(database, {
      actorUsuarioId: context.user.id,
      eventType: auditEventTypes.documentDownload,
      targetType: auditTarget.type,
      targetId: auditTarget.id,
    });

    return new NextResponse(response.stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Erro no download:", error);
    return NextResponse.json({ error: "Erro interno no servidor ao baixar o documento" }, { status: 500 });
  }
}
