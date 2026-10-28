"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { assertRhAbsenceDoesNotOverlap } from "@/lib/rh/absence-conflicts";
import { eq, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { leaves } from "@/db/schema/personnel-records";
import { hrRightEntries } from "@/db/schema/personnel-workforce";
import { lockPersonnel } from "@/db/repositories/personnel/integration";

export async function saveLicenca(formData: FormData) {
  const id = formData.get("id") as string | null;
  await getTenantContextForModuleOperation("RH", id ? "update" : "create");
  try {
    const employeeId = formData.get("employeeId") as string;
    const type = formData.get("type") as string;
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;
    const reason = formData.get("reason") as string;
    const status = formData.get("status") as string;

    if (!employeeId || !type || !startDate || !endDate) {
      return { success: false, error: "Servidor, Tipo e Período são obrigatórios." };
    }

    const data = {
      employeeId,
      type,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason: reason || null,
      status: status || "Ativa",
    };

    await withDatabaseTransaction(databaseConnection, async tx => {
      await lockPersonnel(tx, `employee:${employeeId}`);
      if (id) {
        await tx.execute(sql`SELECT id FROM "Leave" WHERE id=${id} FOR UPDATE`);
        const [previous] = await tx.select().from(leaves).where(eq(leaves.id, id)).limit(1);
        if (!previous) throw new Error("Afastamento não encontrado.");
        if (previous.employeeId !== employeeId) throw new Error("Não é permitido trocar o titular do afastamento.");
        const { rows: [occupational] } = await tx.execute<{ id: string }>(sql`SELECT id FROM "SstMedicalCertificate" WHERE "leaveId"=${id} LIMIT 1`);
        if (occupational) throw new Error("Este afastamento possui origem em uma perícia SST. A decisão ocupacional e seu vínculo são preservados.");
        if ((await tx.select({ id: hrRightEntries.id }).from(hrRightEntries).where(sql`${hrRightEntries.details}->>'leaveId' = ${id}`).limit(1)).length) throw new Error("Licença integrada a direitos exige cancelamento compensatório; a projeção não pode ser editada.");
      }
      if (data.status === "Ativa") await assertRhAbsenceDoesNotOverlap(tx, { employeeId, startsAt: data.startDate, endsAt: data.endDate, kind: "LICENCA", excludeId: id || undefined });
      if (id) await tx.update(leaves).set(data).where(eq(leaves.id, id));
      else await tx.insert(leaves).values(data);
    });

    revalidatePath("/rh/licencas");
    revalidatePath("/portal-servidor");
    revalidatePath("/portal-servidor/ferias");
    return { success: true };
  } catch (error) {
    console.error("Erro ao salvar licença:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao salvar a licença." };
  }
}

export async function deleteLicenca(id: string) {
  const context = await getTenantContextForModuleOperation("RH", "delete");
  try {
    const { rows: [occupational] } = await (context.database ?? databaseConnection.db).execute<{ id: string }>(sql`SELECT id FROM "SstMedicalCertificate" WHERE "leaveId"=${id} LIMIT 1`);
    if (occupational) return { success: false, error: "Afastamentos vinculados a uma perícia SST não podem ser excluídos pelo RH." };
    await withDatabaseTransaction(databaseConnection, async tx => {
      const [initial] = await tx.select().from(leaves).where(eq(leaves.id, id)).limit(1);
      if (!initial) throw new Error("Afastamento não encontrado.");
      await lockPersonnel(tx, `employee:${initial.employeeId}`);
      await tx.execute(sql`SELECT id FROM "Leave" WHERE id=${id} FOR UPDATE`);
      if ((await tx.select({ id: hrRightEntries.id }).from(hrRightEntries).where(sql`${hrRightEntries.details}->>'leaveId' = ${id}`).limit(1)).length) throw new Error("Licença integrada a direitos não pode ser excluída; use cancelamento compensatório.");
      if ((await tx.execute<{ id: string }>(sql`SELECT id FROM "SstMedicalCertificate" WHERE "leaveId"=${id} LIMIT 1`)).rows.length) throw new Error("Afastamento possui origem SST protegida.");
      await tx.delete(leaves).where(eq(leaves.id, id));
    });
    revalidatePath("/rh/licencas");
    revalidatePath("/portal-servidor");
    revalidatePath("/portal-servidor/ferias");
    return { success: true };
  } catch (error) {
    console.error("Erro ao excluir licença:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao excluir o registro de licença." };
  }
}

