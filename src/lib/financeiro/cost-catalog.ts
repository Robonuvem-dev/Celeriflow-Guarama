import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { assertCostScope, lockCostYear, MunicipalCostError, validateCostPairs, distributeCostPercentages } from "./cost-ledger";
import { costSourceTypes, standardCostItems, type CostActor, type CostShare, type CostSourceType } from "./cost-types";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const required = (value: string, label: string) => { if (!value?.trim()) throw new MunicipalCostError(`${label} é obrigatório.`); return value.trim(); };

async function nextCode(tx: Prisma.TransactionClient, financialYearId: string, parentId: string | null) {
  const parent = parentId ? await tx.municipalCostObject.findUniqueOrThrow({ where: { id: parentId } }) : null;
  const siblings = await tx.municipalCostObject.findMany({ where: { financialYearId, parentId }, select: { code: true } });
  const ordinal = siblings.reduce((max, sibling) => Math.max(max, Number(sibling.code.split(".").at(-1))), 0) + 1;
  return `${parent ? parent.code + "." : ""}${String(ordinal).padStart(3, "0")}`;
}

export async function createMunicipalCostObject(db: PrismaClient, actor: CostActor, input: { financialYearId: string; budgetUnitId?: string; parentId?: string; description: string; detailedDescription: string }) {
  return db.$transaction(async tx => {
    const parent = input.parentId ? await tx.municipalCostObject.findUnique({ where: { id: input.parentId } }) : null;
    if (input.parentId && (!parent?.isActive || parent.financialYearId !== input.financialYearId)) throw new MunicipalCostError("Superior ativo deve pertencer ao exercício.");
    const budgetUnitId = input.budgetUnitId || parent?.budgetUnitId || null;
    if (parent?.budgetUnitId && parent.budgetUnitId !== budgetUnitId) throw new MunicipalCostError("Filho não pode mudar a UG do superior.");
    await assertCostScope(tx, actor, input.financialYearId, budgetUnitId, !budgetUnitId);
    await lockCostYear(tx, input.financialYearId);
    const object = await tx.municipalCostObject.create({ data: { financialYearId: input.financialYearId, budgetUnitId, parentId: parent?.id, code: await nextCode(tx, input.financialYearId, parent?.id ?? null), description: required(input.description, "Descrição"), detailedDescription: required(input.detailedDescription, "Descrição detalhada"), sourceKey: `MANUAL:${randomUUID()}`, sourceSnapshot: { origin: "MANUAL", actorId: actor.usuarioId } } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_COST_OBJECT", targetId: object.id });
    return object;
  });
}

export async function deleteMunicipalCostObjectTree(db: PrismaClient, actor: CostActor, objectId: string) {
  return db.$transaction(async tx => {
    const root = await tx.municipalCostObject.findUnique({ where: { id: objectId } });
    if (!root) throw new MunicipalCostError("Objeto não encontrado.");
    await assertCostScope(tx, actor, root.financialYearId, root.budgetUnitId, !root.budgetUnitId);
    await lockCostYear(tx, root.financialYearId);
    const objects = await tx.municipalCostObject.findMany({ where: { financialYearId: root.financialYearId } });
    const ids = new Set([root.id]);
    for (let changed = true; changed;) { changed = false; for (const object of objects) if (object.parentId && ids.has(object.parentId) && !ids.has(object.id)) { ids.add(object.id); changed = true; } }
    for (const object of objects.filter(object => ids.has(object.id))) await assertCostScope(tx, actor, object.financialYearId, object.budgetUnitId, !object.budgetUnitId);
    if (await tx.municipalCostObjectItem.count({ where: { objectId: { in: [...ids] } } }) || await tx.municipalCostAllocation.count({ where: { objectId: { in: [...ids] } } })) throw new MunicipalCostError("A subárvore possui itens vinculados ou movimentos históricos; a exclusão não é permitida.");
    const rules = await tx.municipalCostRule.findMany({ where: { financialYearId: root.financialYearId } });
    if (rules.some(rule => Array.isArray(rule.shares) && rule.shares.some(share => share && typeof share === "object" && !Array.isArray(share) && ids.has(String(share.objectId))))) throw new MunicipalCostError("A subárvore está referenciada por regra de apropriação.");
    for (const object of objects.filter(object => ids.has(object.id)).sort((a, b) => b.code.split(".").length - a.code.split(".").length)) await tx.municipalCostObject.delete({ where: { id: object.id } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_COST_OBJECT_TREE", targetId: objectId });
    return ids.size;
  });
}

export async function saveMunicipalCostItem(db: PrismaClient, actor: CostActor, input: { financialYearId: string; id?: string; identifier: string; description: string; detailedDescription: string; identificationClass: string; behavior: "FIXED" | "VARIABLE"; isActive: boolean }) {
  const identificationClass = required(input.identificationClass, "Classificação").toUpperCase();
  let identifier = required(input.identifier, "Identificador");
  if (identificationClass === "TELEFONE") { identifier = identifier.replace(/\D/g, ""); if (!/^\d{10,13}$/.test(identifier)) throw new MunicipalCostError("Telefone exige de 10 a 13 dígitos, incluindo DDD."); }
  if (identificationClass === "PLACA") { identifier = identifier.replace(/[-\s]/g, "").toUpperCase(); if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(identifier)) throw new MunicipalCostError("Placa inválida."); }
  if (!["FIXED", "VARIABLE"].includes(input.behavior) || typeof input.isActive !== "boolean") throw new MunicipalCostError("Informe custo fixo/variável e situação.");
  return db.$transaction(async tx => {
    await assertCostScope(tx, actor, input.financialYearId, undefined, true);
    await lockCostYear(tx, input.financialYearId);
    if (input.id && !await tx.municipalCostItem.count({ where: { id: input.id, financialYearId: input.financialYearId } })) throw new MunicipalCostError("Item não pertence ao exercício.");
    const data = { financialYearId: input.financialYearId, identifier, description: required(input.description, "Descrição"), detailedDescription: required(input.detailedDescription, "Descrição detalhada"), identificationClass, behavior: input.behavior, isActive: input.isActive };
    const item = input.id ? await tx.municipalCostItem.update({ where: { id: input.id }, data }) : await tx.municipalCostItem.create({ data });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_COST_ITEM", targetId: item.id });
    return item;
  });
}

export async function adoptStandardMunicipalCostItems(db: PrismaClient, actor: CostActor, financialYearId: string) {
  return db.$transaction(async tx => {
    await assertCostScope(tx, actor, financialYearId, undefined, true);
    await lockCostYear(tx, financialYearId);
    for (const item of standardCostItems) await tx.municipalCostItem.upsert({ where: { financialYearId_identifier: { financialYearId, identifier: item.identifier } }, update: {}, create: { ...item, identificationClass: "TEXTO", financialYearId, detailedDescription: `${item.description} — classificação municipal ajustável` } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_COST_STANDARD_ITEMS", targetId: financialYearId });
  });
}

export async function linkMunicipalCostItems(db: PrismaClient, actor: CostActor, input: { objectIds: string[]; itemIds: string[] }) {
  if (!input.objectIds.length || !input.itemIds.length || input.objectIds.length * input.itemIds.length > 200) throw new MunicipalCostError("Selecione objetos e itens (até 200 relações).");
  return db.$transaction(async tx => {
    const objects = await tx.municipalCostObject.findMany({ where: { id: { in: input.objectIds }, isActive: true } });
    let items = await tx.municipalCostItem.findMany({ where: { id: { in: input.itemIds }, isActive: true } });
    if (objects.length !== new Set(input.objectIds).size || items.length !== new Set(input.itemIds).size || new Set([...objects.map(object => object.financialYearId), ...items.map(item => item.financialYearId)]).size !== 1) throw new MunicipalCostError("Objetos e itens ativos devem pertencer ao mesmo exercício.");
    await lockCostYear(tx, objects[0].financialYearId);
    items = await tx.municipalCostItem.findMany({ where: { id: { in: input.itemIds }, isActive: true, financialYearId: objects[0].financialYearId } });
    if (items.length !== new Set(input.itemIds).size) throw new MunicipalCostError("Item inativado durante o relacionamento; confira a seleção.");
    for (const object of objects) {
      await assertCostScope(tx, actor, object.financialYearId, object.budgetUnitId, !object.budgetUnitId);
      for (const item of items) await tx.municipalCostObjectItem.upsert({ where: { objectId_itemId: { objectId: object.id, itemId: item.id } }, update: {}, create: { objectId: object.id, itemId: item.id } });
    }
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_COST_RELATIONS", targetId: objects[0].financialYearId });
  });
}

export async function createMunicipalCostRule(db: PrismaClient, actor: CostActor, input: { financialYearId: string; budgetUnitId: string; title: string; sourceType: CostSourceType; selector: Record<string, string>; shares: CostShare[]; priority: number; effectiveFrom: Date; effectiveUntil?: Date }) {
  if (!costSourceTypes.includes(input.sourceType) || !Number.isSafeInteger(input.priority) || !Number.isFinite(input.effectiveFrom.getTime()) || (input.effectiveUntil && (!Number.isFinite(input.effectiveUntil.getTime()) || input.effectiveUntil < input.effectiveFrom))) throw new MunicipalCostError("Origem, prioridade ou vigência da regra inválida.");
  const keys = new Set(["appropriationId", "employeeId", "payrollCode", "contractId", "costCenterId", "workLocation", "payrollComponent", "provisionKind", "assetId", "materialId", "categoryId", "subcategoryId", "warehouseId", "departmentId"]);
  if (Object.entries(input.selector).some(([key, value]) => !keys.has(key) || !value?.trim())) throw new MunicipalCostError("Critério de seleção desconhecido ou vazio.");
  distributeCostPercentages(new Prisma.Decimal("100.00"), input.shares);
  return db.$transaction(async tx => {
    const year = await assertCostScope(tx, actor, input.financialYearId, input.budgetUnitId);
    await lockCostYear(tx, input.financialYearId);
    await validateCostPairs(tx, actor, input.financialYearId, input.budgetUnitId, input.shares);
    if (input.selector.appropriationId && !await tx.budgetAppropriation.count({ where: { id: input.selector.appropriationId, financialYearId: year.id, budgetUnitId: input.budgetUnitId } })) throw new MunicipalCostError("Dotação do critério não pertence à UG/exercício.");
    if (input.selector.costCenterId && !await tx.costCenter.count({ where: { id: input.selector.costCenterId, governmentEntityId: year.governmentEntityId, isActive: true } })) throw new MunicipalCostError("Centro de custo do critério não pertence à entidade.");
    if (["employeeId", "payrollCode", "workLocation", "payrollComponent", "provisionKind"].some(key => input.selector[key]) && input.sourceType !== "PAYROLL") throw new MunicipalCostError("Critérios individuais de folha exigem origem PAYROLL.");
    if (["STOCK_CONSUMPTION", "IMMEDIATE_MATERIAL"].includes(input.sourceType)) {
      if (input.selector.subcategoryId && !await tx.materialSubcategory.count({ where: { id: input.selector.subcategoryId, isActive: true, category: { isActive: true }, ...(input.selector.categoryId ? { categoryId: input.selector.categoryId } : {}) } })) throw new MunicipalCostError("Subclasse ativa deve pertencer à classe informada.");
      if (input.selector.materialId && !await tx.material.count({ where: { id: input.selector.materialId, isActive: true, ...(input.selector.categoryId ? { categoryId: input.selector.categoryId } : {}), ...(input.selector.subcategoryId ? { subcategoryId: input.selector.subcategoryId } : {}) } })) throw new MunicipalCostError("Produto ativo não corresponde à classe/subclasse informadas.");
      if (input.selector.categoryId && !await tx.materialCategory.count({ where: { id: input.selector.categoryId, isActive: true } })) throw new MunicipalCostError("Classe de material inválida ou inativa.");
      const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: input.budgetUnitId }, select: { secretariatId: true } });
      if (input.selector.warehouseId && !await tx.warehouse.count({ where: { id: input.selector.warehouseId, isActive: true, costCenter: { governmentEntityId: year.governmentEntityId, secretariatId: unit.secretariatId, ...(input.selector.costCenterId ? { id: input.selector.costCenterId } : {}) } } })) throw new MunicipalCostError("Almoxarifado/centro da regra não pertence ao ente e secretaria da UG.");
      if (input.selector.departmentId && !await tx.department.count({ where: { id: input.selector.departmentId, secretariatId: unit.secretariatId } })) throw new MunicipalCostError("Destino do consumo não pertence à secretaria da UG.");
    }
    if (input.sourceType === "PAYROLL") {
      if (input.selector.payrollComponent && !["GROSS", "EMPLOYER"].includes(input.selector.payrollComponent)) throw new MunicipalCostError("Componente da folha deve ser bruto ou encargos patronais.");
      if (input.selector.provisionKind && !["PROVISAO_FERIAS", "PROVISAO_13", "PROVISAO_LICENCA"].includes(input.selector.provisionKind)) throw new MunicipalCostError("Tipo de provisão inválido.");
      const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: input.budgetUnitId } });
      const centers = await tx.costCenter.findMany({ where: { governmentEntityId: year.governmentEntityId, secretariatId: unit.secretariatId, isActive: true }, select: { id: true } });
      if (input.selector.costCenterId && !centers.some(center => center.id === input.selector.costCenterId)) throw new MunicipalCostError("Centro da regra de folha não pertence à secretaria da UG.");
      if (input.selector.employeeId || input.selector.contractId || input.selector.workLocation) {
        const where: Prisma.HrEmploymentContractWhereInput = { ...(input.selector.employeeId ? { employeeId: input.selector.employeeId } : {}), ...(input.selector.contractId ? { id: input.selector.contractId } : {}), ...(input.selector.workLocation ? { workLocation: input.selector.workLocation } : {}), costCenterId: { in: centers.map(center => center.id) } };
        const known = await tx.hrEmploymentContract.count({ where });
        const captured = await tx.municipalCostSource.count({ where: { financialYearId: year.id, budgetUnitId: input.budgetUnitId, sourceType: "PAYROLL", AND: Object.entries(input.selector).filter(([key]) => ["employeeId", "contractId", "workLocation"].includes(key)).map(([key, value]) => ({ snapshot: { path: ["dimensions", key], equals: value } })) } });
        if (!known && !captured) throw new MunicipalCostError("Identidade/localização não está conciliada ao centro do ente ou às origens de folha da UG.");
      }
      if (input.selector.payrollCode && !await tx.hrPayrollRubric.count({ where: { code: input.selector.payrollCode, type: "PROVENTO", isActive: true, ruleSet: { scope: "PRODUCAO", isDemo: false } } })) throw new MunicipalCostError("Verba deve corresponder a provento cadastrado em parâmetros de produção.");
      if (input.selector.payrollCode && input.selector.payrollComponent === "EMPLOYER") throw new MunicipalCostError("Encargos patronais não recebem código de provento inventado; selecione componente, contrato ou localização.");
    }
    const rule = await tx.municipalCostRule.create({ data: { financialYearId: input.financialYearId, budgetUnitId: input.budgetUnitId, title: required(input.title, "Descrição da regra"), sourceType: input.sourceType, priority: input.priority, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, selector: json(input.selector), shares: json(input.shares), actorId: actor.usuarioId } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_COST_RULE", targetId: rule.id });
    return rule;
  });
}

export async function generateMunicipalCostObjectsFromLoa(db: PrismaClient, actor: CostActor, input: { instrumentId: string; financialYearId: string; level: 1 | 2 | 3 | 4 | 5 | 6 }) {
  if (![1, 2, 3, 4, 5, 6].includes(input.level)) throw new MunicipalCostError("Selecione um dos seis níveis da LOA.");
  return db.$transaction(async tx => {
    const year = await assertCostScope(tx, actor, input.financialYearId, undefined, true);
    await lockCostYear(tx, year.id);
    const instrument = await tx.planningInstrument.findUnique({ where: { id: input.instrumentId }, include: { lines: { where: { kind: "EXPENSE", year: year.year }, include: { budgetUnit: { include: { secretariat: true } }, program: true, action: true }, orderBy: { id: "asc" } } } });
    if (!instrument || instrument.kind !== "LOA" || instrument.governmentEntityId !== year.governmentEntityId || instrument.startYear !== year.year) throw new MunicipalCostError("LOA deve pertencer à entidade e exercício.");
    const createdIds = new Set<string>();
    for (const line of instrument.lines) {
      const levels = [
        { key: `ORGAN:${line.budgetUnit.secretariatId}`, text: line.budgetUnit.secretariat.name, unit: null },
        { key: `UNIT:${line.budgetUnitId}`, text: line.budgetUnit.name, unit: line.budgetUnitId },
        { key: `FUNCTION:${line.functionCode}`, text: `Função ${line.functionCode}`, unit: line.budgetUnitId },
        { key: `SUBFUNCTION:${line.subfunctionCode}`, text: `Subfunção ${line.subfunctionCode}`, unit: line.budgetUnitId },
        { key: `PROGRAM:${line.programId}`, text: line.program?.name ?? "", unit: line.budgetUnitId },
        { key: `ACTION:${line.actionId}`, text: line.action?.name ?? "", unit: line.budgetUnitId },
      ];
      if ((input.level >= 3 && !line.functionCode) || (input.level >= 4 && !line.subfunctionCode) || (input.level >= 5 && !line.programId) || (input.level >= 6 && !line.actionId)) throw new MunicipalCostError(`Linha ${line.code}: classificação incompleta para o nível selecionado.`);
      let parentId: string | null = null;
      let path = `LOA:${instrument.id}`;
      for (const level of levels.slice(0, input.level)) {
        path += `/${level.key}`;
        let object = await tx.municipalCostObject.findUnique({ where: { financialYearId_sourceKey: { financialYearId: year.id, sourceKey: path } } });
        if (!object) object = await tx.municipalCostObject.create({ data: { financialYearId: year.id, budgetUnitId: level.unit, parentId, code: await nextCode(tx, year.id, parentId), description: level.text, detailedDescription: `Objeto gerado da LOA ${instrument.code}: ${level.text}`, sourceKey: path, sourceSnapshot: { instrumentId: instrument.id, level: level.key, path } } });
        createdIds.add(object.id); parentId = object.id;
      }
    }
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_COST_LOA_GENERATION", targetId: instrument.id });
    return [...createdIds];
  });
}

export async function copyAnnualMunicipalCostRelations(db: PrismaClient, actor: CostActor, input: { sourceFinancialYearId: string; targetFinancialYearId: string }) {
  return db.$transaction(async tx => {
    const from = await assertCostScope(tx, actor, input.sourceFinancialYearId, undefined, true);
    const to = await assertCostScope(tx, actor, input.targetFinancialYearId, undefined, true);
    if (from.governmentEntityId !== to.governmentEntityId || from.year !== to.year - 1) throw new MunicipalCostError("A cópia exige exercício imediatamente anterior da mesma entidade.");
    for (const id of [from.id, to.id].sort()) await lockCostYear(tx, id);
    const originals = await tx.municipalCostObjectItem.findMany({ where: { object: { financialYearId: from.id } }, include: { object: true, item: true } });
    const targets = await tx.municipalCostObject.findMany({ where: { financialYearId: to.id, isActive: true } });
    if (!originals.length) throw new MunicipalCostError("O exercício anterior não possui relações para copiar.");
    let copied = 0;
    for (const relation of originals) {
      // O caminho oficial inclui IDs canônicos de órgão/UG/programa/ação; não inferir objeto manual pelo texto.
      const path = relation.object.sourceKey.startsWith("LOA:") ? relation.object.sourceKey.slice(relation.object.sourceKey.indexOf("/")) : null;
      const matches = path ? targets.filter(object => object.sourceKey.startsWith("LOA:") && object.sourceKey.endsWith(path) && object.budgetUnitId === relation.object.budgetUnitId) : [];
      if (matches.length !== 1) throw new MunicipalCostError(`Objeto ${relation.object.code}: gere a classificação correspondente da LOA atual; mapeamento ausente ou ambíguo.`);
      let item = await tx.municipalCostItem.findUnique({ where: { financialYearId_identifier: { financialYearId: to.id, identifier: relation.item.identifier } } });
      if (item && (!item.isActive || item.identificationClass !== relation.item.identificationClass || item.behavior !== relation.item.behavior)) throw new MunicipalCostError(`Item ${relation.item.identifier}: classificação atual diverge da origem.`);
      if (!item) item = await tx.municipalCostItem.create({ data: { financialYearId: to.id, identifier: relation.item.identifier, description: relation.item.description, detailedDescription: relation.item.detailedDescription, identificationClass: relation.item.identificationClass, behavior: relation.item.behavior, isActive: relation.item.isActive } });
      if (!item.isActive) continue;
      await tx.municipalCostObjectItem.upsert({ where: { objectId_itemId: { objectId: matches[0].id, itemId: item.id } }, update: {}, create: { objectId: matches[0].id, itemId: item.id, copiedFromId: relation.id } });
      copied++;
    }
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_COST_ANNUAL_COPY", targetId: to.id });
    return { copied };
  });
}

export async function retireMunicipalCostRule(db: PrismaClient, actor: CostActor, input: { id: string; reason: string }) {
  return db.$transaction(async tx => {
    const rule = await tx.municipalCostRule.findUniqueOrThrow({ where: { id: input.id } });
    await assertCostScope(tx, actor, rule.financialYearId, rule.budgetUnitId);
    await lockCostYear(tx, rule.financialYearId);
    const reason = required(input.reason, "Justificativa de inativação");
    const current = await tx.municipalCostRule.findUniqueOrThrow({ where: { id: rule.id } });
    if (!current.isActive) { if (current.retirementReason !== reason) throw new MunicipalCostError("Regra já inativada com outra justificativa."); return current; }
    const retired = await tx.municipalCostRule.update({ where: { id: rule.id }, data: { isActive: false, retiredAt: new Date(), retirementReason: reason } });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "MUNICIPAL_COST_RULE_RETIRED", targetId: retired.id });
    return retired;
  });
}
