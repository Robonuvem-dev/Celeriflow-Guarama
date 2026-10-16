"use server";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { registerAccident } from "@/lib/sst/accident-service";
import { revalidatePath } from "next/cache";
import { accidentActionError } from "@/lib/sst/accident-errors";
export async function reportOwnAccident(form: FormData) {
  try {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") return { error: "Usuário sem vínculo funcional ativo." };
    const employee = await access.context.prisma.employee.findUniqueOrThrow({ where: { id: access.employee.id }, select: { secretariatId: true } });
    const units = employee.secretariatId ? await access.context.prisma.budgetUnit.findMany({ where: { secretariatId: employee.secretariatId }, select: { id: true } }) : [];
    if (units.length !== 1) return { error: "Lotação não identifica uma única UG. Procure a gestão de pessoas." };
    const fields = Object.fromEntries(form.entries());
    if (fields.kind === "INCIDENT") return { error: "Este serviço é exclusivo de comunicação de CAT." };
    const id = await registerAccident(access.context, { ...fields, employeeId: access.employee.id, budgetUnitId: units[0].id, bodyParts: String(fields.bodyParts).split(";").map(s => s.trim()).filter(Boolean), witnesses: JSON.parse(String(fields.witnesses || "[]")) }, true);
    revalidatePath("/portal-servidor/sst/cat");
    return { error: null, id };
  } catch (e) { return { error: accidentActionError(e) }; }
}
