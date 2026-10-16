import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { AccessError, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { uploadFile, uploadProcessFile } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { assertSstClinicalAccess } from "./access";
import { asoSnapshot, asoKinds, asoResults, formatSstCivilDate } from "./aso-policy";
import { SstValidationError } from "./errors";

export async function archiveAsoDocument(context: AppContext, asoId: string, origin?: { file: File; examId: string; submissionKey: string }) {
  if (!canPerformModuleOperation(context.user, "SST", origin ? "update" : "issueReports")) throw new AccessError("Permissão para documento ASO necessária.", 403);
  const scope = await context.prisma.sstAso.findUnique({ where: { id: asoId }, select: { budgetUnitId: true } });
  if (!scope) throw new SstValidationError("ASO não encontrado.");
  await assertSstClinicalAccess(context, scope.budgetUnitId, !!origin);
  const aso = await context.prisma.sstAso.findUniqueOrThrow({ where: { id: asoId }, include: { exams: { orderBy: { id: "asc" } } } });
  if (origin && !aso.exams.some((e) => e.id === origin.examId)) throw new SstValidationError("O exame não pertence ao ASO.");
  const documentLinkId = origin ? z.uuid().parse(origin.submissionKey) : randomUUID();
  const requestHash = origin ? createHash("sha256").update(`${asoId}:${origin.examId}:`).update(new Uint8Array(await origin.file.arrayBuffer())).digest("hex") : aso.requestHash;
  const retry = async () => {
    const [previous] = await context.prisma.$queryRaw<{ documentId: string; requestHash: string; createdById: string; asoId: string }[]>`SELECT "documentId","requestHash","createdById","asoId" FROM "SstAsoDocument" WHERE id=${documentLinkId}`;
    if (previous && (previous.requestHash !== requestHash || previous.createdById !== context.user.id || previous.asoId !== asoId)) throw new SstValidationError("Submissão de laudo reutilizada com outros dados.");
    return previous?.documentId;
  };
  if (origin) { const previous = await retry(); if (previous) return previous; }
  if (!origin) {
    const [existing] = await context.prisma.$queryRaw<{ documentId: string }[]>`SELECT "documentId" FROM "SstAsoDocument" WHERE "asoId"=${asoId} AND kind='GENERATED'`;
    if (existing) return existing.documentId;
  }
  let file: File;
  if (origin) file = origin.file;
  else {
    const snapshot = asoSnapshot.parse(aso.snapshot);
    const bytes = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 45, info: { Title: "Atestado de Saúde Ocupacional" } });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
      doc.fontSize(16).text("ATESTADO DE SAÚDE OCUPACIONAL — ASO", { align: "center" });
      doc.fontSize(10).moveDown().text(`UG: ${snapshot.unitName}\nOrigem imutável: ${aso.id}\nNome: ${snapshot.personName}\nCPF: ${snapshot.cpf}\nMatrícula: ${snapshot.registration || "Candidato sem vínculo"}\nReferência: ${aso.candidateReference || "—"}\nCargo: ${snapshot.role || "—"}\nLocal: ${snapshot.department || "—"}\nTipo: ${asoKinds[aso.kind as keyof typeof asoKinds]}\nRealização: ${formatSstCivilDate(aso.performedAt)} / Validade: ${formatSstCivilDate(aso.validUntil)}\nPCMSO: ${snapshot.programCode} v${snapshot.programVersion} / GHE: ${snapshot.group.code}`);
      const source = aso.snapshot as Record<string, unknown>;
      if (snapshot.functional) doc.text(`Contrato: ${snapshot.functional.contractReference} / Entidade: ${snapshot.functional.governmentEntityId} / Vínculo RH: ${snapshot.functional.id}`);
      doc.moveDown().text(`Riscos do PCMSO (snapshot): ${JSON.stringify(source.risks || [])}`);
      doc.moveDown().text("Exames realizados/apresentados:");
      for (const e of aso.exams) doc.text(`${e.name} / ${e.source} / ${formatSstCivilDate(e.performedAt)} / validade ${formatSstCivilDate(e.validUntil)} / ${e.professionalCouncil}`);
      doc.moveDown().text(`Conclusão: ${asoResults[aso.result as keyof typeof asoResults]}\n${aso.recommendations}\nMédico: ${snapshot.examinerName} / ${aso.examinerCouncil}`);
      doc.moveDown(3).text("________________________________________________\nAssinatura do médico examinador");
      doc.moveDown().fontSize(8).text("Original emitido preservado. Consultar histórico de retificação/anulação na ficha. PDF sem assinatura digital; não comprova aceite eSocial.");
      doc.end();
    });
    file = new File([new Uint8Array(bytes)], `aso-${aso.id}.pdf`, { type: "application/pdf" });
  }
  const blob = origin ? await uploadProcessFile(file) : await uploadFile(file);
  try {
    const result = await ingestGedDocument(context.prisma, {
      title: origin ? "Laudo de origem ASO restrito" : "ASO original gerado restrito", documentType: origin ? "SST_ASO_ORIGEM" : "SST_ASO", documentClassCode: "SST_OCUPACIONAL",
      fileUrl: blob.url, content: new Uint8Array(await file.arrayBuffer()), actorUsuarioId: context.user.id,
      afterCreate: async (tx, documentId) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_ASO_DOCUMENT:${asoId}`}))`;
        await tx.$executeRaw`INSERT INTO "SstAsoDocument" (id,"asoId","examId","documentId",kind,"requestHash","createdById") VALUES (${documentLinkId},${asoId},${origin?.examId || null},${documentId},${origin ? "ORIGIN" : "GENERATED"},${requestHash},${context.user.id})`;
      },
    });
    return result.documentId;
  } catch (error) {
    // Competing generation rolls back GED rows; return the winner only.
    if (!origin) {
      const [winner] = await context.prisma.$queryRaw<{ documentId: string }[]>`SELECT "documentId" FROM "SstAsoDocument" WHERE "asoId"=${asoId} AND kind='GENERATED'`;
      if (winner) return winner.documentId;
    } else { const winner = await retry(); if (winner) return winner; }
    throw error;
  }
}
