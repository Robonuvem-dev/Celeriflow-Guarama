import { and, eq, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { assets, assetMaintenances, assetTransfers } from "@/db/schema/assets";
import { departments, employees } from "@/db/schema/administration";
import { z } from "zod";
import type { PermissionUser } from "@/lib/contracts/identity";
import { AccessError, canPerformModuleOperation, canViewModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { dateOnly, dateSchema, moneySchema, todayInBrazil } from "@/lib/frotas/contract";

export class AssetOperationError extends Error {}
const id = z.string().trim().min(1).max(100);
const note = z.string().trim().min(1).max(10000);
export const assetOperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("transfer"), assetId: id, version: z.iso.datetime(), departmentId: id, responsibleId: z.string().max(100).default(""), reason: note }).strict(),
  z.object({ kind: z.literal("startMaintenance"), assetId: id, version: z.iso.datetime(), description: note, startDate: dateSchema }).strict(),
  z.object({ kind: z.literal("completeMaintenance"), maintenanceId: id, endDate: dateSchema, description: note, cost: z.union([moneySchema, z.literal("")]) }).strict(),
]);
export type AssetOperationInput = z.input<typeof assetOperationSchema>;
type AssetOperationContext = { user: PermissionUser };

export function assetOperationWhere(context: AssetOperationContext): { departmentId?: string } {
  if (!canViewModule(context.user, "PATRIMONIO")) throw new AccessError("Seu perfil não permite acessar Patrimônio.", 403);
  if (isSystemAdministrator(context.user)) return {};
  if (!context.user.departmentId) throw new AccessError("Vincule o usuário a um setor para operar os bens patrimoniais.", 403);
  return { departmentId: context.user.departmentId };
}

export async function operateAsset(context: AssetOperationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = assetOperationSchema.parse(raw), scope = assetOperationWhere(context);
  if (!canPerformModuleOperation(context.user, "PATRIMONIO", "update")) throw new AccessError("Seu perfil não permite editar o bem patrimonial.", 403);
  return withDatabaseTransaction(connection, async tx => {
    if (input.kind === "completeMaintenance") {
      const [loaded] = await tx.select({ maintenance: assetMaintenances, assetStatus: assets.status }).from(assetMaintenances).innerJoin(assets, eq(assets.id, assetMaintenances.assetId)).where(and(eq(assetMaintenances.id, input.maintenanceId), scope.departmentId ? eq(assets.departmentId, scope.departmentId) : undefined)).limit(1);
      if (!loaded) throw new AssetOperationError("Manutenção não encontrada ou fora do seu setor.");
      const m = loaded.maintenance;
      const endDate = dateOnly(input.endDate), cost = input.cost === "" ? null : new Decimal(input.cost).toNumber();
      if (m.status === "Concluída") {
        if (m.endDate?.valueOf() === endDate.valueOf() && m.description === input.description && m.cost === cost) return { assetId: m.assetId };
        throw new AssetOperationError("A manutenção já foi concluída com outros dados.");
      }
      if (loaded.assetStatus === "Baixado" || loaded.assetStatus === "Inativo") throw new AssetOperationError("O bem está baixado ou inativo.");
      if (endDate > dateOnly(todayInBrazil()) || endDate < dateOnly(m.startDate.toISOString().slice(0, 10))) throw new AssetOperationError("A conclusão deve ocorrer entre o início e a data atual.");
      const updated = await tx.update(assetMaintenances).set({ status: "Concluída", endDate, cost, description: input.description }).where(and(eq(assetMaintenances.id, m.id), eq(assetMaintenances.updatedAt, m.updatedAt))).returning({ id: assetMaintenances.id });
      if (!updated.length) throw new AssetOperationError("A manutenção foi alterada por outra sessão. Reabra a ficha.");
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ASSET_MAINTENANCE", targetId: m.id });
      return { assetId: m.assetId };
    }
    const [asset] = await tx.select().from(assets).where(and(eq(assets.id, input.assetId), scope.departmentId ? eq(assets.departmentId, scope.departmentId) : undefined)).limit(1);
    if (!asset || asset.status === "Baixado" || asset.status === "Inativo") throw new AssetOperationError("Bem não encontrado, baixado, inativo ou fora do seu setor.");
    if (asset.updatedAt.toISOString() !== input.version) throw new AssetOperationError("O bem foi alterado por outra sessão. Reabra a ficha.");
    if (input.kind === "transfer") {
      const [department] = await tx.select().from(departments).where(and(eq(departments.id, input.departmentId), eq(departments.isActive, true))).limit(1);
      if (!department) throw new AssetOperationError("Selecione um setor ativo.");
      if (asset.budgetUnitId) {
        const unit = (await tx.execute<{ secretariatId: string | null }>(sql`SELECT "secretariatId" FROM "BudgetUnit" WHERE id=${asset.budgetUnitId}`)).rows[0];
        if (!unit || department.secretariatId !== unit.secretariatId) throw new AssetOperationError("Transferência para outra UG exige conciliação contábil da origem antes da mudança de lotação.");
      }
      if (input.responsibleId && !(await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, input.responsibleId), eq(employees.departmentId, input.departmentId), eq(employees.isActive, true))).limit(1)).length) throw new AssetOperationError("O responsável deve ser servidor ativo do setor de destino.");
      const responsibleId = input.responsibleId || null;
      if (asset.departmentId === input.departmentId && asset.responsibleId === responsibleId) throw new AssetOperationError("Informe um setor ou responsável diferente do atual.");
      await tx.insert(assetTransfers).values({ assetId: asset.id, reason: input.reason, fromDepartmentId: asset.departmentId, toDepartmentId: input.departmentId, fromResponsibleId: asset.responsibleId, toResponsibleId: responsibleId, status: "Aprovada" });
      const updated = await tx.update(assets).set({ departmentId: input.departmentId, responsibleId }).where(and(eq(assets.id, asset.id), eq(assets.updatedAt, asset.updatedAt))).returning({ id: assets.id });
      if (!updated.length) throw new AssetOperationError("O bem foi alterado por outra sessão. Reabra a ficha.");
    } else {
      const startDate = dateOnly(input.startDate);
      if (startDate > dateOnly(todayInBrazil()) || startDate < dateOnly(asset.acquisitionDate.toISOString().slice(0, 10))) throw new AssetOperationError("O início deve ocorrer entre a aquisição e a data atual.");
      // Advance the version even when another maintenance already keeps the asset unavailable.
      // A retry of the same form cannot create another maintenance after a lost response.
      const updated = await tx.update(assets).set({ updatedAt: new Date(Math.max(Date.now(), asset.updatedAt.valueOf() + 1)) }).where(and(eq(assets.id, asset.id), eq(assets.updatedAt, asset.updatedAt))).returning({ id: assets.id });
      if (!updated.length) throw new AssetOperationError("O bem foi alterado por outra sessão. Reabra a ficha.");
      await tx.insert(assetMaintenances).values({ assetId: asset.id, description: input.description, status: "Em manutenção", startDate });
    }
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ASSET", targetId: asset.id });
    return { assetId: asset.id };
  }, { isolationLevel: "serializable" });
}
