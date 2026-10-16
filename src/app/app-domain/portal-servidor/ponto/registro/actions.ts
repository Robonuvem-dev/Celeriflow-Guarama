"use server";

import { revalidatePath } from "next/cache";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { recordOwnClock } from "@/lib/portal-servidor/clock-service";

export async function registerMyClock(raw: unknown) {
  try {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") return { error: "Acesso funcional indisponível." };
    const result = await recordOwnClock(access.context, raw);
    revalidatePath("/portal-servidor/ponto"); revalidatePath("/rh/ponto");
    return { ...result, error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar a marcação." }; }
}
