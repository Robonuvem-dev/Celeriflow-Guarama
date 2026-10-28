import { createHash, randomUUID } from "node:crypto";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { sstExposureGroups, sstProgramGroups, sstPrograms } from "@/db/schema/sst-programs";
import { materials, warehouses, materialStocks } from "@/db/schema/assets-stock";
import { costCenters } from "@/db/schema/master-data";
import { findModuleActivation } from "@/db/repositories/platform/identity";
import { findSstPerson, findSstUnit, countSstSecretariatUnits, listSstDeliveryEmployees, sstParameters } from "@/db/repositories/sst/scope";
import { sstRows, sstTimestamp } from "@/db/repositories/sst/sql";
import { equipmentDto, equipmentItemDto, type EquipmentWire, type EquipmentItemWire } from "@/db/repositories/sst/equipment";
import { sstContextConnection } from "./database";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { applyStockMovement } from "@/lib/patrimonio/stock-service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { deliveryInput, equipmentInput, equipmentEventInput, equipmentDueDate } from "./equipment-policy";
import { SstValidationError } from "./errors";

export type Equipment = { id: string; budgetUnitId: string; materialId: string; kind: string; ca: string; caValidUntil: Date | null; validityDays: number; reviewDays: number; supplierId: string | null; name: string; code: string };
export type EquipmentItem = { id: string; deliveryId: string; employeeId: string; equipmentId: string; quantity: number; writtenOffQuantity: number; expiresAt: Date; nextReviewAt: Date; movementId: string | null; snapshot: { employee: string; registration: string | null; equipment: string; code: string; ca: string; role: string; department: string; costCenter: string; ghe: string[] }; deliveredAt: Date; budgetUnitId: string };
export type EquipmentDelivery = { id: string; budgetUnitId: string; deliveredAt: Date; integratedStock: boolean; location: string; notes: string; biometricStatus: string; createdById: string };
function permission(context: AppContext, operation: "create" | "update" | "issueReports") {
  if (!canPerformModuleOperation(context.user, "SST", operation)) throw new AccessError("Operação SST não autorizada.", 403);
}
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function audit(tx: DatabaseTransaction, context: AppContext, targetId: string) {
  await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_EQUIPMENT", targetId });
}
async function unitForEquipment(tx: DatabaseTransaction, context: AppContext, budgetUnitId: string) {
  assertBudgetUnitAccess(context.user, budgetUnitId);
  const unit = await findSstUnit(tx, budgetUnitId);
  if (!unit) throw new SstValidationError("Unidade gestora não encontrada.");
  // RH has only a secretariat link. Ambiguous UG ownership must fail closed.
  if (await countSstSecretariatUnits(tx, unit.secretariatId) !== 1) throw new SstValidationError("Secretaria com múltiplas UGs: é necessário vínculo funcional explícito para entregar equipamentos.");
  return unit;
}
export async function registerEquipment(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  permission(context, "create");
  const input = equipmentInput.parse(raw); assertBudgetUnitAccess(context.user, input.budgetUnitId);
  const digest = hash(input);
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_EQ:${input.submissionKey}`}))`);
    const existing = await sstRows<{ id: string; requestHash: string }>(tx, sql`SELECT "id","requestHash" FROM "SstEquipment" WHERE "submissionKey"=${input.submissionKey}`);
    if (existing[0]) { if (existing[0].requestHash !== digest) throw new SstValidationError("Submissão reutilizada com outros dados."); return existing[0].id; }
    if (!(await tx.select({ id: materials.id }).from(materials).where(and(eq(materials.id, input.materialId), eq(materials.isActive, true)))).length) throw new SstValidationError("Material inativo ou inexistente.");
    if (input.supplierId && !(await sstRows<{ id: string }>(tx, sql`SELECT id FROM "Supplier" WHERE id=${input.supplierId}`)).length) throw new SstValidationError("Fornecedor não encontrado.");
    const id = randomUUID();
    await tx.execute(sql`INSERT INTO "SstEquipment" ("id","budgetUnitId","materialId","kind","ca","caValidUntil","validityDays","reviewDays","supplierId","createdById","submissionKey","requestHash") VALUES (${id},${input.budgetUnitId},${input.materialId},${input.kind},${input.ca},${input.caValidUntil ? new Date(input.caValidUntil) : null},${input.validityDays},${input.reviewDays},${input.supplierId},${context.user.id},${input.submissionKey},${digest})`);
    await audit(tx, context, id); return id;
  });
}
export async function setEquipmentStockPolicy(context: AppContext, budgetUnitId: string, integrateStock: boolean, connection: DatabaseConnection = sstContextConnection(context)) {
  permission(context, "update"); assertBudgetUnitAccess(context.user, budgetUnitId);
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`INSERT INTO "SstEquipmentPolicy" ("budgetUnitId","integrateStock","updatedById") VALUES (${budgetUnitId},${integrateStock},${context.user.id}) ON CONFLICT ("budgetUnitId") DO UPDATE SET "integrateStock"=EXCLUDED."integrateStock", "updatedById"=EXCLUDED."updatedById", "updatedAt"=CURRENT_TIMESTAMP`);
    await audit(tx, context, budgetUnitId); return budgetUnitId;
  });
}
export async function registerEquipmentDelivery(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  permission(context, "create"); const input = deliveryInput.parse(raw); const digest = hash(input);
  return withDatabaseTransaction(connection, async (tx) => {
    const unit = await unitForEquipment(tx, context, input.budgetUnitId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_EQ:${input.submissionKey}`}))`);
    const existing = await sstRows<{ id: string; requestHash: string }>(tx, sql`SELECT "id","requestHash" FROM "SstEquipmentDelivery" WHERE "submissionKey"=${input.submissionKey} AND "budgetUnitId"=${unit.id}`);
    if (existing[0]) { if (existing[0].requestHash !== digest) throw new SstValidationError("Submissão reutilizada com outros dados."); return existing[0].id; }
    const [equipmentWire] = await sstRows<EquipmentWire>(tx, sql`SELECT e.*, m."name", m."code" FROM "SstEquipment" e JOIN "Material" m ON m."id"=e."materialId" WHERE e."id"=${input.equipmentId} AND e."budgetUnitId"=${unit.id} AND m."isActive"=true`);
    const equipment = equipmentWire ? equipmentDto(equipmentWire) : null;
    if (!equipment) throw new SstValidationError("Equipamento não pertence à UG ou material inativo.");
    if (equipment.caValidUntil && equipment.caValidUntil.toISOString().slice(0,10) < input.deliveredAt.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })) throw new SstValidationError("Certificado de aprovação vencido na entrega.");
    const [policy] = await sstRows<{ integrateStock: boolean }>(tx, sql`SELECT "integrateStock" FROM "SstEquipmentPolicy" WHERE "budgetUnitId"=${unit.id} FOR SHARE`);
    const integrate = policy?.integrateStock ?? false;
    let costCenter = "";
    if (integrate) {
      if (!canPerformModuleOperation(context.user, "PATRIMONIO", "create")) throw new AccessError("Entrega integrada exige PATRIMONIO/create.", 403);
      const moduleConfig = await findModuleActivation(tx, "PATRIMONIO");
      if (moduleConfig && !moduleConfig.ativo) throw new AccessError("Almoxarifado/Patrimônio inativo nesta instância.", 423);
      if (!input.warehouseId) throw new SstValidationError("Selecione o depósito e o lote.");
      const [warehouseRow] = await tx.select({ warehouse: warehouses, costCenter: costCenters }).from(warehouses).leftJoin(costCenters, eq(costCenters.id, warehouses.costCenterId)).where(eq(warehouses.id, input.warehouseId));
      const warehouse = warehouseRow ? { ...warehouseRow.warehouse, costCenter: warehouseRow.costCenter } : null;
      if (!warehouse?.isActive || !warehouse.costCenter?.isActive || warehouse.costCenter.secretariatId !== unit.secretariatId) throw new SstValidationError("Depósito sem centro de custo ativo compatível com a secretaria da UG.");
      costCenter = warehouse.costCenter.name;
      const stocks = await tx.select({ blockedAt: materialStocks.blockedAt, expirationDate: materialStocks.expirationDate }).from(materialStocks).where(and(eq(materialStocks.warehouseId, input.warehouseId), eq(materialStocks.materialId, equipment.materialId), eq(materialStocks.batchNumber, input.batchNumber))).for("update");
      if (!stocks[0] || stocks[0].blockedAt || (stocks[0].expirationDate && stocks[0].expirationDate <= new Date())) throw new SstValidationError("Lote inexistente, bloqueado ou vencido.");
    }
    const employees = await listSstDeliveryEmployees(tx, input.employeeIds, unit.secretariatId);
    if (employees.length !== input.employeeIds.length) throw new SstValidationError("Servidor inativo ou de outra secretaria.");
    const groups = await tx.select().from(sstExposureGroups).where(and(eq(sstExposureGroups.budgetUnitId, unit.id), eq(sstExposureGroups.isActive, true), lte(sstExposureGroups.startsAt, input.deliveredAt), or(isNull(sstExposureGroups.endsAt), gte(sstExposureGroups.endsAt, input.deliveredAt))));
    const id = randomUUID();
    await tx.execute(sql`INSERT INTO "SstEquipmentDelivery" ("id","budgetUnitId","deliveredAt","integratedStock","location","notes","createdById","submissionKey","requestHash") VALUES (${id},${unit.id},${input.deliveredAt},${integrate},${input.location},${input.notes},${context.user.id},${input.submissionKey},${digest})`);
    for (const employee of employees.sort((a,b) => a.id.localeCompare(b.id))) {
      const itemId = randomUUID();
      const movement = integrate ? await applyStockMovement(tx, { kind: "EXIT", warehouseId: input.warehouseId!, materialId: equipment.materialId, batchNumber: input.batchNumber, quantity: input.quantity, departmentId: employee.departmentId, supplierId: equipment.supplierId, reason: `SST entrega ${id}`, idempotencyKey: `SST:${itemId}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } }) : null;
      const snapshot = { employee: employee.name, registration: employee.registration, equipment: equipment.name, code: equipment.code, ca: equipment.ca, role: employee.role?.name || "Sem cargo", department: employee.department?.name || "Sem local", costCenter: costCenter || "Não informado", ghe: groups.filter((g) => (!g.departmentIds?.length || g.departmentIds.includes(employee.departmentId || "")) && (!g.roleIds?.length || g.roleIds.includes(employee.roleId || ""))).map((g) => g.code) };
      await tx.execute(sql`INSERT INTO "SstEquipmentDeliveryItem" ("id","deliveryId","equipmentId","employeeId","quantity","expiresAt","nextReviewAt","movementId","snapshot") VALUES (${itemId},${id},${equipment.id},${employee.id},${input.quantity},${equipmentDueDate(input.deliveredAt,equipment.validityDays)},${equipmentDueDate(input.deliveredAt,equipment.reviewDays)},${movement?.movement.id || null},${JSON.stringify(snapshot)}::jsonb)`);
    }
    await audit(tx, context, id); return id;
  }, { timeoutMs: 30000 });
}
export async function registerEquipmentEvent(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  permission(context, "create"); const input = equipmentEventInput.parse(raw); const digest = hash(input);
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_EQ:${input.submissionKey}`}))`);
    const existing = await sstRows<{ itemId: string; requestHash: string }>(tx, sql`SELECT "itemId","requestHash" FROM "SstEquipmentEvent" WHERE "submissionKey"=${input.submissionKey}`);
    if (existing.length) {
      const scoped = await sstRows<{ budgetUnitId: string }>(tx, sql`SELECT d."budgetUnitId" FROM "SstEquipmentDeliveryItem" i JOIN "SstEquipmentDelivery" d ON d."id"=i."deliveryId" WHERE i."id" IN (${sstParameters(existing.map(e=>e.itemId))})`);
      scoped.forEach(s => assertBudgetUnitAccess(context.user,s.budgetUnitId));
      if (existing.length !== input.itemIds.length || existing.some(e=>e.requestHash!==digest)) throw new SstValidationError("Submissão reutilizada com outros dados."); return input.itemIds[0];
    }
    if (!await findSstPerson(tx, input.responsiblePersonId)) throw new SstValidationError("Responsável não encontrado no Cadastro Único.");
    for (const itemId of [...input.itemIds].sort()) {
      const [itemWire] = await sstRows<EquipmentItemWire>(tx, sql`SELECT i.*, d."budgetUnitId", d."deliveredAt" FROM "SstEquipmentDeliveryItem" i JOIN "SstEquipmentDelivery" d ON d."id"=i."deliveryId" WHERE i."id"=${itemId} FOR UPDATE OF i`);
      const item = itemWire ? equipmentItemDto(itemWire) : null;
      if (!item) throw new SstValidationError("Entrega não encontrada."); assertBudgetUnitAccess(context.user,item.budgetUnitId);
      const [latestWire] = await sstRows<{ occurredAt: string }>(tx, sql`SELECT "occurredAt" FROM "SstEquipmentEvent" WHERE "itemId"=${itemId} ORDER BY "occurredAt" DESC LIMIT 1`);
      const latest = latestWire ? { occurredAt: sstTimestamp(latestWire.occurredAt) } : null;
      if (input.occurredAt < item.deliveredAt || (latest && input.occurredAt < latest.occurredAt)) throw new SstValidationError("Data anterior à entrega ou ao último evento.");
      if (item.writtenOffQuantity >= item.quantity || (input.kind === "WRITE_OFF" && input.quantity > item.quantity-item.writtenOffQuantity)) throw new SstValidationError("Quantidade excede o saldo em uso.");
      if (input.kind === "WRITE_OFF") await tx.execute(sql`UPDATE "SstEquipmentDeliveryItem" SET "writtenOffQuantity"="writtenOffQuantity"+${input.quantity} WHERE "id"=${itemId}`);
      else await tx.execute(sql`UPDATE "SstEquipmentDeliveryItem" SET "nextReviewAt"=${input.nextReviewAt} WHERE "id"=${itemId}`);
      await tx.execute(sql`INSERT INTO "SstEquipmentEvent" ("id","itemId","kind","quantity","occurredAt","nextReviewAt","responsiblePersonId","notes","createdById","submissionKey","requestHash") VALUES (${randomUUID()},${itemId},${input.kind},${input.kind==="WRITE_OFF" ? input.quantity : 0},${input.occurredAt},${input.kind==="REVIEW" ? input.nextReviewAt : null},${input.responsiblePersonId},${input.notes},${context.user.id},${input.submissionKey},${digest})`);
      await audit(tx,context,itemId);
    }
    return input.itemIds[0];
  });
}
export async function mapEquipmentRequirement(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  permission(context,"create"); const input = z.object({ programGroupId:z.string().min(1), recommendation:z.string().min(1).max(200), equipmentId:z.string().min(1), quantity:z.coerce.number().positive().max(100000) }).parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const [groupRow] = await tx.select({ group: sstProgramGroups, program: sstPrograms }).from(sstProgramGroups).innerJoin(sstPrograms, eq(sstPrograms.id, sstProgramGroups.programId)).where(eq(sstProgramGroups.id, input.programGroupId));
    if (!groupRow) throw new SstValidationError("Grupo não encontrado.");
    const group = { ...groupRow.group, program: groupRow.program };
    assertBudgetUnitAccess(context.user,group.program.budgetUnitId);
    const recommendations = z.array(z.object({epiApplicable:z.boolean(),epis:z.array(z.string())})).parse(group.risks).filter(r=>r.epiApplicable).flatMap(r=>r.epis);
    if (group.program.kind!=="PGR" || !recommendations.includes(input.recommendation)) throw new SstValidationError("Recomendação não pertence a este PGR.");
    const equipment = await sstRows<{ id: string }>(tx, sql`SELECT id FROM "SstEquipment" WHERE "id"=${input.equipmentId} AND "budgetUnitId"=${group.program.budgetUnitId}`);
    if (!equipment[0]) throw new SstValidationError("Equipamento de outra UG.");
    const id=randomUUID();
    await tx.execute(sql`INSERT INTO "SstEquipmentRequirement" ("id","programGroupId","recommendation","equipmentId","quantity","createdById") VALUES (${id},${input.programGroupId},${input.recommendation},${input.equipmentId},${input.quantity},${context.user.id}) ON CONFLICT ("programGroupId","recommendation") DO NOTHING`);
    const [saved] = await sstRows<{id:string;equipmentId:string;quantity:number}>(tx, sql`SELECT "id","equipmentId","quantity" FROM "SstEquipmentRequirement" WHERE "programGroupId"=${input.programGroupId} AND "recommendation"=${input.recommendation}`);
    if(saved.equipmentId!==input.equipmentId || saved.quantity!==input.quantity) throw new SstValidationError("Recomendação já vinculada; preserve a versão e registre correção no novo PGR.");
    await audit(tx,context,saved.id); return saved.id;
  });
}
