import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { TributarioS9Error } from "../tributacao/s9-engine";
import { z } from "zod";

export function workflowPage(value?: string) {
  const parsed = z.coerce.number().int().min(1).max(Math.floor(Number.MAX_SAFE_INTEGER / 20)).safeParse(value ?? 1);
  return parsed.success ? parsed.data : 1;
}

export async function lockWorkflowRows(tx: Prisma.TransactionClient, table: "TaxDeceased" | "CemeteryProcess" | "TaxGrave" | "CemeteryLot" | "CemeteryOssuary" | "Taxpayer" | "TaxBurialMovement" | "TaxGraveConcession", ids: (string | null | undefined)[]) {
  for (const id of [...new Set(ids.filter((id): id is string => Boolean(id)))].sort()) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE id = ${id} FOR UPDATE`);
  }
}

export async function workflowRequest(tx: Prisma.TransactionClient, operation: string, requestKey: string | undefined, input: unknown) {
  if (!requestKey) return { replayId: null, record: async (id: string, actor: string) => { void id; void actor; } };
  if (!requestKey.trim() || requestKey.length > 200) throw new TributarioS9Error("Chave da solicitação inválida.");
  const targetId = `${operation}:${requestKey}`;
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${targetId}))`;
  const prior = await tx.cemeteryChangeHistory.findFirst({ where: { targetType: "WORKFLOW_REQUEST", targetId, fieldName: "requestKey" } });
  const value = prior?.newValue as { id?: string; fingerprint?: string } | undefined;
  if (value && value.fingerprint !== fingerprint) throw new TributarioS9Error("A chave da solicitação já foi usada com outros dados.");
  return {
    replayId: value?.id ?? null,
    record: async (id: string, actorUsuarioId: string) => {
      await tx.cemeteryChangeHistory.create({ data: { targetType: "WORKFLOW_REQUEST", targetId, fieldName: "requestKey", newValue: { id, fingerprint }, actorUsuarioId } });
    },
  };
}

export function validateWorkflowDate(date: Date, label: string) {
  if (!Number.isFinite(date.getTime())) throw new TributarioS9Error(`${label} inválida.`);
}

export function validateBurialIdentity(input: { burialType?: string | null; unidentified?: boolean; deceasedTaxpayerId?: string | null; exceptionReason?: string; memberOwnerDeceased?: boolean }) {
  const type = input.burialType ?? (input.unidentified ? "NAO_RECLAMADO" : "NORMAL");
  if (!["NORMAL", "MEMBRO", "NAO_RECLAMADO"].includes(type)) throw new TributarioS9Error("Tipo de sepultamento inválido.");
  if (input.unidentified && input.deceasedTaxpayerId) throw new TributarioS9Error("Pessoa não identificada não pode ter cadastro de pessoa física fictício.");
  if (type === "NORMAL" && (!input.deceasedTaxpayerId || input.unidentified)) throw new TributarioS9Error("Sepultamento normal exige pessoa física identificada no Cadastro Único.");
  if (type === "MEMBRO" && (!input.deceasedTaxpayerId || input.unidentified)) throw new TributarioS9Error("Sepultamento de membro exige o cadastro da pessoa proprietária do membro.");
  if (type === "NAO_RECLAMADO" && !input.unidentified && !input.deceasedTaxpayerId) throw new TributarioS9Error("Pessoa identificada não reclamada exige vínculo de pessoa física.");
  if ((input.unidentified || type === "NAO_RECLAMADO") && !input.exceptionReason?.trim()) throw new TributarioS9Error("Sepultamento não reclamado/não identificado exige justificativa explícita.");
  return type;
}

export function validateTransferPair(input: { movementType: string; toGraveId?: string; ossuaryId?: string; destinationDescription?: string }, origin: { id: string; cemeteryId: string; lotId: string | null }, destination: { id: string; cemeteryId: string; lotId: string | null } | null) {
  const type = input.movementType;
  if (!["OUTRO_LOTE", "OSSUARIO", "EXUMACAO", "MUDANCA_CIDADE", "MUDANCA_CEMITERIO", "DESAPROPRIACAO", "CREMACAO", "OUTRO"].includes(type)) throw new TributarioS9Error("Tipo de movimentação inválido.");
  if (input.toGraveId && input.ossuaryId) throw new TributarioS9Error("Informe apenas um destino.");
  if (type === "OUTRO_LOTE") {
    if (!destination || !destination.lotId || destination.lotId === origin.lotId || destination.cemeteryId !== origin.cemeteryId) throw new TributarioS9Error("Outro lote exige sepultura em lote distinto no mesmo cemitério.");
  } else if (type === "MUDANCA_CEMITERIO") {
    if (destination && destination.cemeteryId === origin.cemeteryId) throw new TributarioS9Error("Mudança de cemitério exige outro cemitério.");
    if (input.ossuaryId || (!destination && !input.destinationDescription?.trim())) throw new TributarioS9Error("Informe o cemitério de destino.");
  } else if (type === "OSSUARIO") {
    if (!input.ossuaryId || input.toGraveId) throw new TributarioS9Error("Transferência para ossuário exige exclusivamente um ossuário.");
  } else if (input.toGraveId || input.ossuaryId || !input.destinationDescription?.trim()) {
    throw new TributarioS9Error("Esta movimentação exige destino/justificativa descrito, sem sepultura ou ossuário de destino.");
  }
  if (destination?.id === origin.id) throw new TributarioS9Error("Origem e destino devem ser diferentes.");
}
