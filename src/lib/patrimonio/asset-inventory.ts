import { and, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { assets, assetTransfers } from "@/db/schema/assets";
import { assetCatalogRecords as records } from "@/db/schema/assets-catalogs";
import { departments, employees } from "@/db/schema/administration";
import type { PermissionUser } from "@/lib/contracts/identity";
import { canPerformModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { z } from "zod";

const inputSchema = z.object({
  operation: z.enum(["open", "count", "conform", "transfer", "close"]),
  sessionId: z.string().max(100).default(""), departmentId: z.string().max(100).default(""),
  patrimonyNumber: z.string().trim().max(80).default(""), foundDepartmentId: z.string().max(100).default(""),
  responsibleId: z.string().max(100).default(""), reason: z.string().trim().min(5).max(2000),
});

/** Operational records share the existing catalog storage; stock inventories stay independent. */
export async function operateAssetInventory(connection: DatabaseConnection, user: PermissionUser, raw: unknown) {
  const input = inputSchema.parse(raw);
  if (!canPerformModuleOperation(user, "PATRIMONIO", "update")) throw new Error("Seu perfil não permite operar inventários patrimoniais.");
  return withDatabaseTransaction(connection, async tx => {
    const audit = async (id: string) => insertAuditEvent(tx, { actorUsuarioId: user.id, eventType: "ADMINISTRATIVE_MUTATION", targetType: "AssetInventory", targetId: id });
    if (input.operation === "open") {
      if (!isSystemAdministrator(user) && user.departmentId !== input.departmentId) throw new Error("Setor fora do seu escopo.");
      const [department] = await tx.select().from(departments).where(and(eq(departments.id, input.departmentId), eq(departments.isActive, true))).limit(1);
      if (!department) throw new Error("Selecione um setor ativo.");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ASSET_INVENTORY:${department.id}`},0))::text`);
      if ((await tx.select({ id: records.id }).from(records).where(and(eq(records.kind, "inventarioBens"), eq(records.departmentId, department.id), eq(records.active, true))).limit(1)).length) throw new Error("O setor já possui inventário aberto.");
      const [session] = await tx.insert(records).values({ kind: "inventarioBens", code: crypto.randomUUID(), name: input.reason, year: new Date().getFullYear(), departmentId: department.id, createdBy: user.id, details: { status: "Aberto", departmentId: department.id } }).returning();
      const items = await tx.select().from(assets).where(and(eq(assets.departmentId, department.id), sql`${assets.status} NOT IN ('Baixado','Inativo')`));
      for (const asset of items) await tx.insert(records).values({ kind: "inventarioBem", code: `${session.id}:${asset.id}`, name: asset.name, year: session.year, departmentId: department.id, createdBy: user.id, details: { sessionId: session.id, assetId: asset.id, patrimonyNumber: asset.patrimonyNumber, expectedDepartmentId: department.id, foundDepartmentId: "", responsibleId: asset.responsibleId || "", conformity: "" } });
      await audit(session.id);
      return session.id;
    }
    await tx.execute(sql`SELECT id FROM "AssetCatalogRecord" WHERE id=${input.sessionId} FOR UPDATE`);
    const [session] = await tx.select().from(records).where(and(eq(records.id, input.sessionId), eq(records.kind, "inventarioBens"), eq(records.active, true))).limit(1);
    if (!session || !isSystemAdministrator(user) && user.departmentId !== session.departmentId) throw new Error("Inventário não encontrado, fechado ou fora do seu setor.");
    const commission = isSystemAdministrator(user) || !!(user.employeeId && (await tx.select({ id: records.id }).from(records).where(and(eq(records.kind, "comissao"), eq(records.departmentId, session.departmentId), eq(records.active, true), sql`${records.details}->>'employeeId'=${user.employeeId}`)).limit(1)).length);
    if (input.operation === "close") {
      if (!commission) throw new Error("O fechamento exige membro da comissão patrimonial.");
      if ((await tx.select({ id: records.id }).from(records).where(and(eq(records.kind, "inventarioBem"), sql`${records.details}->>'sessionId'=${session.id}`, sql`coalesce(${records.details}->>'conformity','')=''`)).limit(1)).length) throw new Error("Registre a conformidade de todos os bens antes de fechar.");
      await tx.update(records).set({ active: false, details: { ...session.details, status: "Fechado", closedAt: new Date().toISOString(), closedBy: user.id, reason: input.reason } }).where(eq(records.id, session.id));
    } else {
      const [asset] = await tx.select().from(assets).where(eq(assets.patrimonyNumber, input.patrimonyNumber)).limit(1);
      if (!asset || ["Baixado", "Inativo"].includes(asset.status)) throw new Error("Placa não encontrada ou bem indisponível.");
      let [item] = await tx.select().from(records).where(and(eq(records.kind, "inventarioBem"), eq(records.code, `${session.id}:${asset.id}`), eq(records.departmentId, session.departmentId), eq(records.year, session.year))).limit(1);
      if (input.operation === "count") {
        if (!commission) throw new Error("A contagem exige membro da comissão patrimonial.");
        const [found] = await tx.select().from(departments).where(and(eq(departments.id, input.foundDepartmentId), eq(departments.isActive, true))).limit(1);
        if (!found || found.id !== session.departmentId) throw new Error("Informe o setor deste inventário como local da localização física.");
        const details = { ...(item?.details || {}), sessionId: session.id, assetId: asset.id, patrimonyNumber: asset.patrimonyNumber, expectedDepartmentId: item?.details.expectedDepartmentId || asset.departmentId || "", foundDepartmentId: found.id, responsibleId: asset.responsibleId || "", conformity: "", countEvidence: input.reason, countedBy: user.id };
        if (item) await tx.update(records).set({ details }).where(eq(records.id, item.id));
        else [item] = await tx.insert(records).values({ kind: "inventarioBem", code: `${session.id}:${asset.id}`, name: asset.name, year: session.year, departmentId: session.departmentId, createdBy: user.id, details }).returning();
      } else {
        if (!item?.details.foundDepartmentId) throw new Error("Registre a localização física antes desta operação.");
        if (input.operation === "conform") {
          if (!user.employeeId || user.employeeId !== asset.responsibleId) throw new Error("A conformidade deve ser registrada pelo responsável atual do bem.");
          await tx.update(records).set({ details: { ...item.details, conformity: user.id, conformityAt: new Date().toISOString(), conformityEvidence: input.reason } }).where(eq(records.id, item.id));
        } else {
          if (!commission) throw new Error("A transferência durante o inventário exige membro da comissão.");
          if (asset.departmentId === session.departmentId) throw new Error("O bem já pertence ao setor do inventário.");
          if (asset.budgetUnitId && !(await tx.execute(sql`SELECT 1 FROM "BudgetUnit" u JOIN "Department" d ON d."secretariatId"=u."secretariatId" WHERE u.id=${asset.budgetUnitId} AND d.id=${session.departmentId}`)).rows.length) throw new Error("Transferência entre UGs exige conciliação contábil prévia.");
          if (input.responsibleId && !(await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, input.responsibleId), eq(employees.departmentId, session.departmentId), eq(employees.isActive, true))).limit(1)).length) throw new Error("Responsável deve ser servidor ativo do destino.");
          await tx.execute(sql`SELECT set_config('celeriflow.asset_inventory_commission',${session.id},true)`);
          await tx.insert(assetTransfers).values({ assetId: asset.id, fromDepartmentId: asset.departmentId, toDepartmentId: session.departmentId, fromResponsibleId: asset.responsibleId, toResponsibleId: input.responsibleId || null, reason: input.reason });
          await tx.update(assets).set({ departmentId: session.departmentId, responsibleId: input.responsibleId || null }).where(eq(assets.id, asset.id));
          await tx.update(records).set({ details: { ...item.details, transferredBy: user.id, transferredAt: new Date().toISOString(), responsibleId: input.responsibleId, conformity: "" } }).where(eq(records.id, item.id));
        }
      }
    }
    await audit(session.id);
    return session.id;
  }, { isolationLevel: "serializable" });
}
