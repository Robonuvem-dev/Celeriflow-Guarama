import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { assertInternalItbiProcessAccess, assertPortalItbiAccess } from "./itbi-process-channel";
import { taxScopeSnapshot } from "./scope";
import { serviceReportPdf } from "@/lib/portal-cidadao/report";
import { linkItbiPropertyAttachments } from "./itbi-attachments";

const tokens = ["ente", "ug", "declaracao", "protocolo", "inscricao", "endereco", "partes", "valor_declarado", "base_calculo", "imposto", "pagamentos", "situacao", "tratamento_fiscal", "emissao"];
export const itbiDocumentModelSchema = z.object({
  governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), modelId: z.string().optional(), expectedVersion: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(160), title: z.string().trim().min(1).max(240), body: z.string().trim().min(1).max(16000), legalBasis: z.string().trim().min(1).max(4000),
  requiredState: z.enum(["PROCESS", "APPROVED", "SETTLED", "NON_TAXABLE"]), active: z.boolean(), allowPortal: z.boolean(),
}).refine(input => [...input.body.matchAll(/\{\{([^{}]+)\}\}/g)].every(match => tokens.includes(match[1])) && !/\{\{|\}\}/.test(input.body.replace(/\{\{([^{}]+)\}\}/g, "")), "O texto contém um marcador desconhecido ou incompleto.");
type Auth = { actor: TaxActor } | { usuarioId: string };
type State = z.infer<typeof itbiDocumentModelSchema>["requiredState"];

export async function publishItbiDocumentModel(db: PrismaClient, actor: TaxActor, raw: z.input<typeof itbiDocumentModelSchema>) {
  const input = itbiDocumentModelSchema.parse(raw);
  return db.$transaction(async tx => {
    if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
    if (!await tx.planningEntityUnit.findFirst({ where: { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId } })) throw new Error("Origem não conciliada.");
    const modelId = input.modelId ?? randomUUID();
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ITBI_DOCUMENT_MODEL:${modelId}`},0))::text`;
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ITBI_DOCUMENT_MODEL", entityId: modelId, category: "ITBI_DOCUMENT_MODEL" }, orderBy: { version: "desc" } });
    if ((previous?.version ?? 0) !== input.expectedVersion || input.modelId && !previous) throw new Error("Modelo alterado. Recarregue antes de publicar.");
    if (previous) { const scope = taxScopeSnapshot(previous.data); if (scope.governmentEntityId !== input.governmentEntityId || scope.budgetUnitId !== input.budgetUnitId) throw new Error("A origem do modelo é imutável."); }
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "ITBI_DOCUMENT_MODEL", entityId: modelId, category: "ITBI_DOCUMENT_MODEL", title: input.name, version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: { ...input, modelId, previousId: previous?.id ?? null } } });
    await tx.taxAuditLog.create({ data: { action: "PUBLISH_ITBI_DOCUMENT_MODEL", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous?.data ?? null, after: entry.data } as Prisma.InputJsonObject } });
    return entry;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function documentPosition(tx: Prisma.TransactionClient, auth: Auth, declarationId: string, state: State) {
  const access = "actor" in auth ? await assertInternalItbiProcessAccess(tx, auth.actor, declarationId) : await assertPortalItbiAccess(tx, auth.usuarioId, declarationId);
  const declaration = access.declaration;
  if (["RASCUNHO", "CANCELADA", "INDEFERIDA", "RETIFICADA"].includes(declaration.status)) throw new Error("A declaração não está disponível para emissão deste documento.");
  const approved = ["APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"].includes(declaration.status);
  if (["APPROVED", "SETTLED"].includes(state) && !approved) throw new Error("O modelo exige declaração aprovada.");
  const treatment = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_FISCAL_TREATMENT" }, orderBy: { version: "desc" } });
  const treatmentData = taxScopeSnapshot(treatment?.data);
  if (state === "NON_TAXABLE" && (declaration.status !== "NAO_TRIBUTAVEL" || !["ISENTO", "IMUNIDADE", "NAO_INCIDENCIA"].includes(String(treatmentData.treatment)))) throw new Error("O modelo exige decisão vigente de isenção, imunidade ou não incidência.");
  const assessment = declaration.assessmentId ? await tx.taxAssessment.findUniqueOrThrow({ where: { id: declaration.assessmentId } }) : null;
  if (state === "APPROVED" && (!assessment || ["Cancelado", "Extinto", "Suspenso"].includes(assessment.status))) throw new Error("O crédito vinculado não está disponível para declarar a aprovação vigente.");
  if (assessment) {
    const scope = taxScopeSnapshot(assessment.calculationSnapshot);
    if (scope.governmentEntityId !== access.scope.governmentEntityId || scope.budgetUnitId !== access.scope.budgetUnitId) throw new Error("Crédito e declaração possuem origens divergentes.");
  }
  const payments = declaration.assessmentId ? await tx.taxPayment.findMany({ where: { guide: { assessmentId: declaration.assessmentId }, status: "Confirmado" }, select: { id: true, amountPaidDecimal: true }, orderBy: { id: "asc" } }) : [];
  if (payments.some(row => !row.amountPaidDecimal)) throw new Error("Pagamento sem valor Decimal conciliado.");
  const paid = payments.reduce((sum, row) => sum.plus(row.amountPaidDecimal!), new Prisma.Decimal(0));
  if (state === "SETTLED" && (!assessment?.finalValueDecimal || assessment.finalValueDecimal.lte(0) || ["Cancelado", "Extinto", "Suspenso"].includes(assessment.status) || paid.lt(assessment.finalValueDecimal))) throw new Error("A quitação exige pagamento integral confirmado do crédito vigente.");
  const unit = await tx.planningEntityUnit.findFirstOrThrow({ where: access.scope, include: { governmentEntity: true, budgetUnit: true } });
  const property = await tx.realEstate.findUniqueOrThrow({ where: { id: declaration.realEstateId } });
  const parties = await tx.itbiParty.findMany({ where: { declarationId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const taxpayers = await tx.taxpayer.findMany({ where: { id: { in: parties.map(row => row.taxpayerId) } }, include: { person: true, company: true } });
  const values: Record<string, string> = {
    ente: unit.governmentEntity.name, ug: unit.budgetUnit.code, declaracao: declaration.declarationNumber, protocolo: declaration.protocolNumber ?? "", inscricao: property.municipalInsc ?? property.id,
    endereco: `${property.streetName ?? ""}, ${property.number ?? ""} ${property.complement ?? ""}`.trim(),
    partes: parties.map(row => { const taxpayer = taxpayers.find(item => item.id === row.taxpayerId); return `${row.role}: ${taxpayer?.company?.corporateName ?? taxpayer?.person?.fullName ?? row.taxpayerId} (${row.participationPercent?.toString() ?? "—"}%)`; }).join("\n"),
    valor_declarado: declaration.declaredPropertyValue.toFixed(2), base_calculo: declaration.taxableBase.toFixed(2), imposto: declaration.status === "NAO_TRIBUTAVEL" ? "0.00" : (assessment?.finalValueDecimal ?? declaration.taxAmount).toFixed(2), pagamentos: paid.toFixed(2), situacao: declaration.status,
    tratamento_fiscal: typeof treatmentData.treatment === "string" ? treatmentData.treatment : "TRIBUTAVEL",
  };
  const fingerprint = createHash("sha256").update(JSON.stringify({ values, treatmentId: treatment?.id ?? null, payments: payments.map(row => ({ id: row.id, amount: row.amountPaidDecimal!.toFixed(2) })), assessmentStatus: assessment?.status ?? null })).digest("hex");
  return { ...access, values, fingerprint };
}

export async function issueConfiguredItbiDocument(db: PrismaClient, auth: Auth, raw: { declarationId: string; modelId: string; expectedModelVersion: number; requestKey: string }) {
  const input = z.object({ declarationId: z.string().min(1), modelId: z.string().min(1), expectedModelVersion: z.number().int().positive(), requestKey: z.uuid() }).parse(raw);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ITBI_DOCUMENT_ISSUANCE:${input.requestKey}`},0))::text`;
    const model = await tx.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "ITBI_DOCUMENT_MODEL", entityId: input.modelId, category: "ITBI_DOCUMENT_MODEL" }, orderBy: { version: "desc" } });
    const config = itbiDocumentModelSchema.parse(model.data);
    if (!config.active || model.version !== input.expectedModelVersion || !("actor" in auth) && !config.allowPortal) throw new Error("Modelo indisponível, alterado ou reservado ao atendimento interno.");
    const position = await documentPosition(tx, auth, input.declarationId, config.requiredState);
    if (config.governmentEntityId !== position.scope.governmentEntityId || config.budgetUnitId !== position.scope.budgetUnitId) throw new Error("Modelo de outra origem municipal.");
    const actor: TaxActor = "actor" in auth ? auth.actor : { usuarioId: auth.usuarioId, employeeId: null, allowedBudgetUnitIds: [position.scope.budgetUnitId] };
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ITBI_CONFIGURED_DOCUMENT", entityId: input.requestKey, category: "ITBI_DOCUMENT_ISSUANCE" } });
    if (previous) {
      const data = taxScopeSnapshot(previous.data);
      if (previous.actorUsuarioId !== actor.usuarioId || data.declarationId !== input.declarationId || data.modelVersionId !== model.id) throw new Error("Chave de emissão já utilizada com outros dados.");
      return { issuanceId: previous.id };
    }
    const values = { ...position.values, emissao: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) };
    const body = config.body.replace(/\{\{([^{}]+)\}\}/g, (_match, token: string) => values[token as keyof typeof values] ?? "");
    const issuanceId = randomUUID();
    const document = await tx.document.create({ data: { title: config.title, documentType: "Declaração configurada ITBI", fileUrl: `/api/tributacao/itbi/declaracoes/${issuanceId}`, publicLabel: "Declaração municipal de ITBI", status: "Válido" } });
    const entry = await tx.taxRegistryEntry.create({ data: { id: issuanceId, entityType: "ITBI_CONFIGURED_DOCUMENT", entityId: input.requestKey, category: "ITBI_DOCUMENT_ISSUANCE", title: config.title, actorUsuarioId: actor.usuarioId, processId: position.declaration.processId, documentId: document.id, data: { ...position.scope, declarationId: position.declaration.id, modelId: model.entityId, modelVersionId: model.id, modelVersion: model.version, requiredState: config.requiredState, allowPortal: config.allowPortal, title: config.title, body, legalBasis: config.legalBasis, values, fingerprint: position.fingerprint, issuedAt: new Date().toISOString() } } });
    if (position.declaration.processId) await tx.processDocument.create({ data: { processId: position.declaration.processId, documentId: document.id, purpose: config.title, employeeId: actor.employeeId } });
    await linkItbiPropertyAttachments(tx, actor, position.declaration.id, [document.id]);
    await tx.taxAuditLog.create({ data: { action: "ISSUE_CONFIGURED_ITBI_DOCUMENT", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...position.scope, declarationId: position.declaration.id, documentId: document.id, modelVersionId: model.id, fingerprint: position.fingerprint } } });
    return { issuanceId: entry.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
}

export async function renderConfiguredItbiDocument(db: PrismaClient, auth: Auth, issuanceId: string) {
  const lines = await db.$transaction(async tx => {
    const entry = await tx.taxRegistryEntry.findFirstOrThrow({ where: { id: issuanceId, entityType: "ITBI_CONFIGURED_DOCUMENT", category: "ITBI_DOCUMENT_ISSUANCE" } });
    const data = taxScopeSnapshot(entry.data); const state = z.enum(["PROCESS", "APPROVED", "SETTLED", "NON_TAXABLE"]).parse(data.requiredState);
    if (!("actor" in auth) && data.allowPortal !== true) throw new Error("Documento reservado ao atendimento interno.");
    if (!entry.documentId || !await tx.document.findFirst({ where: { id: entry.documentId, status: "Válido" } })) throw new Error("Documento revogado ou indisponível no GED.");
    const position = await documentPosition(tx, auth, String(data.declarationId), state);
    if (data.governmentEntityId !== position.scope.governmentEntityId || data.budgetUnitId !== position.scope.budgetUnitId || data.fingerprint !== position.fingerprint) throw new Error("A posição tributária mudou após esta emissão. Emita uma declaração atualizada.");
    const frozen = taxScopeSnapshot(data.values);
    return [String(data.title), String(frozen.ente), `UG ${String(frozen.ug)}`, String(data.body), `Fundamento legal: ${String(data.legalBasis)}`, `Emissão: ${String(data.issuedAt)}`, `Modelo: ${String(data.modelId)} · versão ${String(data.modelVersion)}`, `Referência da emissão: ${entry.id}`];
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 });
  return serviceReportPdf(lines[0], lines.slice(1));
}
