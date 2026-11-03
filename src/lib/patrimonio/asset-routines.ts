import { and, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { assets, assetMaintenances, assetWriteOffs } from "@/db/schema/assets";
import { assetCatalogRecords as records } from "@/db/schema/assets-catalogs";
import type { PermissionUser } from "@/lib/contracts/identity";
import { canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { assetOperationWhere } from "./asset-operations";
import { z } from "zod";

const schema = z.object({ operation: z.enum(["loan", "return", "exclude", "requestWriteOff"]), patrimonyNumber: z.string().trim().min(1).max(80), recipient: z.string().trim().max(250).default(""), expectedReturn: z.string().default(""), reason: z.string().trim().min(5).max(2000) });
export async function operateAssetRoutine(connection: DatabaseConnection, user: PermissionUser, raw: unknown) {
  const input = schema.parse(raw), scope = assetOperationWhere({ user });
  if (!canPerformModuleOperation(user, "PATRIMONIO", input.operation === "exclude" ? "delete" : "update")) throw new Error("Seu perfil não permite esta operação.");
  return withDatabaseTransaction(connection, async tx => {
    const [loaded] = await tx.select().from(assets).where(and(eq(assets.patrimonyNumber, input.patrimonyNumber), scope.departmentId ? eq(assets.departmentId, scope.departmentId) : undefined)).limit(1);
    if (!loaded) throw new Error("Placa não encontrada no seu setor.");
    await tx.execute(sql`SELECT id FROM "Asset" WHERE id=${loaded.id} FOR UPDATE`);
    const [asset] = await tx.select().from(assets).where(eq(assets.id, loaded.id)).limit(1);
    if (["Baixado", "Inativo"].includes(asset.status)) throw new Error("Bem baixado ou inativo.");
    const [loan] = await tx.select().from(records).where(and(eq(records.kind, "emprestimos"), eq(records.active, true), sql`${records.details}->>'assetId'=${asset.id}`)).limit(1);
    if (input.operation === "requestWriteOff") {
      if (loan) throw new Error("Registre a devolução antes de solicitar baixa.");
      if ((await tx.select({ id: assetWriteOffs.id }).from(assetWriteOffs).where(and(eq(assetWriteOffs.assetId, asset.id), sql`${assetWriteOffs.status}<>'Estornada'`)).limit(1)).length) throw new Error("Já existe uma solicitação ou baixa para o bem.");
      await tx.insert(assetWriteOffs).values({ assetId: asset.id, status: "Solicitada", type: "Baixa", reason: input.reason, justification: input.reason, bookValue: Number(asset.currentValueDecimal ?? asset.currentValue), disposalValue: 0, gainLoss: -Number(asset.currentValueDecimal ?? asset.currentValue) });
    } else if (input.operation === "loan") {
      if (loan || asset.status === "Emprestado") throw new Error("Bem já possui empréstimo aberto.");
      if (!input.recipient || !/^\d{4}-\d{2}-\d{2}$/.test(input.expectedReturn) || Number.isNaN(Date.parse(input.expectedReturn)) || new Date(input.expectedReturn).toISOString().slice(0, 10) !== input.expectedReturn || input.expectedReturn < new Date().toISOString().slice(0, 10)) throw new Error("Informe destinatário e previsão de devolução válida, a partir de hoje.");
      if ((await tx.select({ id: assetMaintenances.id }).from(assetMaintenances).where(and(eq(assetMaintenances.assetId, asset.id), sql`${assetMaintenances.status} IN ('Solicitada','Em manutenção')`)).limit(1)).length) throw new Error("Conclua a manutenção antes de emprestar o bem.");
      await tx.insert(records).values({ kind: "emprestimos", code: crypto.randomUUID(), name: asset.name, year: new Date().getFullYear(), departmentId: asset.departmentId || "", createdBy: user.id, details: { assetId: asset.id, patrimonyNumber: asset.patrimonyNumber, recipient: input.recipient, expectedReturn: input.expectedReturn, status: "Emprestado", previousStatus: asset.status, startedAt: new Date().toISOString(), reason: input.reason } });
      await tx.update(assets).set({ status: "Emprestado" }).where(eq(assets.id, asset.id));
    } else if (input.operation === "return") {
      if (!loan || asset.status !== "Emprestado") throw new Error("Não há empréstimo aberto para esta placa.");
      await tx.update(records).set({ active: false, details: { ...loan.details, status: "Devolvido", returnedAt: new Date().toISOString(), returnedBy: user.id, returnEvidence: input.reason } }).where(eq(records.id, loan.id));
      await tx.update(assets).set({ status: loan.details.previousStatus || "Ativo" }).where(eq(assets.id, asset.id));
    } else {
      if (loan) throw new Error("Registre a devolução antes de excluir o bem.");
      if ((await tx.select({ id: assetMaintenances.id }).from(assetMaintenances).where(and(eq(assetMaintenances.assetId, asset.id), sql`${assetMaintenances.status} IN ('Solicitada','Em manutenção')`)).limit(1)).length) throw new Error("Conclua as manutenções antes de excluir.");
      await tx.update(assets).set({ status: "Inativo" }).where(eq(assets.id, asset.id));
      await tx.insert(records).values({ kind: "exclusoesBens", code: crypto.randomUUID(), name: asset.name, year: new Date().getFullYear(), departmentId: asset.departmentId || "", createdBy: user.id, details: { assetId: asset.id, patrimonyNumber: asset.patrimonyNumber, reason: input.reason, previousStatus: asset.status } });
    }
    await insertAuditEvent(tx, { actorUsuarioId: user.id, eventType: "ADMINISTRATIVE_MUTATION", targetType: "AssetRoutine", targetId: asset.id });
  });
}
