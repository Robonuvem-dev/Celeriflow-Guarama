import { NextRequest, NextResponse } from "next/server";
import { AccessError, getCurrentTenantContext, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { downloadFilename, getFile } from "@/lib/platform/blob";
import { getAttendanceContext, getOmbudsmanReadContext, ombudsmanScope, ticketScope } from "@/lib/attendance/access";
import { getProtocolContext, protocolScope } from "@/lib/protocols/access";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { assertSstClinicalAccess } from "@/lib/sst/access";
import { asoDocumentOwners } from "@/lib/sst/aso-flow-access";
import { assertConstructionGedSignature } from "@/lib/obras/construction-documents-service";
import { readConstructionPdf } from "@/lib/obras/construction-document-storage";
import { assertConstructionProjectStampDownload, findConstructionProjectStampByFile } from "@/lib/obras/construction-project-stamp";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import { getPlanningContext } from "@/lib/planejamento/access";
import { readPlanningDocument } from "@/lib/planejamento/documents";
import { planningDocumentResponse } from "@/lib/planejamento/document-response";

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
    const constructionProjectStamp = await findConstructionProjectStampByFile(context.prisma, url);
    if (constructionProjectStamp && !constructionProjectStamp.publishedAt) throw new AccessError("Cópia derivada urbanística ainda não publicada.", 403);
    const constructionArtifact = await context.prisma.constructionIssuedDocument.findFirst({ where: { fileUrl: url } });
    if (constructionArtifact) {
      if (constructionArtifact.status !== "PUBLISHED") throw new AccessError("Documento urbanístico não publicado ou substituído.", 403);
      await assertConstructionGedSignature(context.prisma, constructionArtifact.documentVersionId);
    }
    // Check occupational ownership independently of generic copies of the same file URL.
    const asoOwners = await asoDocumentOwners(context.prisma, url);
    if (asoOwners.length) {
      const sst = await getTenantContextForModule("SST");
      for (const owner of asoOwners) await assertSstClinicalAccess(sst, owner.budgetUnitId);
    }
    const occupational = await context.prisma.sstCertificateDocument.findFirst({
      where: { document: { fileUrl: url } },
      select: { certificate: { select: { budgetUnitId: true } } },
    });
    if (occupational) {
      const sst = await getTenantContextForModule("SST");
      await assertSstClinicalAccess(sst, occupational.certificate.budgetUnitId);
    }
    const [planningRuntime] = await context.prisma.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('"PlanningDocumentLink"') IS NOT NULL AS ready`;
    if (planningRuntime?.ready) {
      const owners = await context.prisma.planningDocumentLink.findMany({ where: { documentVersion: { fileUrl: url } }, select: { id: true, instrument: { select: { governmentEntity: { select: { planningScope: { select: { jurisdiction: true } } } } } } } });
      let first: { id: string; jurisdiction: "EXECUTIVE" | "LEGISLATIVE" } | undefined;
      const hashes = new Set<string>();
      for (const owner of owners) { const jurisdiction = owner.instrument.governmentEntity.planningScope?.jurisdiction; if (!jurisdiction) throw new AccessError("Documento de entidade sem escopo ativo.", 403); const planning = await getPlanningContext(jurisdiction); const link = await readPlanningDocument(planning, owner.id); hashes.add(link.version.hashSha256); first ??= { id: owner.id, jurisdiction }; }
      if (hashes.size > 1) throw new AccessError("Versões vinculadas divergem quanto à integridade do arquivo.", 423);
      if (first) return planningDocumentResponse(first.jurisdiction, first.id);
    }
    let auditTarget: { type: string; id: string } | null = null;
    const document = await context.prisma.document.findFirst({
      where: { fileUrl: url },
      select: {
        id: true,
        sstCertificateDocument: { select: { certificate: { select: { budgetUnitId: true } } } },
        ticketLinks: { select: { ticketId: true } },
        ombudsmanLinks: { select: { ombudsmanId: true } },
        processDocuments: { select: { processId: true } },
        healthStandardDocument: { select: { id: true } },
      },
    });
    const civilCaseIds = constructionArtifact ? [constructionArtifact.caseId] : constructionProjectStamp ? [constructionProjectStamp.caseId] : document?.processDocuments.length ? (await context.prisma.constructionCase.findMany({ where: { processId: { in: document.processDocuments.map((link) => link.processId) } }, select: { id: true } })).map((item) => item.id) : [];
    if (civilCaseIds.length) {
      const civilContext = await getTenantContextForModule("OBRAS");
      const civilAccess = await resolveConstructionAccess(civilContext);
      if (!await civilContext.prisma.constructionCase.findFirst({ where: { AND: [{ id: { in: civilCaseIds } }, constructionCaseWhere(civilAccess)] }, select: { id: true } })) throw new AccessError("Sem habilitação urbanística no setor responsável pelo documento.", 403);
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
        const ombudsman = await ombudsmanContext.prisma.ombudsman.findFirst({
          where: {
            AND: [
              { id: { in: document.ombudsmanLinks.map((link) => link.ombudsmanId) } },
              ombudsmanScope(ombudsmanContext),
            ],
          },
          select: { id: true },
        });
        hasLinkedAccess = Boolean(ombudsman);
      }
      if (!hasLinkedAccess && document.ticketLinks.length) {
        const attendance = await getAttendanceContext();
        const ticket = await attendance.prisma.ticket.findFirst({
          where: { AND: [{ id: { in: document.ticketLinks.map((link) => link.ticketId) } }, ticketScope(attendance)] },
          select: { id: true },
        });
        hasLinkedAccess = Boolean(ticket);
      }
      if (!hasLinkedAccess) throw new AccessError("Sem acesso ao documento vinculado.", 403);
    } else if (document?.processDocuments.length) {
      const protocol = await getProtocolContext();
      const process = await protocol.prisma.process.findFirst({
        where: {
          AND: [
            { id: { in: document.processDocuments.map((link) => link.processId) } },
            protocolScope(protocol),
          ],
        },
        select: { id: true },
      });
      if (!process) throw new AccessError("Sem acesso ao documento vinculado.", 403);
    } else if (document?.healthStandardDocument) {
      await getTenantContextForModule("SAUDE");
      auditTarget = { type: "HEALTH_STANDARD_DOCUMENT", id: document.healthStandardDocument.id };
    } else if (document) {
      await getTenantContextForModule("DOCUMENTOS");
      auditTarget = { type: "DOCUMENT", id: document.id };
    } else {
      const envDocument = await context.prisma.envDocument.findFirst({
        where: { fileUrl: url },
        select: { id: true },
      });
      if (!envDocument) return NextResponse.json({ error: "Documento nao encontrado" }, { status: 404 });
      await getTenantContextForModule("MEIO_AMBIENTE");
      auditTarget = { type: "ENV_DOCUMENT", id: envDocument.id };
    }
    if (document) auditTarget = { type: "DOCUMENT", id: document.id };
    if (!auditTarget) throw new AccessError("Documento nao encontrado", 404);
    if (constructionProjectStamp) {
      const bytes = await assertConstructionProjectStampDownload(context.prisma, constructionProjectStamp);
      await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.documentDownload, targetType: auditTarget.type, targetId: auditTarget.id });
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=projeto-aprovado-copia-derivada.pdf", "Cache-Control": "private, no-store" } });
    }
    if (constructionArtifact) {
      const bytes = await readConstructionPdf(url, constructionArtifact.hashSha256);
      await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.documentDownload, targetType: auditTarget.type, targetId: auditTarget.id });
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${constructionArtifact.number.replaceAll("/", "-")}.pdf"`, "Cache-Control": "private, no-store" } });
    }
    if (document && url.startsWith("construction-local:")) {
      const version = await context.prisma.documentVersion.findFirst({ where: { documentId: document.id, fileUrl: url, status: { in: ["FINAL", "SIGNED"] } }, orderBy: { versionNumber: "desc" }, select: { hashSha256: true } });
      if (!version) throw new AccessError("Versão complementar indisponível.", 404);
      const bytes = await readConstructionPdf(url, version.hashSha256);
      await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.documentDownload, targetType: auditTarget.type, targetId: auditTarget.id });
      return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=complemento-revisado.pdf", "Cache-Control": "private, no-store" } });
    }
    const response = await getFile(url);

    if (!response || !response.stream) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
    }

    const contentType = response.blob?.contentType || "application/pdf";
    const filename = downloadFilename(response.blob.pathname);
    await writeAuditEvent(context.prisma, {
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
