import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { applyStockMovement } from "@/lib/patrimonio/stock-service";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { deliveryInput, equipmentInput, equipmentEventInput, equipmentDueDate } from "./equipment-policy";
import { SstValidationError } from "./errors";

export type Equipment = { id: string; budgetUnitId: string; materialId: string; kind: string; ca: string; caValidUntil: Date | null; validityDays: number; reviewDays: number; supplierId: string | null; name: string; code: string };
export type EquipmentItem = { id: string; deliveryId: string; employeeId: string; equipmentId: string; quantity: number; writtenOffQuantity: number; expiresAt: Date; nextReviewAt: Date; movementId: string | null; snapshot: { employee: string; registration: string | null; equipment: string; code: string; ca: string; role: string; department: string; costCenter: string; ghe: string[] }; deliveredAt: Date; budgetUnitId: string };
export type EquipmentDelivery = { id: string; budgetUnitId: string; deliveredAt: Date; integratedStock: boolean; location: string; notes: string; biometricStatus: string; createdById: string };
function permission(context: AppContext, operation: "create" | "update" | "issueReports") {
  if (!canPerformModuleOperation(context.user, "SST", operation)) throw new AccessError("Operação SST não autorizada.", 403);
}
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function audit(tx: Prisma.TransactionClient, context: AppContext, targetId: string) {
  await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_EQUIPMENT", targetId });
}
async function unitForEquipment(tx: Prisma.TransactionClient, context: AppContext, budgetUnitId: string) {
  assertBudgetUnitAccess(context.user, budgetUnitId);
  const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: budgetUnitId } });
  // RH has only a secretariat link. Ambiguous UG ownership must fail closed.
  if (await tx.budgetUnit.count({ where: { secretariatId: unit.secretariatId } }) !== 1) throw new SstValidationError("Secretaria com múltiplas UGs: é necessário vínculo funcional explícito para entregar equipamentos.");
  return unit;
}
export async function registerEquipment(context: AppContext, raw: unknown) {
  permission(context, "create");
  const input = equipmentInput.parse(raw); assertBudgetUnitAccess(context.user, input.budgetUnitId);
  const digest = hash(input);
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_EQ:${input.submissionKey}`}))`;
    const existing = await tx.$queryRaw<{ id: string; requestHash: string }[]>`SELECT "id","requestHash" FROM "SstEquipment" WHERE "submissionKey"=${input.submissionKey}`;
    if (existing[0]) { if (existing[0].requestHash !== digest) throw new SstValidationError("Submissão reutilizada com outros dados."); return existing[0].id; }
    if (!await tx.material.findFirst({ where: { id: input.materialId, isActive: true } })) throw new SstValidationError("Material inativo ou inexistente.");
    if (input.supplierId && !await tx.supplier.findUnique({ where: { id: input.supplierId } })) throw new SstValidationError("Fornecedor não encontrado.");
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO "SstEquipment" ("id","budgetUnitId","materialId","kind","ca","caValidUntil","validityDays","reviewDays","supplierId","createdById","submissionKey","requestHash") VALUES (${id},${input.budgetUnitId},${input.materialId},${input.kind},${input.ca},${input.caValidUntil ? new Date(input.caValidUntil) : null},${input.validityDays},${input.reviewDays},${input.supplierId},${context.user.id},${input.submissionKey},${digest})`;
    await audit(tx, context, id); return id;
  });
}
export async function setEquipmentStockPolicy(context: AppContext, budgetUnitId: string, integrateStock: boolean) {
  permission(context, "update"); assertBudgetUnitAccess(context.user, budgetUnitId);
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO "SstEquipmentPolicy" ("budgetUnitId","integrateStock","updatedById") VALUES (${budgetUnitId},${integrateStock},${context.user.id}) ON CONFLICT ("budgetUnitId") DO UPDATE SET "integrateStock"=EXCLUDED."integrateStock", "updatedById"=EXCLUDED."updatedById", "updatedAt"=CURRENT_TIMESTAMP`;
    await audit(tx, context, budgetUnitId); return budgetUnitId;
  });
}
export async function registerEquipmentDelivery(context: AppContext, raw: unknown) {
  permission(context, "create"); const input = deliveryInput.parse(raw); const digest = hash(input);
  return context.prisma.$transaction(async (tx) => {
    const unit = await unitForEquipment(tx, context, input.budgetUnitId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_EQ:${input.submissionKey}`}))`;
    const existing = await tx.$queryRaw<{ id: string; requestHash: string }[]>`SELECT "id","requestHash" FROM "SstEquipmentDelivery" WHERE "submissionKey"=${input.submissionKey} AND "budgetUnitId"=${unit.id}`;
    if (existing[0]) { if (existing[0].requestHash !== digest) throw new SstValidationError("Submissão reutilizada com outros dados."); return existing[0].id; }
    const [equipment] = await tx.$queryRaw<Equipment[]>`SELECT e.*, m."name", m."code" FROM "SstEquipment" e JOIN "Material" m ON m."id"=e."materialId" WHERE e."id"=${input.equipmentId} AND e."budgetUnitId"=${unit.id} AND m."isActive"=true`;
    if (!equipment) throw new SstValidationError("Equipamento não pertence à UG ou material inativo.");
    if (equipment.caValidUntil && equipment.caValidUntil.toISOString().slice(0,10) < input.deliveredAt.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })) throw new SstValidationError("Certificado de aprovação vencido na entrega.");
    const [policy] = await tx.$queryRaw<{ integrateStock: boolean }[]>`SELECT "integrateStock" FROM "SstEquipmentPolicy" WHERE "budgetUnitId"=${unit.id} FOR SHARE`;
    const integrate = policy?.integrateStock ?? false;
    let costCenter = "";
    if (integrate) {
      if (!canPerformModuleOperation(context.user, "PATRIMONIO", "create")) throw new AccessError("Entrega integrada exige PATRIMONIO/create.", 403);
      const moduleConfig = await tx.configuracaoModulo.findUnique({ where: { codigo: "PATRIMONIO" }, select: { ativo: true } });
      if (moduleConfig && !moduleConfig.ativo) throw new AccessError("Almoxarifado/Patrimônio inativo nesta instância.", 423);
      if (!input.warehouseId) throw new SstValidationError("Selecione o depósito e o lote.");
      const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId }, include: { costCenter: true } });
      if (!warehouse?.isActive || !warehouse.costCenter?.isActive || warehouse.costCenter.secretariatId !== unit.secretariatId) throw new SstValidationError("Depósito sem centro de custo ativo compatível com a secretaria da UG.");
      costCenter = warehouse.costCenter.name;
      const stocks = await tx.$queryRaw<{ blockedAt: Date | null; expirationDate: Date | null }[]>`SELECT "blockedAt","expirationDate" FROM "MaterialStock" WHERE "warehouseId"=${input.warehouseId} AND "materialId"=${equipment.materialId} AND "batchNumber"=${input.batchNumber} FOR UPDATE`;
      if (!stocks[0] || stocks[0].blockedAt || (stocks[0].expirationDate && stocks[0].expirationDate <= new Date())) throw new SstValidationError("Lote inexistente, bloqueado ou vencido.");
    }
    const employees = await tx.employee.findMany({ where: { id: { in: input.employeeIds }, isActive: true, secretariatId: unit.secretariatId }, include: { role: true, department: true } });
    if (employees.length !== input.employeeIds.length) throw new SstValidationError("Servidor inativo ou de outra secretaria.");
    const groups = await tx.sstExposureGroup.findMany({ where: { budgetUnitId: unit.id, isActive: true, startsAt: { lte: input.deliveredAt }, OR: [{ endsAt: null }, { endsAt: { gte: input.deliveredAt } }] } });
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO "SstEquipmentDelivery" ("id","budgetUnitId","deliveredAt","integratedStock","location","notes","createdById","submissionKey","requestHash") VALUES (${id},${unit.id},${input.deliveredAt},${integrate},${input.location},${input.notes},${context.user.id},${input.submissionKey},${digest})`;
    for (const employee of employees.sort((a,b) => a.id.localeCompare(b.id))) {
      const itemId = randomUUID();
      const movement = integrate ? await applyStockMovement(tx, { kind: "EXIT", warehouseId: input.warehouseId!, materialId: equipment.materialId, batchNumber: input.batchNumber, quantity: input.quantity, departmentId: employee.departmentId, supplierId: equipment.supplierId, reason: `SST entrega ${id}`, idempotencyKey: `SST:${itemId}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } }) : null;
      const snapshot = { employee: employee.name, registration: employee.registration, equipment: equipment.name, code: equipment.code, ca: equipment.ca, role: employee.role?.name || "Sem cargo", department: employee.department?.name || "Sem local", costCenter: costCenter || "Não informado", ghe: groups.filter((g) => (!g.departmentIds.length || g.departmentIds.includes(employee.departmentId || "")) && (!g.roleIds.length || g.roleIds.includes(employee.roleId || ""))).map((g) => g.code) };
      await tx.$executeRaw`INSERT INTO "SstEquipmentDeliveryItem" ("id","deliveryId","equipmentId","employeeId","quantity","expiresAt","nextReviewAt","movementId","snapshot") VALUES (${itemId},${id},${equipment.id},${employee.id},${input.quantity},${equipmentDueDate(input.deliveredAt,equipment.validityDays)},${equipmentDueDate(input.deliveredAt,equipment.reviewDays)},${movement?.movement.id || null},${JSON.stringify(snapshot)}::jsonb)`;
    }
    await audit(tx, context, id); return id;
  }, { timeout: 30000 });
}
export async function registerEquipmentEvent(context: AppContext, raw: unknown) {
  permission(context, "create"); const input = equipmentEventInput.parse(raw); const digest = hash(input);
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_EQ:${input.submissionKey}`}))`;
    const existing = await tx.$queryRaw<{ itemId: string; requestHash: string }[]>`SELECT "itemId","requestHash" FROM "SstEquipmentEvent" WHERE "submissionKey"=${input.submissionKey}`;
    if (existing.length) {
      const scoped = await tx.$queryRaw<{ budgetUnitId: string }[]>`SELECT d."budgetUnitId" FROM "SstEquipmentDeliveryItem" i JOIN "SstEquipmentDelivery" d ON d."id"=i."deliveryId" WHERE i."id" IN (${Prisma.join(existing.map(e=>e.itemId))})`;
      scoped.forEach(s => assertBudgetUnitAccess(context.user,s.budgetUnitId));
      if (existing.length !== input.itemIds.length || existing.some(e=>e.requestHash!==digest)) throw new SstValidationError("Submissão reutilizada com outros dados."); return input.itemIds[0];
    }
    if (!await tx.person.findUnique({ where: { id: input.responsiblePersonId } })) throw new SstValidationError("Responsável não encontrado no Cadastro Único.");
    for (const itemId of [...input.itemIds].sort()) {
      const [item] = await tx.$queryRaw<EquipmentItem[]>`SELECT i.*, d."budgetUnitId", d."deliveredAt" FROM "SstEquipmentDeliveryItem" i JOIN "SstEquipmentDelivery" d ON d."id"=i."deliveryId" WHERE i."id"=${itemId} FOR UPDATE OF i`;
      if (!item) throw new SstValidationError("Entrega não encontrada."); assertBudgetUnitAccess(context.user,item.budgetUnitId);
      const [latest] = await tx.$queryRaw<{ occurredAt: Date }[]>`SELECT "occurredAt" FROM "SstEquipmentEvent" WHERE "itemId"=${itemId} ORDER BY "occurredAt" DESC LIMIT 1`;
      if (input.occurredAt < item.deliveredAt || (latest && input.occurredAt < latest.occurredAt)) throw new SstValidationError("Data anterior à entrega ou ao último evento.");
      if (item.writtenOffQuantity >= item.quantity || (input.kind === "WRITE_OFF" && input.quantity > item.quantity-item.writtenOffQuantity)) throw new SstValidationError("Quantidade excede o saldo em uso.");
      if (input.kind === "WRITE_OFF") await tx.$executeRaw`UPDATE "SstEquipmentDeliveryItem" SET "writtenOffQuantity"="writtenOffQuantity"+${input.quantity} WHERE "id"=${itemId}`;
      else await tx.$executeRaw`UPDATE "SstEquipmentDeliveryItem" SET "nextReviewAt"=${input.nextReviewAt} WHERE "id"=${itemId}`;
      await tx.$executeRaw`INSERT INTO "SstEquipmentEvent" ("id","itemId","kind","quantity","occurredAt","nextReviewAt","responsiblePersonId","notes","createdById","submissionKey","requestHash") VALUES (${randomUUID()},${itemId},${input.kind},${input.kind==="WRITE_OFF" ? input.quantity : 0},${input.occurredAt},${input.kind==="REVIEW" ? input.nextReviewAt : null},${input.responsiblePersonId},${input.notes},${context.user.id},${input.submissionKey},${digest})`;
      await audit(tx,context,itemId);
    }
    return input.itemIds[0];
  });
}
export async function mapEquipmentRequirement(context: AppContext, raw: unknown) {
  permission(context,"create"); const input = z.object({ programGroupId:z.string().min(1), recommendation:z.string().min(1).max(200), equipmentId:z.string().min(1), quantity:z.coerce.number().positive().max(100000) }).parse(raw);
  return context.prisma.$transaction(async tx => {
    const group = await tx.sstProgramExposureGroup.findUniqueOrThrow({ where:{id:input.programGroupId},include:{program:true} });
    assertBudgetUnitAccess(context.user,group.program.budgetUnitId);
    const recommendations = z.array(z.object({epiApplicable:z.boolean(),epis:z.array(z.string())})).parse(group.risks).filter(r=>r.epiApplicable).flatMap(r=>r.epis);
    if (group.program.kind!=="PGR" || !recommendations.includes(input.recommendation)) throw new SstValidationError("Recomendação não pertence a este PGR.");
    const equipment = await tx.$queryRaw<Equipment[]>`SELECT * FROM "SstEquipment" WHERE "id"=${input.equipmentId} AND "budgetUnitId"=${group.program.budgetUnitId}`;
    if (!equipment[0]) throw new SstValidationError("Equipamento de outra UG.");
    const id=randomUUID();
    await tx.$executeRaw`INSERT INTO "SstEquipmentRequirement" ("id","programGroupId","recommendation","equipmentId","quantity","createdById") VALUES (${id},${input.programGroupId},${input.recommendation},${input.equipmentId},${input.quantity},${context.user.id}) ON CONFLICT ("programGroupId","recommendation") DO NOTHING`;
    const [saved] = await tx.$queryRaw<{id:string;equipmentId:string;quantity:number}[]>`SELECT "id","equipmentId","quantity" FROM "SstEquipmentRequirement" WHERE "programGroupId"=${input.programGroupId} AND "recommendation"=${input.recommendation}`;
    if(saved.equipmentId!==input.equipmentId || saved.quantity!==input.quantity) throw new SstValidationError("Recomendação já vinculada; preserve a versão e registre correção no novo PGR.");
    await audit(tx,context,saved.id); return saved.id;
  });
}
