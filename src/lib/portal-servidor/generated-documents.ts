import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { changePortalEvent, activePortalDocumentPolicies, portalEvent, portalEvents, portalFirst, portalRequired, portalRows } from "@/db/repositories/portal-servidor/records";
import { portalEmployeeProfile } from "@/db/repositories/portal-servidor/profile";
import { documents } from "@/db/schema/registry";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { documentLayoutPolicySchema, functionalDocumentInputSchema, renderFunctionalTemplate, type FunctionalDocumentInput, type DocumentLayoutPolicy } from "./document-policy";
import { buildFunctionalDocumentSource } from "./document-sources";
import { buildOwnFinalPppSource } from "@/lib/sst/ppp-final-service";
import { ingestGedDocument, requestDocumentSignaturesForActor } from "@/lib/documents/document-flow-service";
import { deleteUploadedDocument, getFile, uploadGeneratedFinancialFile } from "@/lib/platform/blob";
import { enqueueHrIntegration } from "@/lib/rh/workforce-service";
import { renderHrReport } from "@/lib/rh/report-service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { makeFunctionalSourceManifest, functionalSourceManifestSchema, functionalSourceManifestIsCurrent } from "./source-manifest";

export function functionalSourceHash(value: unknown) {
  const normalize = (item: unknown): unknown => Array.isArray(item) ? item.map(normalize) : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)])) : item;
  return createHash("sha256").update(JSON.stringify(normalize(JSON.parse(JSON.stringify(value))))).digest("hex");
}
export const generatedArtifactSchema = z.object({ input: functionalDocumentInputSchema, employeeId: z.string(), actorId: z.string(), code: z.uuid(), policy: documentLayoutPolicySchema, sourceHash: z.string(), manifest: functionalSourceManifestSchema.optional(), documentId: z.string(), versionId: z.string(), fileHash: z.string(), fileUrl: z.string(), issuedAt: z.iso.datetime(), expiresAt: z.iso.datetime().nullable() });

async function ownEmployee(context: AppContext) {
  const employee = await portalEmployeeProfile(context.database ?? db, context.user.employeeId || "__SEM_VINCULO__");
  if (!employee?.person || !employee.isActive) throw new AccessError("Identidade funcional ativa e Cadastro Único obrigatórios.", 403);
  return employee;
}
export async function listOwnDocumentModels(context: AppContext) {
  const employee = await ownEmployee(context), now = new Date();
  const executor = context.database ?? db;
  const rules = await activePortalDocumentPolicies(executor, now);
  const units = await portalRows<{ id: string }>(executor, sql`SELECT id FROM "BudgetUnit" WHERE "secretariatId"=${employee.secretariatId || "__SEM_SECRETARIA__"}`);
  const historical = await portalRows<{ budgetUnitId: string }>(executor, sql`SELECT DISTINCT "budgetUnitId" FROM "HrEmployeeFunctionalPeriod" WHERE "employeeId"=${employee.id}`);
  const allowed = new Set([...units.map(unit => unit.id), ...historical.map(unit => unit.budgetUnitId)]);
  return rules.flatMap(rule => { const parsed = documentLayoutPolicySchema.safeParse(rule.value); return parsed.success && allowed.has(parsed.data.budgetUnitId) ? [{ id: rule.id, name: rule.name, policy: parsed.data }] : []; });
}
async function documentSource(context: AppContext, input: FunctionalDocumentInput, policy: DocumentLayoutPolicy) {
  return input.kind === "PPP" ? buildOwnFinalPppSource(context, input, policy) : buildFunctionalDocumentSource(context, input, policy);
}

export async function issueOwnFunctionalDocument(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = functionalDocumentInputSchema.parse(raw), employee = await ownEmployee(context);
  if (input.until > new Date().toISOString().slice(0, 10)) throw new Error("Documentos funcionais não certificam períodos futuros.");
  const model = (await listOwnDocumentModels(context)).find(item => item.id === input.policyId && item.policy.kinds.includes(input.kind));
  if (!model) throw new AccessError("Modelo indisponível para o titular.", 403);
  const source = await documentSource(context, input, model.policy), sourceHash = functionalSourceHash({ source: source.snapshot, policy: model.policy, input });
  const sourceKey = `PORTAL:DOCUMENTO_GERADO:${employee.id}:${input.requestKey || randomUUID()}`;
  const previous = await portalEvent(context.database ?? db, sql`"sourceKey"=${sourceKey}`);
  if (previous) { if (previous.status === "REVOGADO" || generatedArtifactSchema.parse(previous.payload).sourceHash !== sourceHash) throw new Error("Chave já utilizada com outro conteúdo ou documento revogado. Inicie uma nova emissão."); return previous.id; }
  const code = randomUUID(), issuedAt = new Date().toISOString();
  const expiresAt = input.kind === "MARGEM" ? new Date(Date.now() + model.policy.validityDays! * 86400000).toISOString() : null;
  const fields = { nome: employee.person!.fullName, cpf: requireValidCpf(employee.person!.cpf), matricula: employee.registration || "", inicio: input.from, fim: input.until, dias: "", ano: String(input.year || ""), emitente: model.policy.issuerName, cnpj: model.policy.issuerCnpj, cargo: "", lotacao: "", situacao: "", banco: "", margem: "", validade: expiresAt?.slice(0, 10) || "", ...source.fields };
  const text = renderFunctionalTemplate(model.policy.text, fields);
  const file = await renderHrReport({ title: model.policy.title, headers: ["Informação", "Conteúdo"], rows: [["Emitente", `${model.policy.issuerName} · CNPJ ${model.policy.issuerCnpj}`], ["Titular", `${employee.person!.fullName} · CPF ${employee.person!.cpf}`], ["Documento", text], ["Fundamento", model.policy.legalReference], ...source.rows.map(row => [source.headers.map((header, index) => `${header}: ${row[index] || ""}`).join(" · "), ""]), ["Modelo", `${model.name} · ${input.policyId}`], ["Emissão", issuedAt], ["Autenticidade", `/validar-emissao/${code}`], ["Rodapé", model.policy.footer]] }, "PDF");
  const blob = await uploadGeneratedFinancialFile(`${input.kind.toLowerCase()}-${code}.pdf`, file.bytes, file.contentType);
  let eventId = "", versionId = "", documentId = "";
  try {
    await ingestGedDocument(connection, { title: model.policy.title, documentType: input.kind, documentClassCode: model.policy.documentClassCode, fileUrl: blob.url, content: file.bytes, publicLabel: "Emissão funcional", actorUsuarioId: context.user.id, afterCreate: async (tx, id) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL:EMISSAO:${employee.id}:${input.kind}`}))`);
      if (input.kind === "MARGEM" && model.policy.blockMarginUntilRelease) {
        const active = await portalEvents(tx, sql`"eventType"='DOCUMENTO_FUNCIONAL_GERADO' AND status<>'REVOGADO' AND payload->>'employeeId'=${employee.id}`);
        if (active.some(event => { const artifact = generatedArtifactSchema.parse(event.payload); return artifact.input.kind === "MARGEM" && !(event.result as { marginReleased?: boolean } | null)?.marginReleased; })) throw new Error("Nova emissão de margem bloqueada até liberação expressa do RH, conforme a política configurada.");
      }
      await tx.update(documents).set({ personId: employee.person!.id }).where(eq(documents.id, id));
      const version = await portalRequired<{ id: string }>(tx, sql`SELECT id FROM "DocumentVersion" WHERE "documentId"=${id} AND "versionNumber"=1 LIMIT 1`);
      documentId = id; versionId = version.id;
      const payload = { input, employeeId: employee.id, actorId: context.user.id, code, policy: model.policy, sourceHash, manifest: makeFunctionalSourceManifest(source.snapshot), documentId, versionId, fileHash: createHash("sha256").update(file.bytes).digest("hex"), fileUrl: blob.url, issuedAt, expiresAt };
      const event = await enqueueHrIntegration(tx, { sourceKey, domain: "PORTAL", environment: "INTERNO", eventType: "DOCUMENTO_FUNCIONAL_GERADO", payload });
      await changePortalEvent(tx, event.id, { status: model.policy.requireSignature ? "AGUARDANDO_ASSINATURA" : "PROCESSADO" });
      eventId = event.id;
    } });
  } catch (error) { await deleteUploadedDocument(blob).catch(() => undefined); throw error; }
  if (model.policy.requireSignature) await requestDocumentSignaturesForActor(connection, context.user.id, documentId, model.policy.signerUserIds, { functionalEmissionId: eventId, functionalDocumentVersionId: versionId });
  return eventId;
}

export async function readOwnGeneratedDocument(context: AppContext, id: string) {
  const employee = await ownEmployee(context);
  const executor = context.database ?? db;
  const event = await portalEvent(executor, sql`id=${id} AND "eventType"='DOCUMENTO_FUNCIONAL_GERADO' AND domain='PORTAL' AND status<>'REVOGADO' AND payload->>'employeeId'=${employee.id}`);
  if (!event) throw new AccessError("Emissão indisponível.", 404);
  const artifact = generatedArtifactSchema.parse(event.payload);
  if (artifact.expiresAt && new Date(artifact.expiresAt) < new Date()) throw new AccessError("Documento expirado conforme a validade configurada.", 423);
  const version = await portalFirst<{ id: string }>(executor, sql`SELECT v.id FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" WHERE v.id=${artifact.versionId} AND v."hashSha256"=${artifact.fileHash} AND ${artifact.policy.requireSignature ? sql`v.status='SIGNED'` : sql`v.status IN ('FINAL','SIGNED')`} AND d."personId"=${employee.person!.id} AND d.status IN ('Válido','Assinado') LIMIT 1`);
  if (!version) throw new AccessError("Documento aguarda assinatura ou foi revogado na origem.", 423);
  const source = await documentSource(context, artifact.input, artifact.policy);
  if (functionalSourceHash({ source: source.snapshot, policy: artifact.policy, input: artifact.input }) !== artifact.sourceHash) throw new AccessError("Fontes alteradas após a emissão; solicite uma versão atualizada.", 423);
  const file = await getFile(artifact.fileUrl); if (!file?.stream) throw new AccessError("Arquivo indisponível.", 404);
  const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== artifact.fileHash) throw new AccessError("Integridade documental inválida.", 423);
  await writeAuditEvent(executor, { actorUsuarioId: context.user.id, eventType: auditEventTypes.documentDownload, targetType: "FUNCTIONAL_GENERATED_DOCUMENT", targetId: event.id });
  return { bytes, artifact };
}

export async function manageGeneratedDocument(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ id: z.string().min(1), operation: z.enum(["REVOGAR", "LIBERAR_MARGEM", "SOLICITAR_ASSINATURA"]), reason: z.string().trim().min(10).max(4000) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para gerenciar emissões.", 403);
  const event = await portalEvent(context.database ?? db, sql`id=${input.id} AND "eventType"='DOCUMENTO_FUNCIONAL_GERADO'`);
  if (!event) throw new Error("Registro não encontrado.");
  const artifact = generatedArtifactSchema.parse(event.payload);
  assertBudgetUnitAccess(context.user, artifact.policy.budgetUnitId);
  if (artifact.input.kind === "PPP" && !canPerformModuleOperation(context.user, "SST", "issueReports")) throw new AccessError("PPP exige autorização de emissão SST.", 403);
  if (input.operation === "SOLICITAR_ASSINATURA") { await requestDocumentSignaturesForActor(connection, context.user.id, artifact.documentId, artifact.policy.signerUserIds, { functionalEmissionId: event.id }); return; }
  if (input.operation === "LIBERAR_MARGEM" && artifact.input.kind !== "MARGEM") throw new Error("Liberação FP-084 exige documento de margem.");
  await withDatabaseTransaction(connection, async tx => {
    await changePortalEvent(tx, event.id, input.operation === "REVOGAR" ? { status: "REVOGADO", result: { reason: input.reason, actorId: context.user.id, revokedAt: new Date().toISOString() } } : { result: { marginReleased: true, reason: input.reason, actorId: context.user.id } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "FUNCTIONAL_GENERATED_DOCUMENT", targetId: event.id });
  });
}

export async function verifyGeneratedDocument(contextDb: DatabaseExecutor, code: string) {
  if (!z.uuid().safeParse(code).success) return { valid: false as const };
  const event = await portalEvent(contextDb, sql`domain='PORTAL' AND "eventType"='DOCUMENTO_FUNCIONAL_GERADO' AND status<>'REVOGADO' AND payload->>'code'=${code}`);
  if (!event) return { valid: false as const };
  const artifact = generatedArtifactSchema.parse(event.payload);
  const version = await portalFirst<{ id: string; status: string }>(contextDb, sql`SELECT v.id,v.status FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" WHERE v.id=${artifact.versionId} AND v."hashSha256"=${artifact.fileHash} AND ${artifact.policy.requireSignature ? sql`v.status='SIGNED'` : sql`v.status IN ('FINAL','SIGNED')`} AND d.status IN ('Válido','Assinado') LIMIT 1`);
  if (!version || artifact.expiresAt && new Date(artifact.expiresAt) < new Date()) return { valid: false as const };
  if (artifact.manifest && !await functionalSourceManifestIsCurrent(contextDb, artifact.manifest)) return { valid: false as const };
  return { valid: true as const, kind: artifact.input.kind, issuedAt: artifact.issuedAt, hash: artifact.fileHash, signed: version.status === "SIGNED" };
}
