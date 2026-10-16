"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { saveRecruitmentNotice, decideRecruitmentApplication } from "@/lib/rh/recruitment-service";

export async function saveRecruitmentNoticeAction(raw: unknown) {
  try {
    const { id } = z.object({ id: z.string().min(1).optional() }).parse(raw);
    const context = await getTenantContextForModuleOperation("RH", id ? "update" : "create");
    await saveRecruitmentNotice(context, raw);
    revalidatePath("/rh/concursos"); revalidatePath("/portal/concursos");
    return { error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar o edital." }; }
}
export async function decideRecruitmentApplicationAction(raw: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("RH", "update");
    await decideRecruitmentApplication(context, raw);
    revalidatePath("/rh/concursos"); revalidatePath("/portal/concursos");
    return { error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível decidir a inscrição." }; }
}
