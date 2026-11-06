"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { warehouses } from "@/db/schema/assets-stock";
import { employees } from "@/db/schema/administration";
import { costCenters } from "@/db/schema/master-data";
import { people } from "@/db/schema/people";

const text = (maximum: number) => z.string().trim().max(maximum).optional();
const warehouseInput = z.object({
  name: z.string().trim().min(1, "Informe o nome do almoxarifado.").max(160),
  type: z.enum(["Central", "Setorial"]),
  storageLocationType: text(60),
  aisle: text(60),
  shelf: text(60),
  bin: text(60),
  zipCode: text(16),
  streetName: text(180),
  number: text(30),
  neighborhood: text(120),
  city: text(120),
  state: text(2),
  managerId: z.string().trim().min(1, "Selecione o servidor responsável.").max(100),
  costCenterId: text(100),
});

type WarehouseActionResult = { error?: string };

export async function createEmployeeQuickAction(data: {
  fullName: string;
  cpf: string;
  registration?: string;
  role?: string;
}): Promise<{ error?: string; employee?: { id: string; label: string } }> {
  try {
    await getTenantContextForModuleOperation("PATRIMONIO", "create");
    const name = data.fullName.trim();
    const rawCpf = data.cpf.replace(/\D/g, "");
    if (!name) return { error: "Nome completo é obrigatório." };
    if (!rawCpf) return { error: "CPF é obrigatório." };

    let [person] = await db.select({ id: people.id }).from(people).where(eq(people.cpf, rawCpf)).limit(1);
    if (!person) {
      [person] = await db.insert(people).values({
        fullName: name,
        cpf: rawCpf,
        gender: "Não informado",
        raceColor: "Não informada",
        motherName: "Não informada",
        birthDate: new Date("1990-01-01T00:00:00.000Z"),
        status: "Ativo",
      }).returning({ id: people.id });
    }

    let [emp] = await db.select({ id: employees.id, name: employees.name, registration: employees.registration })
      .from(employees)
      .where(eq(employees.cpf, rawCpf))
      .limit(1);

    if (!emp) {
      [emp] = await db.insert(employees).values({
        name,
        cpf: rawCpf,
        registration: data.registration?.trim() || null,
        personId: person.id,
        isActive: true,
      }).returning({ id: employees.id, name: employees.name, registration: employees.registration });
    }

    const label = [emp.name, emp.registration ? `Matrícula ${emp.registration}` : null].filter(Boolean).join(" · ");
    return { employee: { id: emp.id, label } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível cadastrar o servidor." };
  }
}

function formInput(formData: FormData) {
  return warehouseInput.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    storageLocationType: formData.get("storageLocationType"),
    aisle: formData.get("aisle"),
    shelf: formData.get("shelf"),
    bin: formData.get("bin"),
    zipCode: formData.get("zipCode"),
    streetName: formData.get("streetName"),
    number: formData.get("number"),
    neighborhood: formData.get("neighborhood"),
    city: formData.get("city"),
    state: String(formData.get("state") || "").toUpperCase(),
    managerId: formData.get("managerId"),
    costCenterId: formData.get("costCenterId"),
  });
}

function normalizedAddress(input: z.output<typeof warehouseInput>) {
  const parts = [
    input.streetName && input.number ? `${input.streetName}, ${input.number}` : input.streetName,
    input.neighborhood,
    input.city && input.state ? `${input.city}/${input.state}` : input.city || input.state,
    input.zipCode ? `CEP ${input.zipCode}` : undefined,
  ].filter(Boolean);

  const locationDetails = [
    input.storageLocationType ? `Tipo: ${input.storageLocationType}` : null,
    input.aisle ? `Corredor: ${input.aisle}` : null,
    input.shelf ? `Prateleira: ${input.shelf}` : null,
    input.bin ? `Escaninho/Box: ${input.bin}` : null,
  ].filter(Boolean);

  let finalAddress = parts.join(" - ") || null;
  if (locationDetails.length > 0) {
    finalAddress = finalAddress ? `${finalAddress} [${locationDetails.join(" | ")}]` : `[${locationDetails.join(" | ")}]`;
  }
  return finalAddress;
}

async function validateReferences(
  input: z.output<typeof warehouseInput>,
  currentCostCenterId?: string | null,
) {
  const managerId = input.managerId || undefined;
  const costCenterId = input.costCenterId || undefined;
  const [manager, costCenter] = await Promise.all([
    managerId ? db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, managerId), eq(employees.isActive, true))).limit(1).then(rows => rows[0]) : null,
    costCenterId ? db.select({ id: costCenters.id, isActive: costCenters.isActive }).from(costCenters).where(eq(costCenters.id, costCenterId)).limit(1).then(rows => rows[0]) : null,
  ]);
  if (managerId && !manager) throw new Error("Selecione um responsável ativo.");
  if (costCenterId && (!costCenter || (!costCenter.isActive && costCenter.id !== currentCostCenterId))) throw new Error("Selecione um centro de custo ativo.");
  return { managerId: manager?.id || null, costCenterId: costCenter?.id || null };
}

function revalidateWarehouses() {
  revalidatePath("/patrimonio/almoxarifados");
  revalidatePath("/patrimonio/materiais");
  revalidatePath("/patrimonio");
  revalidatePath("/patrimonio", "layout");
}

export async function createWarehouseAction(formData: FormData): Promise<void> {
  const parsed = formInput(formData);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Dados do almoxarifado inválidos.");
  await getTenantContextForModuleOperation("PATRIMONIO", "create");
  const references = await validateReferences(parsed.data);
  await db.insert(warehouses).values({
      name: parsed.data.name,
      type: parsed.data.type,
      zipCode: parsed.data.zipCode || null,
      streetName: parsed.data.streetName || null,
      number: parsed.data.number || null,
      neighborhood: parsed.data.neighborhood || null,
      city: parsed.data.city || null,
      state: parsed.data.state || null,
      address: normalizedAddress(parsed.data),
      ...references,
  });
  revalidateWarehouses();
  redirect("/patrimonio/almoxarifados");
}

export async function updateWarehouseAction(id: string, formData: FormData): Promise<void> {
  const parsed = formInput(formData);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Dados do almoxarifado inválidos.");
  await getTenantContextForModuleOperation("PATRIMONIO", "update");
  const [existing] = await db.select({ id: warehouses.id, address: warehouses.address, costCenterId: warehouses.costCenterId }).from(warehouses).where(eq(warehouses.id, id)).limit(1);
  if (!existing) throw new Error("Almoxarifado não encontrado.");
  const references = await validateReferences(parsed.data, existing.costCenterId);
  const address = normalizedAddress(parsed.data);
  await db.update(warehouses).set({
      name: parsed.data.name,
      type: parsed.data.type,
      zipCode: parsed.data.zipCode || null,
      streetName: parsed.data.streetName || null,
      number: parsed.data.number || null,
      neighborhood: parsed.data.neighborhood || null,
      city: parsed.data.city || null,
      state: parsed.data.state || null,
      address: address ?? existing.address,
      ...references,
  }).where(eq(warehouses.id, existing.id));
  revalidateWarehouses();
  redirect("/patrimonio/almoxarifados");
}

export async function setWarehouseActiveAction(id: string, active: boolean): Promise<WarehouseActionResult> {
  try {
    await getTenantContextForModuleOperation("PATRIMONIO", "update");
    const [warehouse] = await db.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.id, id)).limit(1);
    if (!warehouse) throw new Error("Almoxarifado não encontrado.");
    await db.update(warehouses).set({ isActive: active }).where(eq(warehouses.id, warehouse.id));
    revalidateWarehouses();
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível alterar a situação do almoxarifado." };
  }
}

export async function deleteWarehouseAction(id: string): Promise<WarehouseActionResult> {
  try {
    await getTenantContextForModuleOperation("PATRIMONIO", "delete");
    const [warehouse] = await db.select({ id: warehouses.id, linkedRecords: sql<number>`(
      (SELECT count(*) FROM "MaterialStock" WHERE "warehouseId"="Warehouse"."id") +
      (SELECT count(*) FROM "MaterialMovement" WHERE "warehouseId"="Warehouse"."id") +
      (SELECT count(*) FROM "PurchaseReceiptItem" WHERE "warehouseId"="Warehouse"."id") +
      (SELECT count(*) FROM "InventorySession" WHERE "warehouseId"="Warehouse"."id") +
      (SELECT count(*) FROM "SchoolMeal" WHERE "warehouseId"="Warehouse"."id")
    )::int` }).from(warehouses).where(eq(warehouses.id, id)).limit(1);
    if (!warehouse) throw new Error("Almoxarifado não encontrado.");
    const linkedRecords = warehouse.linkedRecords;
    if (linkedRecords > 0) throw new Error("Este almoxarifado possui movimentações, estoque ou outros registros vinculados. Inative-o em vez de excluir.");
    await db.delete(warehouses).where(eq(warehouses.id, warehouse.id));
    revalidateWarehouses();
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível excluir o almoxarifado." };
  }
}
