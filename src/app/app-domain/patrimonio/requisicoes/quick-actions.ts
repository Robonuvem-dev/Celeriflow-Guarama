"use server";

import { db } from "@/db/client";
import { materials, warehouses } from "@/db/schema/assets-stock";
import { departments, employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { eq } from "drizzle-orm";

export async function createQuickMaterialAction(data: {
  name: string;
  unitOfMeasure: string;
  categoryId: string;
  minStock?: number;
}) {
  try {
    await getTenantContextForModuleOperation("PATRIMONIO", "create");
    const name = data.name.trim();
    if (!name) return { error: "Nome do material é obrigatório." };
    if (!data.categoryId) return { error: "Selecione uma categoria." };

    const code = `MAT-${Date.now().toString().slice(-6)}`;
    const [inserted] = await db
      .insert(materials)
      .values({
        code,
        name,
        type: "MATERIAL",
        unitOfMeasure: data.unitOfMeasure || "UN",
        categoryId: data.categoryId,
        minStock: Number(data.minStock || 0),
        isActive: true,
      })
      .returning({ id: materials.id, code: materials.code, name: materials.name, unitOfMeasure: materials.unitOfMeasure });

    return {
      material: {
        id: inserted.id,
        label: `${inserted.code} - ${inserted.name}`,
        unitOfMeasure: inserted.unitOfMeasure,
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar material" };
  }
}

export async function createQuickWarehouseAction(data: { name: string; type?: string }) {
  try {
    await getTenantContextForModuleOperation("PATRIMONIO", "create");
    const name = data.name.trim();
    if (!name) return { error: "Nome do almoxarifado é obrigatório." };

    const [inserted] = await db
      .insert(warehouses)
      .values({
        name,
        type: data.type || "Central",
        isActive: true,
      })
      .returning({ id: warehouses.id, name: warehouses.name });

    return { warehouse: { id: inserted.id, name: inserted.name } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao criar almoxarifado" };
  }
}

export async function createQuickEmployeeAction(data: {
  fullName: string;
  cpf: string;
  registration?: string;
  departmentId?: string;
}) {
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
        departmentId: data.departmentId || null,
        personId: person.id,
        isActive: true,
      }).returning({ id: employees.id, name: employees.name, registration: employees.registration });
    }

    return {
      employee: {
        id: emp.id,
        label: [emp.name, emp.registration ? `Matrícula ${emp.registration}` : null].filter(Boolean).join(" · "),
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Falha ao cadastrar servidor" };
  }
}
