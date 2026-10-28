"use server";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { registerAccident } from "@/lib/sst/accident-service";
import { revalidatePath } from "next/cache";
import { accidentActionError } from "@/lib/sst/accident-errors";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activePortalEmployee, portalRows } from "@/db/repositories/portal-servidor/records";
export async function reportOwnAccident(form: FormData) {
  try {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") return { error: "Usuário sem vínculo funcional ativo." };
    const executor = access.context.database ?? db;
    const employee = await activePortalEmployee(executor, access.employee.id);
    if (!employee) return { error: "Usuário sem vínculo funcional ativo." };
    const units = employee.secretariatId ? await portalRows<{ id: string }>(executor, sql`SELECT id FROM "BudgetUnit" WHERE "secretariatId"=${employee.secretariatId}`) : [];
    if (units.length !== 1) return { error: "Lotação não identifica uma única UG. Procure a gestão de pessoas." };
    const fields = Object.fromEntries(form.entries());
    if (fields.kind === "INCIDENT") return { error: "Este serviço é exclusivo de comunicação de CAT." };
    const id = await registerAccident(access.context, { ...fields, employeeId: access.employee.id, budgetUnitId: units[0].id, bodyParts: String(fields.bodyParts).split(";").map(s => s.trim()).filter(Boolean), witnesses: JSON.parse(String(fields.witnesses || "[]")) }, true);
    revalidatePath("/portal-servidor/sst/cat");
    return { error: null, id };
  } catch (e) { return { error: accidentActionError(e) }; }
}
