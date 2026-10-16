"use server";

import { revalidatePath } from "next/cache";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { submitFunctionalRequest, submitFunctionalComplement } from "@/lib/portal-servidor/functional-requests";

export async function openMyFunctionalRequest(raw: unknown) {
  try {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") return { error: "Acesso funcional indisponível." };
    const result = await submitFunctionalRequest(access.context, raw);
    revalidatePath("/portal-servidor/protocolos");
    return { ...result, error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível protocolar o requerimento." }; }
}

export async function complementMyFunctionalRequest(raw: unknown) {
  try {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") return { error: "Acesso funcional indisponível." };
    await submitFunctionalComplement(access.context, raw);
    revalidatePath("/portal-servidor/protocolos", "layout");
    return { error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível complementar o requerimento." }; }
}
