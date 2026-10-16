"use server";

import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { assertRhAbsenceDoesNotOverlap } from "@/lib/rh/absence-conflicts";

async function getTenantPrisma(operation: "create" | "update" | "delete") {
  return (await getTenantContextForModuleOperation("RH", operation)).prisma;
}

export async function saveLicenca(formData: FormData) {
  const id = formData.get("id") as string | null;
  const prisma = await getTenantPrisma(id ? "update" : "create");
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

    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${employeeId}`}))`;
      if (id) {
        await tx.$queryRaw`SELECT id FROM "Leave" WHERE id=${id} FOR UPDATE`;
        const previous = await tx.leave.findUniqueOrThrow({ where: { id } });
        if (previous.employeeId !== employeeId) throw new Error("Não é permitido trocar o titular do afastamento.");
        const occupational = await tx.sstMedicalCertificate.findUnique({ where: { leaveId: id }, select: { id: true } });
        if (occupational) throw new Error("Este afastamento possui origem em uma perícia SST. A decisão ocupacional e seu vínculo são preservados.");
        if (await tx.hrRightEntry.findFirst({ where: { details: { path: ["leaveId"], equals: id } } })) throw new Error("Licença integrada a direitos exige cancelamento compensatório; a projeção não pode ser editada.");
      }
      if (data.status === "Ativa") await assertRhAbsenceDoesNotOverlap(tx, { employeeId, startsAt: data.startDate, endsAt: data.endDate, kind: "LICENCA", excludeId: id || undefined });
      if (id) await tx.leave.update({ where: { id }, data });
      else await tx.leave.create({ data });
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
  const prisma = await getTenantPrisma("delete");
  try {
    const occupational = await prisma.sstMedicalCertificate.findUnique({ where: { leaveId: id }, select: { id: true } });
    if (occupational) return { success: false, error: "Afastamentos vinculados a uma perícia SST não podem ser excluídos pelo RH." };
    await prisma.$transaction(async tx => {
      const initial = await tx.leave.findUniqueOrThrow({ where: { id } });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${initial.employeeId}`}))`;
      await tx.$queryRaw`SELECT id FROM "Leave" WHERE id=${id} FOR UPDATE`;
      if (await tx.hrRightEntry.findFirst({ where: { details: { path: ["leaveId"], equals: id } } })) throw new Error("Licença integrada a direitos não pode ser excluída; use cancelamento compensatório.");
      if (await tx.sstMedicalCertificate.findUnique({ where: { leaveId: id }, select: { id: true } })) throw new Error("Afastamento possui origem SST protegida.");
      await tx.leave.delete({ where: { id } });
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

