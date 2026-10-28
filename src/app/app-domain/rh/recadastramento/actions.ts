"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { requestRecertificationCorrection } from "@/lib/rh/recertification";
import { reconcileProposedDependentPerson } from "@/lib/rh/recertification-canonicalization";
import { databaseConnection } from "@/db/client";

export async function requestRecertificationCorrectionAction(raw: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("RH", "update");
    await requestRecertificationCorrection(databaseConnection, context, raw);
    revalidatePath("/rh/solicitacoes"); revalidatePath("/rh/recadastramento"); revalidatePath("/portal-servidor/recadastramento");
    return { error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível solicitar correção." }; }
}

export async function reconcileRecertificationDependent(raw: unknown) {
  try {
    const context = await getTenantContextForModuleOperation("RH", "update");
    const id = await reconcileProposedDependentPerson(databaseConnection, context, raw);
    revalidatePath("/rh/solicitacoes"); revalidatePath("/rh/dependentes");
    return { id, error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível sanear a pessoa física." }; }
}
