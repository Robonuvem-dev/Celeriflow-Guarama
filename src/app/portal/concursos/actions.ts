"use server";
import { revalidatePath } from "next/cache";
import { getCurrentTenantContext } from "@/lib/platform/tenant-context";
import { submitRecruitmentApplication } from "@/lib/rh/recruitment-service";

export async function submitRecruitmentApplicationAction(raw: unknown) {
  try {
    const context = await getCurrentTenantContext();
    const id = await submitRecruitmentApplication(context, raw);
    revalidatePath("/portal/concursos");
    return { id, error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar a inscrição." }; }
}
