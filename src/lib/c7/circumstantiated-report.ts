import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { C7OperationError } from "./operations-service";
import { renderControlReport } from "./control-report";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { getTransparencySettings } from "@/lib/transparencia/presentation-settings";
import { isPublicationPublic, isTransparencyCollectionEnabled } from "@/lib/transparencia/publication-policy";
import { resolveReferencedA1Config, signDocumentHashICPBrasil, verifyDocumentHashICPBrasil } from "@/lib/security/icp-brasil";

type Actor = { usuarioId: string; allowedBudgetUnitIds?: string[] };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const controlFinalReportSchema = z.object({
  title: z.string().trim().min(5).max(250), category: z.enum(["CIRCUMSTANCIADO", "ANUAL", "AUDITORIA"]),
  year: z.number().int().min(1900).max(2200), from: z.iso.date(), through: z.iso.date(),
  objective: z.string().trim().min(10).max(10000), methodology: z.string().trim().min(10).max(10000),
  conclusion: z.string().trim().min(10).max(20000),
  boards: z.array(z.object({ number: z.number().int().positive(), title: z.string().trim().min(3).max(250), criterion: z.string().trim().min(3).max(4000), evidence: z.string().trim().min(3).max(10000), assessment: z.string().trim().min(3).max(10000), recommendation: z.string().trim().max(10000) }).strict()).min(1).max(100),
  attachmentKeys: z.array(z.string().min(1)).max(50),
  requiresDigitalSignature: z.boolean().default(true),
}).strict().superRefine((value, context) => {
  if (value.from > value.through || !value.from.startsWith(`${value.year}-`) || !value.through.startsWith(`${value.year}-`)) context.addIssue({ code: "custom", message: "Período deve ser válido e pertencer ao ano do relatório." });
  if (new Set(value.boards.map(board => board.number)).size !== value.boards.length || new Set(value.attachmentKeys).size !== value.attachmentKeys.length) context.addIssue({ code: "custom", message: "Quadros e anexos não podem ser repetidos." });
});
export type ControlFinalReportInput = z.infer<typeof controlFinalReportSchema>;
const editionSchema = z.object({ reportId: z.string(), revision: z.number().int().positive(), input: controlFinalReportSchema, inputHash: z.string(), governmentEntityId: z.string() });
const signatureSchema = z.object({ evidence: z.object({ documentVersionId: z.string(), documentHash: z.string(), canonicalPayload: z.string(), signatureBase64: z.string(), algorithm: z.literal("SHA256"), signedAt: z.iso.datetime(), certificateSubject: z.string(), certificateIssuer: z.string(), certificateSerialNumber: z.string(), certificateFingerprint256: z.string(), certificatePem: z.string() }), intermediateCertificatePems: z.array(z.string()), trustedRootCertificatePem: z.string(), certificateId: z.string() });

async function verifiedReportSignature(db: Pick<PrismaClient, "internalControlEvent">, finalId: string, sha256: string) {
  const event = await db.internalControlEvent.findFirst({ where: { eventType: "CONTROL_REPORT_SIGNED", snapshot: { path: ["finalId"], equals: finalId } } });
  if (!event) return null;
  const memory = signatureSchema.safeParse(event.snapshot);
  if (!memory.success || memory.data.evidence.documentVersionId !== finalId || memory.data.evidence.documentHash !== sha256 || !verifyDocumentHashICPBrasil({ ...memory.data.evidence, signedAt: new Date(memory.data.evidence.signedAt) }, memory.data)) throw new C7OperationError("Evidência de assinatura do relatório não pôde ser validada.");
  return { eventId: event.id, ...memory.data };
}

export function readControlFinalReport(snapshot: unknown) { const parsed = editionSchema.safeParse(snapshot); return parsed.success && hash(parsed.data.input) === parsed.data.inputHash ? parsed.data : null; }

async function lockedPlan(tx: Prisma.TransactionClient, actor: Actor, planId: string) {
  await tx.$queryRaw`SELECT id FROM "InternalControlPlan" WHERE id=${planId} FOR UPDATE`;
  const plan = await tx.internalControlPlan.findUniqueOrThrow({ where: { id: planId } });
  if (!plan.budgetUnitId || plan.ownerId !== actor.usuarioId || (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(plan.budgetUnitId))) throw new C7OperationError("Relatório exige o controlador responsável e UG autorizada.");
  const unit = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: plan.budgetUnitId } });
  return { plan, governmentEntityId: unit.governmentEntityId };
}

export async function saveControlFinalReport(db: PrismaClient, actor: Actor, raw: { planId: string; reportId?: string; expectedRevision: number; input: ControlFinalReportInput; idempotencyKey: string }) {
  const input = controlFinalReportSchema.parse(raw.input);
  if (!raw.idempotencyKey.trim() || !Number.isSafeInteger(raw.expectedRevision) || raw.expectedRevision < 0) throw new C7OperationError("Chave e revisão esperada são obrigatórias.");
  return db.$transaction(async tx => {
    const { plan, governmentEntityId } = await lockedPlan(tx, actor, raw.planId);
    const requestHash = hash({ ...raw, input });
    const replay = await tx.internalControlEvent.findFirst({ where: { planId: plan.id, eventType: "CONTROL_REPORT_EDITED", snapshot: { path: ["idempotencyKey"], equals: raw.idempotencyKey } } });
    if (replay) { if ((replay.snapshot as Prisma.JsonObject).requestHash !== requestHash) throw new C7OperationError("Chave de edição reutilizada com outro conteúdo."); return replay; }
    if (plan.status !== "ABERTO") throw new C7OperationError("Edição exige plano aberto.");
    const reportId = raw.reportId ?? raw.idempotencyKey;
    const events = await tx.internalControlEvent.findMany({ where: { planId: plan.id, snapshot: { path: ["reportId"], equals: reportId } } });
    const editions = events.filter(event => event.eventType === "CONTROL_REPORT_EDITED").map(event => readControlFinalReport(event.snapshot)).filter(edition => edition !== null);
    const revision = Math.max(0, ...editions.map(edition => edition.revision));
    if (revision !== raw.expectedRevision || events.some(event => event.eventType === "CONTROL_REPORT_FINALIZED")) throw new C7OperationError("Revisão desatualizada ou relatório já finalizado; preserve a edição final.");
    const event = await tx.internalControlEvent.create({ data: { planId: plan.id, eventType: "CONTROL_REPORT_EDITED", actorId: actor.usuarioId, reason: input.title, snapshot: json({ reportId, revision: revision + 1, input, inputHash: hash(input), governmentEntityId, requestHash, idempotencyKey: raw.idempotencyKey }) } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "CONTROL_REPORT_EDITION", targetId: event.id });
    return event;
  });
}

export function circumstantiatedReportRows(input: ControlFinalReportInput, institution: string, attachments: Array<{ title: string; publicKey: string; sha256: string | null }>) {
  const rows = [["Identificação", institution, input.category, `${input.from} a ${input.through}`], ["Objetivo", "", "", input.objective], ["Metodologia e escopo", "", "", input.methodology]];
  for (const board of [...input.boards].sort((a, b) => a.number - b.number)) rows.push([`Quadro ${board.number}`, board.title, board.criterion, `Evidências: ${board.evidence}\nAnálise: ${board.assessment}\nRecomendação: ${board.recommendation}`]);
  rows.push(["Conclusão", "", "", input.conclusion]);
  for (const attachment of attachments) rows.push(["Anexo público", attachment.title, attachment.sha256 ?? "", `/api/transparencia/publicacoes/${attachment.publicKey}`]);
  return { title: input.title, headers: ["Seção", "Identificação", "Critério / SHA-256", "Conteúdo"], rows, hash: hash({ institution, input, attachments }) };
}

export async function finalizeControlFinalReport(db: PrismaClient, actor: Actor, input: { editionId: string; reason: string }) {
  if (input.reason.trim().length < 10) throw new C7OperationError("Fundamente a finalização do relatório.");
  const source = await db.internalControlEvent.findUniqueOrThrow({ where: { id: input.editionId } });
  const edition = source.eventType === "CONTROL_REPORT_EDITED" ? readControlFinalReport(source.snapshot) : null;
  if (!edition) throw new C7OperationError("Edição de relatório inválida.");
  // Final bytes are stored once, so download never regenerates a different PDF.
  const settings = await getTransparencySettings(db);
  return db.$transaction(async tx => {
    const { plan, governmentEntityId } = await lockedPlan(tx, actor, source.planId);
    if (governmentEntityId !== edition.governmentEntityId) throw new C7OperationError("Escopo da edição diverge do plano.");
    const previous = await tx.internalControlEvent.findFirst({ where: { planId: plan.id, eventType: "CONTROL_REPORT_FINALIZED", snapshot: { path: ["reportId"], equals: edition.reportId } } });
    if (previous) { const memory = previous.snapshot as Prisma.JsonObject; if (memory.editionId !== source.id || previous.reason !== input.reason.trim()) throw new C7OperationError("Relatório finalizado com outra edição ou fundamento."); return previous; }
    if (plan.status !== "ABERTO") throw new C7OperationError("Finalização exige plano aberto.");
    const edits = await tx.internalControlEvent.findMany({ where: { planId: plan.id, eventType: "CONTROL_REPORT_EDITED", snapshot: { path: ["reportId"], equals: edition.reportId } } });
    if (edits.some(event => (readControlFinalReport(event.snapshot)?.revision ?? 0) > edition.revision)) throw new C7OperationError("Finalize a revisão mais recente.");
    const entity = settings.entities.find(item => item.nativeIds.includes(governmentEntityId) && item.enabled);
    if (!entity && edition.input.attachmentKeys.length) throw new C7OperationError("Anexos públicos exigem o vínculo nativo da entidade no Portal da Transparência.");
    const institution = await tx.governmentEntity.findUniqueOrThrow({ where: { id: governmentEntityId }, select: { name: true } });
    const attachments = await tx.transparencyPublication.findMany({ where: { publicKey: { in: edition.input.attachmentKeys }, entity: entity?.key ?? "__UNMAPPED__" }, select: { id: true, publicKey: true, title: true, sha256: true, fileUrl: true, status: true, collectionSlug: true, year: true, entity: true } });
    if (attachments.length !== edition.input.attachmentKeys.length || attachments.some(attachment => !isPublicationPublic(attachment, settings) || !attachment.fileUrl || !attachment.sha256)) throw new C7OperationError("Anexos devem ser arquivos públicos confirmados com hash da mesma entidade.");
    attachments.sort((a, b) => a.publicKey.localeCompare(b.publicKey));
    const output = await renderControlReport(circumstantiatedReportRows(edition.input, institution.name, attachments), "PDF");
    const bytes = Buffer.from(output.bytes), sha256 = createHash("sha256").update(bytes).digest("hex");
    const event = await tx.internalControlEvent.create({ data: { planId: plan.id, eventType: "CONTROL_REPORT_FINALIZED", actorId: actor.usuarioId, reason: input.reason.trim(), snapshot: json({ reportId: edition.reportId, editionId: source.id, revision: edition.revision, input: edition.input, inputHash: edition.inputHash, governmentEntityId, entity: entity?.key ?? null, institution: institution.name, attachments, sha256, pdfBase64: bytes.toString("base64"), finalizedAt: new Date().toISOString(), signatureStatus: "NOT_DIGITALLY_SIGNED" }) } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "CONTROL_REPORT_FINAL", targetId: event.id });
    return event;
  }, { timeout: 60000 });
}

export async function publishControlFinalReport(db: PrismaClient, actor: Actor, finalId: string) {
  const settings = await getTransparencySettings(db);
  return db.$transaction(async tx => {
    const final = await tx.internalControlEvent.findUniqueOrThrow({ where: { id: finalId } });
    if (final.eventType !== "CONTROL_REPORT_FINALIZED") throw new C7OperationError("Somente relatório final pode ser publicado.");
    const { governmentEntityId } = await lockedPlan(tx, actor, final.planId);
    const memory = final.snapshot as Prisma.JsonObject, input = controlFinalReportSchema.parse(memory.input);
    const signature = await verifiedReportSignature(tx, final.id, String(memory.sha256));
    if (input.requiresDigitalSignature && !signature) throw new C7OperationError("A assinatura digital exigida deve ser concluída sobre os bytes finais antes da publicação.");
    const entity = settings.entities.find(item => item.enabled && item.nativeIds.includes(governmentEntityId));
    if (!entity || (typeof memory.entity === "string" && entity.key !== memory.entity) || !settings.availableYears.includes(input.year) || !isTransparencyCollectionEnabled("publicacoes", settings)) throw new C7OperationError("Entidade, consulta e ano devem estar habilitados na Transparência.");
    const bytes = Buffer.from(String(memory.pdfBase64), "base64");
    if (createHash("sha256").update(bytes).digest("hex") !== memory.sha256) throw new C7OperationError("Integridade do documento final divergente.");
    const frozenAttachments = z.array(z.object({ id: z.string(), publicKey: z.string(), sha256: z.string(), fileUrl: z.string() })).parse(memory.attachments);
    for (const attachment of frozenAttachments) {
      const current = await tx.transparencyPublication.findUnique({ where: { id: attachment.id } });
      if (!current || !isPublicationPublic(current, settings) || current.publicKey !== attachment.publicKey || current.sha256 !== attachment.sha256 || current.fileUrl !== attachment.fileUrl) throw new C7OperationError("Um anexo final foi alterado ou retirado da publicação.");
    }
    const existing = await tx.transparencyPublication.findUnique({ where: { id: `control-report:${final.id}` } });
    if (existing) { if (existing.sha256 !== memory.sha256 || existing.status !== "PUBLISHED") throw new C7OperationError("Publicação anterior foi alterada ou retirada; preserve seu histórico."); return existing; }
    const publication = await tx.transparencyPublication.create({ data: { id: `control-report:${final.id}`, publicKey: `control-report-${final.id}`, collectionSlug: "publicacoes", entity: entity.key, year: input.year, title: input.title, group: "Controle Interno", referencePeriod: `${input.from} a ${input.through}`, version: Number(memory.revision), status: "PUBLISHED", publishedAt: new Date(), source: "DOCUMENTOS", documentKind: "OUTRO", legalStage: "ANALISE_TECNICA", contentType: "application/pdf", sha256: String(memory.sha256), fileUrl: `/api/transparencia/publicacoes/control-report-${final.id}`, values: { origin: "Relatório circunstanciado final de Controle Interno", sourceDocumentId: final.id, sha256: String(memory.sha256), sizeBytes: bytes.length } } });
    await tx.internalControlEvent.create({ data: { planId: final.planId, eventType: "CONTROL_REPORT_PUBLISHED", actorId: actor.usuarioId, reason: input.title, snapshot: { reportId: String(memory.reportId), finalId: final.id, publicationId: publication.id, publicKey: publication.publicKey, sha256: String(memory.sha256) } } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "CONTROL_REPORT_PUBLICATION", targetId: publication.id });
    return publication;
  });
}

export async function readFrozenControlReportBytes(db: PrismaClient, finalId: string) {
  const final = await db.internalControlEvent.findUnique({ where: { id: finalId } });
  const memory = final?.snapshot as Prisma.JsonObject | undefined;
  if (!final || final.eventType !== "CONTROL_REPORT_FINALIZED" || typeof memory?.pdfBase64 !== "string" || typeof memory.sha256 !== "string") throw new C7OperationError("Documento final indisponível.");
  const bytes = Buffer.from(memory.pdfBase64, "base64");
  if (createHash("sha256").update(bytes).digest("hex") !== memory.sha256) throw new C7OperationError("Integridade do PDF final divergente.");
  const signature = await verifiedReportSignature(db, final.id, memory.sha256);
  return { bytes, sha256: memory.sha256, planId: final.planId, input: controlFinalReportSchema.parse(memory.input), governmentEntityId: String(memory.governmentEntityId), signatureStatus: signature ? "DIGITALLY_SIGNED" : "NOT_DIGITALLY_SIGNED", signature };
}

export async function signControlFinalReport(db: PrismaClient, actor: Actor, input: { finalId: string; certificateId: string }) {
  return db.$transaction(async tx => {
    const final = await tx.internalControlEvent.findUniqueOrThrow({ where: { id: input.finalId } });
    if (final.eventType !== "CONTROL_REPORT_FINALIZED") throw new C7OperationError("Assinatura exige relatório final.");
    await lockedPlan(tx, actor, final.planId);
    const memory = final.snapshot as Prisma.JsonObject;
    const previous = await verifiedReportSignature(tx, final.id, String(memory.sha256));
    if (previous) { if (previous.certificateId !== input.certificateId) throw new C7OperationError("Relatório já assinado com outro certificado."); return previous; }
    const bytes = Buffer.from(String(memory.pdfBase64), "base64");
    if (createHash("sha256").update(bytes).digest("hex") !== memory.sha256) throw new C7OperationError("Bytes finais divergem do hash registrado.");
    const certificate = await tx.digitalCertificate.findUniqueOrThrow({ where: { id: input.certificateId } });
    if (certificate.status !== "ACTIVE" || certificate.validFrom > new Date() || certificate.validTo < new Date() || !Array.isArray(certificate.purposes) || !certificate.purposes.includes("CONTROLE_INTERNO")) throw new C7OperationError("Certificado ativo e válido deve autorizar a finalidade CONTROLE_INTERNO.");
    const intermediateCertificatePems = Array.isArray(certificate.intermediatePems) ? certificate.intermediatePems.filter((value): value is string => typeof value === "string") : [];
    const config = resolveReferencedA1Config({ credentialReference: certificate.credentialReference, certificatePem: certificate.certificatePem, intermediateCertificatePems, trustedRootCertificatePem: certificate.trustedRootPem });
    const evidence = signDocumentHashICPBrasil(final.id, String(memory.sha256), config);
    if (!verifyDocumentHashICPBrasil(evidence, config)) throw new C7OperationError("A assinatura gerada não passou na verificação criptográfica.");
    const event = await tx.internalControlEvent.create({ data: { planId: final.planId, eventType: "CONTROL_REPORT_SIGNED", actorId: actor.usuarioId, reason: "Assinatura A1 destacada sobre hash dos bytes finais", snapshot: json({ reportId: memory.reportId, finalId: final.id, sha256: memory.sha256, certificateId: certificate.id, evidence, intermediateCertificatePems, trustedRootCertificatePem: certificate.trustedRootPem }) } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "CONTROL_REPORT_SIGNATURE", targetId: event.id });
    return { eventId: event.id, certificateId: certificate.id };
  }, { timeout: 60000 });
}
