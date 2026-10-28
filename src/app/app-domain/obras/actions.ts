"use server";

import { and, eq, notInArray, sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { getPostgresError } from "@/db/errors";
import { withDatabaseTransaction } from "@/db/transaction";
import { infrastructureWorks, infrastructureMeasurements, infrastructureServices, infrastructureTeams, infrastructureServiceEmployees, infrastructureServiceTeams, infrastructureServiceEquipment, infrastructureServiceMaterials, infrastructureServicePurchases, infrastructureServiceDocuments } from "@/db/schema/infrastructure";
import { assets } from "@/db/schema/assets";
import { materialStocks } from "@/db/schema/assets-stock";
import { departments, employees } from "@/db/schema/administration";
import { documents } from "@/db/schema/registry";
import { z } from "zod";
import { getTenantContextForModuleOperation, type ModuleOperation } from "@/lib/platform/tenant-context";
import { applyStockMovement, StockServiceError } from "@/lib/patrimonio/stock-service";
import { revalidatePath } from "next/cache";

async function authorize(operation: ModuleOperation) {
  await getTenantContextForModuleOperation("OBRAS", operation);
}

function requireUpdated(rows: { id: string }[]) {
  if (rows.length !== 1) throw new Error("Registro não encontrado.");
}

type ActionResult = { error?: string };

const obraTypes = ["Construção", "Reforma", "Pavimentação", "Drenagem", "Iluminação"] as const;
const obraStatuses = ["Em Planejamento", "Em Execução", "Concluída", "Paralisada"] as const;
const measurementStatuses = ["Em Análise", "Aprovada", "Rejeitada"] as const;
const serviceStatuses = ["Aberto", "Em Andamento", "Concluído", "Cancelado"] as const;
const text = z.string().trim().min(1, "Campo obrigatório.");
const positiveNumber = z.number().finite().min(0, "Informe um valor maior ou igual a zero.");
const inputDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.").transform((value) => new Date(`${value}T12:00:00.000Z`));

function errorMessage(error: unknown, fallback: string) {
  if (getPostgresError(error)?.code === "23505") return "Já existe um registro com esses dados.";
  return fallback;
}

function revalidate(path: string) {
  revalidatePath(path);
  revalidatePath("/obras");
  revalidatePath("/iluminacao-publica/iluminacao-energia");
  revalidatePath("/iluminacao-publica/ordens-servico");
}

export async function createObra(data: { numero: string; nome: string; descricao?: string; local?: string; tipo: string; valorEstimado: number }): Promise<ActionResult> {
  await authorize("create");
  const parsed = z.object({ numero: text, nome: text, descricao: z.string().trim().optional(), local: z.string().trim().optional(), tipo: z.enum(obraTypes), valorEstimado: positiveNumber }).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await db.insert(infrastructureWorks).values({ ...parsed.data, descricao: parsed.data.descricao || null, local: parsed.data.local || null, status: "Em Planejamento" });
  } catch (error) {
    return { error: errorMessage(error, "Não foi possível cadastrar a obra.") };
  }
  revalidate("/obras/obras-projetos");
  return {};
}

export async function updateObra(id: string, data: { numero: string; nome: string; descricao?: string; local?: string; tipo: string; valorEstimado: number; status: string }): Promise<ActionResult> {
  await authorize("update");
  const parsed = z.object({ id: text, numero: text, nome: text, descricao: z.string().trim().optional(), local: z.string().trim().optional(), tipo: z.enum(obraTypes), valorEstimado: positiveNumber, status: z.enum(obraStatuses) }).safeParse({ id, ...data });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    requireUpdated(await db.update(infrastructureWorks).set({ numero: parsed.data.numero, nome: parsed.data.nome, descricao: parsed.data.descricao || null, local: parsed.data.local || null, tipo: parsed.data.tipo, valorEstimado: parsed.data.valorEstimado, status: parsed.data.status }).where(eq(infrastructureWorks.id, parsed.data.id)).returning({ id: infrastructureWorks.id }));
  } catch (error) {
    return { error: errorMessage(error, "Não foi possível atualizar a obra.") };
  }
  revalidate("/obras/obras-projetos");
  return {};
}

export async function inactivateObra(id: string): Promise<ActionResult> {
  await authorize("update");
  if (!text.safeParse(id).success) return { error: "Obra inválida." };
  try {
    requireUpdated(await db.update(infrastructureWorks).set({ active: false }).where(eq(infrastructureWorks.id, id)).returning({ id: infrastructureWorks.id }));
  } catch (error) {
    return { error: errorMessage(error, "Não foi possível inativar a obra.") };
  }
  revalidate("/obras/obras-projetos");
  return {};
}

export async function createMedicao(data: { numero: number; data: string; valorMedido: number; obraId: string }): Promise<ActionResult> {
  await authorize("create");
  const parsed = z.object({ numero: z.number().int().positive("Informe um número de medição válido."), data: inputDate, valorMedido: positiveNumber, obraId: text }).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [obra] = await db.select({ active: infrastructureWorks.active, status: infrastructureWorks.status }).from(infrastructureWorks).where(eq(infrastructureWorks.id, parsed.data.obraId)).limit(1);
  if (!obra) return { error: "Obra não encontrada." };
  if (!obra.active || obra.status === "Concluída") return { error: "A obra não aceita novas medições." };
  try {
    await db.insert(infrastructureMeasurements).values({ ...parsed.data, status: "Em Análise" });
  } catch (error) {
    return { error: errorMessage(error, "Não foi possível cadastrar a medição.") };
  }
  revalidate("/obras/fiscalizacao-medicoes");
  return {};
}

export async function updateMedicao(id: string, data: { numero: number; data: string; valorMedido: number; status: string }): Promise<ActionResult> {
  await authorize("update");
  const parsed = z.object({ id: text, numero: z.number().int().positive("Informe um número de medição válido."), data: inputDate, valorMedido: positiveNumber, status: z.enum(measurementStatuses) }).safeParse({ id, ...data });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    requireUpdated(await db.update(infrastructureMeasurements).set({ numero: parsed.data.numero, data: parsed.data.data, valorMedido: parsed.data.valorMedido, status: parsed.data.status }).where(eq(infrastructureMeasurements.id, parsed.data.id)).returning({ id: infrastructureMeasurements.id }));
  } catch (error) {
    return { error: errorMessage(error, "Não foi possível atualizar a medição.") };
  }
  revalidate("/obras/fiscalizacao-medicoes");
  return {};
}

export async function inactivateMedicao(id: string): Promise<ActionResult> {
  await authorize("update");
  if (!text.safeParse(id).success) return { error: "Medição inválida." };
  try {
    requireUpdated(await db.update(infrastructureMeasurements).set({ active: false }).where(eq(infrastructureMeasurements.id, id)).returning({ id: infrastructureMeasurements.id }));
  } catch (error) {
    return { error: errorMessage(error, "Não foi possível inativar a medição.") };
  }
  revalidate("/obras/fiscalizacao-medicoes");
  return {};
}

export async function createServico(data: { protocolo: string; tipo: string; descricao: string; local: string }): Promise<ActionResult> {
  await authorize("create");
  const parsed = z.object({ protocolo: text, tipo: text, descricao: text, local: text }).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await db.insert(infrastructureServices).values({ ...parsed.data, status: "Aberto" });
  } catch (error) {
    return { error: errorMessage(error, "Não foi possível cadastrar o serviço.") };
  }
  revalidate("/obras/servicos-urbanos");
  return {};
}

export async function updateServico(id: string, data: { protocolo: string; tipo: string; descricao: string; local: string; status: string }): Promise<ActionResult> {
  await authorize("update");
  const parsed = z.object({ id: text, protocolo: text, tipo: text, descricao: text, local: text, status: z.enum(serviceStatuses) }).safeParse({ id, ...data });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    requireUpdated(await db.update(infrastructureServices).set({ protocolo: parsed.data.protocolo, tipo: parsed.data.tipo, descricao: parsed.data.descricao, local: parsed.data.local, status: parsed.data.status }).where(eq(infrastructureServices.id, parsed.data.id)).returning({ id: infrastructureServices.id }));
  } catch (error) {
    return { error: errorMessage(error, "Não foi possível atualizar o serviço.") };
  }
  revalidate("/obras/servicos-urbanos");
  return {};
}

export async function inactivateServico(id: string): Promise<ActionResult> {
  await authorize("update");
  if (!text.safeParse(id).success) return { error: "Serviço inválido." };
  try {
    requireUpdated(await db.update(infrastructureServices).set({ active: false }).where(eq(infrastructureServices.id, id)).returning({ id: infrastructureServices.id }));
  } catch (error) {
    return { error: errorMessage(error, "Não foi possível inativar o serviço.") };
  }
  revalidate("/obras/servicos-urbanos");
  return {};
}

// --- Integrações com Patrimônio, Compras, RH, GED e Financeiro ---
export async function configureServicoIntegration(data: {
  serviceId: string;
  departmentId?: string;
  targetAssetId?: string;
  budgetAppropriationId?: string;
  commitmentId?: string;
  scheduledFor?: string;
  estimatedCost?: number;
}): Promise<ActionResult> {
  await authorize("update");
  const parsed = z.object({
    serviceId: text,
    departmentId: z.string().trim().optional(),
    targetAssetId: z.string().trim().optional(),
    budgetAppropriationId: z.string().trim().optional(),
    commitmentId: z.string().trim().optional(),
    scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.").optional(),
    estimatedCost: positiveNumber.optional(),
  }).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const value = parsed.data;
  const [service, department, asset, appropriation, commitment] = await Promise.all([
    db.select({ id: infrastructureServices.id }).from(infrastructureServices).where(eq(infrastructureServices.id, value.serviceId)).limit(1).then(rows => rows[0]),
    value.departmentId ? db.select({ id: departments.id }).from(departments).where(eq(departments.id, value.departmentId)).limit(1).then(rows => rows[0]) : null,
    value.targetAssetId ? db.select({ id: assets.id, status: assets.status }).from(assets).where(eq(assets.id, value.targetAssetId)).limit(1).then(rows => rows[0]) : null,
    value.budgetAppropriationId ? db.execute<{ id: string }>(sql`SELECT id FROM "BudgetAppropriation" WHERE id=${value.budgetAppropriationId}`).then(result => result.rows[0]) : null,
    value.commitmentId ? db.execute<{ id: string; appropriationId: string; status: string }>(sql`SELECT id, "appropriationId", status FROM "Commitment" WHERE id=${value.commitmentId}`).then(result => result.rows[0]) : null,
  ]);
  if (!service) return { error: "Ordem de serviço não encontrada." };
  if (value.departmentId && !department) return { error: "Departamento não encontrado." };
  if (value.targetAssetId && (!asset || asset.status === "Baixado" || asset.status === "Inativo")) return { error: "Bem patrimonial não disponível." };
  if (value.budgetAppropriationId && !appropriation) return { error: "Dotação orçamentária não encontrada." };
  if (value.commitmentId && (!commitment || commitment.status === "Anulado")) return { error: "Empenho não disponível." };
  if (commitment && value.budgetAppropriationId && commitment.appropriationId !== value.budgetAppropriationId) {
    return { error: "O empenho informado não pertence à dotação selecionada." };
  }

  try {
    requireUpdated(await db.update(infrastructureServices).set({
        departmentId: value.departmentId || null,
        targetAssetId: value.targetAssetId || null,
        budgetAppropriationId: value.budgetAppropriationId || commitment?.appropriationId || null,
        commitmentId: value.commitmentId || null,
        scheduledFor: value.scheduledFor ? new Date(`${value.scheduledFor}T12:00:00.000Z`) : null,
        estimatedCost: value.estimatedCost ?? null,
    }).where(eq(infrastructureServices.id, value.serviceId)).returning({ id: infrastructureServices.id }));
  } catch (error) {
    return { error: errorMessage(error, "Não foi possível configurar as integrações da ordem.") };
  }
  revalidate("/obras/ordens-servico");
  revalidate("/obras/iluminacao-energia");
  return {};
}

export async function assignEmployeeToServico(serviceId: string, employeeId: string, role = "Executor"): Promise<ActionResult> {
  await authorize("update");
  if (!text.safeParse(serviceId).success || !text.safeParse(employeeId).success || !text.safeParse(role).success) return { error: "Dados de atribuição inválidos." };
  const [service, employee] = await Promise.all([
    db.select({ id: infrastructureServices.id }).from(infrastructureServices).where(and(eq(infrastructureServices.id, serviceId), eq(infrastructureServices.active, true))).limit(1).then(rows => rows[0]),
    db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, employeeId), eq(employees.isActive, true))).limit(1).then(rows => rows[0]),
  ]);
  if (!service || !employee) return { error: "Ordem de serviço ou servidor não disponível." };
  try {
    await db.insert(infrastructureServiceEmployees).values({ obrasServicoId: serviceId, employeeId, role }).onConflictDoUpdate({ target: [infrastructureServiceEmployees.obrasServicoId, infrastructureServiceEmployees.employeeId], set: { role, releasedAt: null } });
  } catch (error) {
    return { error: errorMessage(error, "Não foi possível atribuir o servidor.") };
  }
  revalidate("/obras/ordens-servico");
  return {};
}

export async function assignTeamToServico(serviceId: string, teamId: string): Promise<ActionResult> {
  await authorize("update");
  if (!text.safeParse(serviceId).success || !text.safeParse(teamId).success) return { error: "Dados de equipe inválidos." };
  const [service, team] = await Promise.all([
    db.select({ id: infrastructureServices.id }).from(infrastructureServices).where(and(eq(infrastructureServices.id, serviceId), eq(infrastructureServices.active, true))).limit(1).then(rows => rows[0]),
    db.select({ id: infrastructureTeams.id }).from(infrastructureTeams).where(and(eq(infrastructureTeams.id, teamId), eq(infrastructureTeams.isActive, true))).limit(1).then(rows => rows[0]),
  ]);
  if (!service || !team) return { error: "Ordem de serviço ou equipe não disponível." };
  try {
    await db.insert(infrastructureServiceTeams).values({ obrasServicoId: serviceId, equipeId: teamId }).onConflictDoUpdate({ target: [infrastructureServiceTeams.obrasServicoId, infrastructureServiceTeams.equipeId], set: { releasedAt: null } });
  } catch (error) {
    return { error: errorMessage(error, "Não foi possível atribuir a equipe.") };
  }
  revalidate("/obras/ordens-servico");
  return {};
}

export async function assignEquipmentToServico(serviceId: string, assetId: string): Promise<ActionResult> {
  await authorize("update");
  if (!text.safeParse(serviceId).success || !text.safeParse(assetId).success) return { error: "Dados de equipamento inválidos." };
  const [service, asset] = await Promise.all([
    db.select({ id: infrastructureServices.id }).from(infrastructureServices).where(and(eq(infrastructureServices.id, serviceId), eq(infrastructureServices.active, true))).limit(1).then(rows => rows[0]),
    db.select({ id: assets.id }).from(assets).where(and(eq(assets.id, assetId), notInArray(assets.status, ["Baixado", "Inativo"]))).limit(1).then(rows => rows[0]),
  ]);
  if (!service || !asset) return { error: "Ordem de serviço ou equipamento não disponível." };
  try {
    await db.insert(infrastructureServiceEquipment).values({ obrasServicoId: serviceId, assetId }).onConflictDoUpdate({ target: [infrastructureServiceEquipment.obrasServicoId, infrastructureServiceEquipment.assetId], set: { releasedAt: null } });
  } catch (error) {
    return { error: errorMessage(error, "Não foi possível atribuir o equipamento.") };
  }
  revalidate("/obras/maquinas-equipes");
  revalidate("/obras/ordens-servico");
  return {};
}

export async function issueMaterialToServico(data: { serviceId: string; stockId: string; quantity: number }): Promise<ActionResult> {
  const parsed = z.object({ serviceId: text, stockId: text, quantity: z.number().finite().positive("Informe uma quantidade maior que zero.") }).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const context = await getTenantContextForModuleOperation("OBRAS", "create");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [service, stock] = await Promise.all([
        tx.select({ id: infrastructureServices.id, departmentId: infrastructureServices.departmentId }).from(infrastructureServices).where(and(eq(infrastructureServices.id, parsed.data.serviceId), eq(infrastructureServices.active, true))).limit(1).then(rows => rows[0]),
        tx.select({ id: materialStocks.id, materialId: materialStocks.materialId, warehouseId: materialStocks.warehouseId, batchNumber: materialStocks.batchNumber, unitCost: materialStocks.unitCost }).from(materialStocks).where(eq(materialStocks.id, parsed.data.stockId)).limit(1).then(rows => rows[0]),
      ]);
      if (!service) throw new Error("ORDER_NOT_FOUND");
      if (!stock) throw new Error("INSUFFICIENT_STOCK");

      await applyStockMovement(tx, {
        kind: "EXIT",
        quantity: parsed.data.quantity,
        warehouseId: stock.warehouseId,
        materialId: stock.materialId,
        batchNumber: stock.batchNumber,
        unitCost: stock.unitCost,
        reason: "Execução de ordem de serviço",
        departmentId: service.departmentId,
        obrasServicoId: service.id,
        actor: { usuarioId: context.user.id, employeeId: context.user.employeeId },
      });

      await tx.insert(infrastructureServiceMaterials).values({ obrasServicoId: service.id, materialId: stock.materialId, stockId: stock.id, quantityPlanned: parsed.data.quantity, quantityIssued: parsed.data.quantity, unitCost: stock.unitCost })
        .onConflictDoUpdate({ target: [infrastructureServiceMaterials.obrasServicoId, infrastructureServiceMaterials.materialId], set: { stockId: stock.id, quantityIssued: sql`${infrastructureServiceMaterials.quantityIssued} + ${parsed.data.quantity}`, unitCost: stock.unitCost } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") return { error: "Ordem de serviço não disponível." };
    if (error instanceof StockServiceError && error.message === "Estoque insuficiente para atender a solicitação.") return { error: error.message };
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") return { error: "Estoque insuficiente para atender a solicitação." };
    return { error: errorMessage(error, "Não foi possível baixar o material do estoque.") };
  }
  revalidate("/obras/ordens-servico");
  revalidate("/obras/iluminacao-energia");
  return {};
}

export async function linkPurchaseToServico(data: { serviceId: string; purchaseRequestId?: string; purchaseProcessId?: string; purpose?: string }): Promise<ActionResult> {
  await authorize("create");
  const parsed = z.object({ serviceId: text, purchaseRequestId: z.string().trim().optional(), purchaseProcessId: z.string().trim().optional(), purpose: z.string().trim().optional() }).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!parsed.data.purchaseRequestId && !parsed.data.purchaseProcessId) return { error: "Informe uma solicitação ou processo de compra." };
  const [service, request, process] = await Promise.all([
    db.select({ id: infrastructureServices.id }).from(infrastructureServices).where(eq(infrastructureServices.id, parsed.data.serviceId)).limit(1).then(rows => rows[0]),
    parsed.data.purchaseRequestId ? db.execute<{ id: string }>(sql`SELECT id FROM "PurchaseRequest" WHERE id=${parsed.data.purchaseRequestId}`).then(result => result.rows[0]) : null,
    parsed.data.purchaseProcessId ? db.execute<{ id: string }>(sql`SELECT id FROM "PurchaseProcess" WHERE id=${parsed.data.purchaseProcessId}`).then(result => result.rows[0]) : null,
  ]);
  if (!service || (parsed.data.purchaseRequestId && !request) || (parsed.data.purchaseProcessId && !process)) return { error: "Referência de compra não encontrada." };
  try {
    await db.insert(infrastructureServicePurchases).values({ obrasServicoId: service.id, purchaseRequestId: request?.id, purchaseProcessId: process?.id, purpose: parsed.data.purpose || "Material" });
  } catch (error) {
    return { error: errorMessage(error, "Não foi possível vincular a compra à ordem.") };
  }
  revalidate("/obras/ordens-servico");
  return {};
}

export async function attachDocumentToServico(data: { serviceId: string; documentId: string; purpose?: string }): Promise<ActionResult> {
  await authorize("update");
  const parsed = z.object({ serviceId: text, documentId: text, purpose: z.string().trim().optional() }).safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [service, document] = await Promise.all([
    db.select({ id: infrastructureServices.id }).from(infrastructureServices).where(eq(infrastructureServices.id, parsed.data.serviceId)).limit(1).then(rows => rows[0]),
    db.select({ id: documents.id }).from(documents).where(eq(documents.id, parsed.data.documentId)).limit(1).then(rows => rows[0]),
  ]);
  if (!service || !document) return { error: "Ordem de serviço ou documento GED não encontrado." };
  try {
    await db.insert(infrastructureServiceDocuments).values({ obrasServicoId: service.id, documentId: document.id, purpose: parsed.data.purpose || "Comprovante" }).onConflictDoUpdate({ target: [infrastructureServiceDocuments.obrasServicoId, infrastructureServiceDocuments.documentId], set: { purpose: parsed.data.purpose || "Comprovante" } });
  } catch (error) {
    return { error: errorMessage(error, "Não foi possível vincular o documento GED.") };
  }
  revalidate("/obras/documentos");
  revalidate("/obras/ordens-servico");
  return {};
}
