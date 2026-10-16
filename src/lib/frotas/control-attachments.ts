import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { canViewModule, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { prisma } from "@/lib/prisma";
import { getBlobDocumentPrefix, getFile } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { fleetScope } from "./service";
import { FleetControlError, scopedFleetDriver, scopedFleetUnit } from "./control-access";
import { attachmentExtensions } from "./control-policy";

export const fleetAttachmentTypes = ["application/pdf", "image/png", "image/jpeg", "image/bmp", "image/gif", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.spreadsheet", "image/vnd.dwg", "application/acad", "application/x-acad", "application/octet-stream"];
export const fleetAttachmentOwners = ["VEICULO", "MOTORISTA", "MULTA", "SINISTRO", "AUTORIZACAO", "CONTRATO"] as const;
export type FleetAttachmentPayload = { unitId: string; ownerType: typeof fleetAttachmentOwners[number]; ownerId: string; filename: string };
export function fleetAttachmentPrefix(actorId: string) { return `${getBlobDocumentPrefix()}frotas/${actorId}/`; }
export function validateFleetAttachmentName(name: string, size: number) {
  const extension = name.toLowerCase().split(".").at(-1) || "";
  if (!name || !(attachmentExtensions as readonly string[]).includes(extension) || !Number.isInteger(size) || size <= 0 || size > 20 * 1024 * 1024) throw new FleetControlError("Formato não permitido ou arquivo vazio/superior a 20 MB.");
}
export async function authorizeFleetAttachment(context: AppContext, input: FleetAttachmentPayload) {
  const scope = fleetScope(context), db = context.prisma;
  const unit = await scopedFleetUnit(db, scope, input.unitId, false);
  if (input.ownerType === "VEICULO" && input.ownerId !== unit.id) throw new FleetControlError("Anexo deve corresponder à unidade escolhida.");
  if (input.ownerType === "MOTORISTA") await scopedFleetDriver(db, scope, input.ownerId, unit.departmentId!);
  if (input.ownerType === "MULTA" && !await db.fleetFine.findFirst({ where: { id: input.ownerId, unitId: unit.id }, select: { id: true } })) throw new FleetControlError("Multa fora da unidade.");
  if (input.ownerType === "SINISTRO" && !await db.fleetClaim.findFirst({ where: { id: input.ownerId, unitId: unit.id }, select: { id: true } })) throw new FleetControlError("Sinistro fora da unidade.");
  if (input.ownerType === "AUTORIZACAO" && !await db.fleetAuthorization.findFirst({ where: { id: input.ownerId, unitId: unit.id }, select: { id: true } })) throw new FleetControlError("Autorização fora da unidade.");
  if (input.ownerType === "CONTRATO") {
    const department = await db.department.findUniqueOrThrow({ where: { id: unit.departmentId! }, select: { secretariatId: true } });
    if (!canViewModule(context.user, "COMPRAS") || !await db.contract.findFirst({ where: { id: input.ownerId, ...(scope.administrator ? {} : { secretariatId: department.secretariatId }) }, select: { id: true } })) throw new FleetControlError("Origem contratual não autorizada.");
  }
  return unit;
}
export async function registerFleetAttachment(context: AppContext, input: FleetAttachmentPayload, url: string) {
  await authorizeFleetAttachment(context, input);
  const target = new URL(url), prefix = fleetAttachmentPrefix(context.user.id), pathname = decodeURIComponent(target.pathname).replace(/^\//, "");
  if (target.protocol !== "https:" || target.username || target.password || !target.hostname.endsWith(".blob.vercel-storage.com") || !pathname.startsWith(prefix) || pathname.split("/").some((part) => part === ".." || part === ".")) throw new FleetControlError("Arquivo fora do armazenamento do emissor.");
  const previous = await context.prisma.fleetAttachment.findFirst({ where: { pathname, ownerActorId: context.user.id } });
  if (previous) { if (previous.unitId !== input.unitId || previous.ownerType !== input.ownerType || previous.ownerId !== input.ownerId) throw new FleetControlError("Arquivo registrado para outra finalidade."); return previous; }
  const file = await getFile(url);
  if (!file?.stream || !file.blob.pathname.startsWith(prefix)) throw new FleetControlError("Arquivo indisponível.");
  const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer()); validateFleetAttachmentName(input.filename, bytes.length);
  let id = "";
  try {
    await ingestGedDocument(context.prisma, { title: input.filename, documentType: "Anexo de Frota", documentClassCode: "FLEET_EVIDENCE", fileUrl: url, content: bytes, actorUsuarioId: context.user.id, publicLabel: "Anexo privado de Frota", afterCreate: async (tx, documentId) => {
      const version = await tx.documentVersion.findFirstOrThrow({ where: { documentId, versionNumber: 1 }, select: { id: true } });
      const item = await tx.fleetAttachment.create({ data: { ...input, documentId, versionId: version.id, pathname: file.blob.pathname, size: bytes.length, mimeType: file.blob.contentType || "application/octet-stream", ownerActorId: context.user.id } }); id = item.id;
    } });
  } catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error; const item = await context.prisma.fleetAttachment.findFirst({ where: { pathname: file.blob.pathname, ownerActorId: context.user.id, unitId: input.unitId, ownerType: input.ownerType, ownerId: input.ownerId } }); if (!item) throw error; return item; }
  return context.prisma.fleetAttachment.findUniqueOrThrow({ where: { id } });
}
export async function downloadFleetAttachment(context: AppContext, id: string) {
  const item = await context.prisma.fleetAttachment.findFirst({ where: { id, withdrawnAt: null } });
  if (!item) throw new FleetControlError("Anexo indisponível.");
  await authorizeFleetAttachment(context, item as FleetAttachmentPayload);
  const version = await context.prisma.documentVersion.findFirst({ where: { id: item.versionId, status: { in: ["FINAL", "SIGNED"] }, document: { status: { in: ["Válido", "Assinado"] } } } });
  if (!version) throw new FleetControlError("Versão invalidada/retirada.");
  const file = await getFile(version.fileUrl); if (!file?.stream) throw new FleetControlError("Arquivo indisponível.");
  const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== version.hashSha256) throw new FleetControlError("Integridade do anexo inválida.");
  await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.documentDownload, targetType: "FLEET_ATTACHMENT", targetId: item.id });
  return { item, bytes };
}
export async function withdrawFleetAttachment(context: AppContext, id: string) {
  const item = await context.prisma.fleetAttachment.findUniqueOrThrow({ where: { id } }); await authorizeFleetAttachment(context, item as FleetAttachmentPayload);
  if (!fleetScope(context).administrator && item.ownerActorId !== context.user.id) throw new FleetControlError("Somente emissor ou administração pode retirar o anexo.");
  await context.prisma.$transaction(async tx => {
    const changed = await tx.fleetAttachment.updateMany({ where: { id, withdrawnAt: null }, data: { withdrawnAt: new Date() } });
    if (changed.count) await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "FLEET_ATTACHMENT_WITHDRAWN", targetId: id });
  });
}
export async function fleetAttachmentCallbackContext(actorId: string) {
  const user = await prisma.usuario.findFirst({ where: { id: actorId, ativo: true, perfil: { ativo: true } }, include: { perfil: true, employee: true, permissoesModulo: { include: { modulo: true } } } });
  if (!user) throw new FleetControlError("Emissor inativo.");
  const context = { prisma, user: { id: user.id, name: user.nome, email: user.email, firebaseUid: user.firebaseUid || "", role: user.perfil.nome, profileCode: user.perfil.codigo, permissions: user.perfil.permissoes, modulePermissions: user.permissoesModulo.map((row) => ({ code: row.modulo.codigo, canView: row.canView, canEdit: row.canEdit })), allowedBudgetUnitIds: [], employeeId: user.employeeId, departmentId: user.employee?.departmentId || null, secretariatId: user.employee?.secretariatId || null } } satisfies AppContext;
  if (!canPerformModuleOperation(context.user, "FROTAS", "create")) throw new FleetControlError("Permissão de upload revogada.");
  return context;
}
