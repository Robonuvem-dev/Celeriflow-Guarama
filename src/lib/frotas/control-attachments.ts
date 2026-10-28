import "server-only";
import { createHash } from "node:crypto";
import { and, eq, getTableColumns, inArray, isNull } from "drizzle-orm";
import type { FleetContext as AppContext } from "@/lib/contracts/fleet";
import type { DatabaseConnection } from "@/db/connection";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { getPostgresError } from "@/db/errors";
import * as f from "@/db/schema/fleet";
import { departments, employees } from "@/db/schema/administration";
import { documentVersions } from "@/db/schema/document-workflow";
import { documents } from "@/db/schema/registry";
import { accessProfiles, modules, users, userModulePermissions } from "@/db/schema/identity";
import { fleetDatabase, requiredFleetRecord } from "@/db/repositories/fleet/records";
import { readFleetContract } from "@/db/repositories/fleet/sources";
import { procurementContracts } from "@/db/schema/procurement-core";
import { canViewModule, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { getBlobDocumentPrefix, getFile } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
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
   const scope = fleetScope(context), db = fleetDatabase(context);
  const unit = await scopedFleetUnit(db, scope, input.unitId, false);
  if (input.ownerType === "VEICULO" && input.ownerId !== unit.id) throw new FleetControlError("Anexo deve corresponder à unidade escolhida.");
  if (input.ownerType === "MOTORISTA") await scopedFleetDriver(db, scope, input.ownerId, unit.departmentId!);
  if (input.ownerType === "MULTA" && !(await db.select({ id: f.fleetFines.id }).from(f.fleetFines).where(and(eq(f.fleetFines.id, input.ownerId), eq(f.fleetFines.unitId, unit.id))).limit(1)).length) throw new FleetControlError("Multa fora da unidade.");
  if (input.ownerType === "SINISTRO" && !(await db.select({ id: f.fleetClaims.id }).from(f.fleetClaims).where(and(eq(f.fleetClaims.id, input.ownerId), eq(f.fleetClaims.unitId, unit.id))).limit(1)).length) throw new FleetControlError("Sinistro fora da unidade.");
  if (input.ownerType === "AUTORIZACAO" && !(await db.select({ id: f.fleetAuthorizations.id }).from(f.fleetAuthorizations).where(and(eq(f.fleetAuthorizations.id, input.ownerId), eq(f.fleetAuthorizations.unitId, unit.id))).limit(1)).length) throw new FleetControlError("Autorização fora da unidade.");
  if (input.ownerType === "CONTRATO") {
    const department = requiredFleetRecord(await db.select({ secretariatId: departments.secretariatId }).from(departments).where(eq(departments.id, unit.departmentId!)).limit(1));
    if (!canViewModule(context.user, "COMPRAS") || !await readFleetContract(db, input.ownerId, scope.administrator ? undefined : eq(procurementContracts.secretariatId, department.secretariatId))) throw new FleetControlError("Origem contratual não autorizada.");
  }
  return unit;
}
export async function registerFleetAttachment(context: AppContext, input: FleetAttachmentPayload, url: string, connection: DatabaseConnection = databaseConnection) {
  const db = fleetDatabase(context);
  await authorizeFleetAttachment(context, input);
  const target = new URL(url), prefix = fleetAttachmentPrefix(context.user.id), pathname = decodeURIComponent(target.pathname).replace(/^\//, "");
  if (target.protocol !== "https:" || target.username || target.password || !target.hostname.endsWith(".blob.vercel-storage.com") || !pathname.startsWith(prefix) || pathname.split("/").some((part) => part === ".." || part === ".")) throw new FleetControlError("Arquivo fora do armazenamento do emissor.");
  const [previous] = await db.select().from(f.fleetAttachments).where(and(eq(f.fleetAttachments.pathname, pathname), eq(f.fleetAttachments.ownerActorId, context.user.id))).limit(1);
  if (previous) { if (previous.unitId !== input.unitId || previous.ownerType !== input.ownerType || previous.ownerId !== input.ownerId) throw new FleetControlError("Arquivo registrado para outra finalidade."); return previous; }
  const file = await getFile(url);
  if (!file?.stream || !file.blob.pathname.startsWith(prefix)) throw new FleetControlError("Arquivo indisponível.");
  const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer()); validateFleetAttachmentName(input.filename, bytes.length);
  let id = "";
  try {
    await ingestGedDocument(connection, { title: input.filename, documentType: "Anexo de Frota", documentClassCode: "FLEET_EVIDENCE", fileUrl: url, content: bytes, actorUsuarioId: context.user.id, publicLabel: "Anexo privado de Frota", afterCreate: async (tx, documentId) => {
      const version = requiredFleetRecord(await tx.select({ id: documentVersions.id }).from(documentVersions).where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.versionNumber, 1))).limit(1));
      const item = requiredFleetRecord(await tx.insert(f.fleetAttachments).values({ ...input, documentId, versionId: version.id, pathname: file.blob.pathname, size: bytes.length, mimeType: file.blob.contentType || "application/octet-stream", ownerActorId: context.user.id }).returning()); id = item.id;
    } });
  } catch (error) { if (getPostgresError(error)?.code !== "23505") throw error; const [item] = await db.select().from(f.fleetAttachments).where(and(eq(f.fleetAttachments.pathname, file.blob.pathname), eq(f.fleetAttachments.ownerActorId, context.user.id), eq(f.fleetAttachments.unitId, input.unitId), eq(f.fleetAttachments.ownerType, input.ownerType), eq(f.fleetAttachments.ownerId, input.ownerId))).limit(1); if (!item) throw error; return item; }
  return requiredFleetRecord(await db.select().from(f.fleetAttachments).where(eq(f.fleetAttachments.id, id)).limit(1));
}
export async function downloadFleetAttachment(context: AppContext, id: string) {
  const db = fleetDatabase(context);
  const [item] = await db.select().from(f.fleetAttachments).where(and(eq(f.fleetAttachments.id, id), isNull(f.fleetAttachments.withdrawnAt))).limit(1);
  if (!item) throw new FleetControlError("Anexo indisponível.");
  await authorizeFleetAttachment(context, { ...item, ownerType: parseFleetAttachmentOwner(item.ownerType) });
  const [version] = await db.select(getTableColumns(documentVersions)).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).where(and(eq(documentVersions.id, item.versionId), inArray(documentVersions.status, ["FINAL", "SIGNED"]), inArray(documents.status, ["Válido", "Assinado"]))).limit(1);
  if (!version) throw new FleetControlError("Versão invalidada/retirada.");
  const file = await getFile(version.fileUrl); if (!file?.stream) throw new FleetControlError("Arquivo indisponível.");
  const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== version.hashSha256) throw new FleetControlError("Integridade do anexo inválida.");
  await insertAuditEvent(db, { actorUsuarioId: context.user.id, eventType: auditEventTypes.documentDownload, targetType: "FLEET_ATTACHMENT", targetId: item.id });
  return { item, bytes };
}
export async function withdrawFleetAttachment(context: AppContext, id: string, connection: DatabaseConnection = databaseConnection) {
  const item = requiredFleetRecord(await fleetDatabase(context).select().from(f.fleetAttachments).where(eq(f.fleetAttachments.id, id)).limit(1)); await authorizeFleetAttachment(context, { ...item, ownerType: parseFleetAttachmentOwner(item.ownerType) });
  if (!fleetScope(context).administrator && item.ownerActorId !== context.user.id) throw new FleetControlError("Somente emissor ou administração pode retirar o anexo.");
  await withDatabaseTransaction(connection, async tx => {
    const changed = await tx.update(f.fleetAttachments).set({ withdrawnAt: new Date() }).where(and(eq(f.fleetAttachments.id, id), isNull(f.fleetAttachments.withdrawnAt))).returning({ id: f.fleetAttachments.id });
    if (changed.length) await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "FLEET_ATTACHMENT_WITHDRAWN", targetId: id });
  });
}
export async function fleetAttachmentCallbackContext(actorId: string) {
  const [user] = await db.select({ ...getTableColumns(users), perfil: getTableColumns(accessProfiles), employee: { departmentId: employees.departmentId, secretariatId: employees.secretariatId } }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).leftJoin(employees, eq(employees.id, users.employeeId)).where(and(eq(users.id, actorId), eq(users.ativo, true), eq(accessProfiles.ativo, true))).limit(1);
  if (!user) throw new FleetControlError("Emissor inativo.");
  const permissions = await db.select({ code: modules.codigo, canView: userModulePermissions.canView, canEdit: userModulePermissions.canEdit }).from(userModulePermissions).innerJoin(modules, eq(modules.id, userModulePermissions.moduloId)).where(eq(userModulePermissions.usuarioId, user.id));
  const context: AppContext = { database: db, user: { id: user.id, name: user.nome, email: user.email, firebaseUid: user.firebaseUid || "", role: user.perfil.nome, profileCode: user.perfil.codigo, permissions: user.perfil.permissoes, modulePermissions: permissions, allowedBudgetUnitIds: [], employeeId: user.employeeId, departmentId: user.employee?.departmentId || null, secretariatId: user.employee?.secretariatId || null } };
  if (!canPerformModuleOperation(context.user, "FROTAS", "create")) throw new FleetControlError("Permissão de upload revogada.");
  return context;
}
function parseFleetAttachmentOwner(value: string): FleetAttachmentPayload["ownerType"] {
  const owner = fleetAttachmentOwners.find(entry => entry === value);
  if (!owner) throw new FleetControlError("Finalidade de anexo inválida.");
  return owner;
}
