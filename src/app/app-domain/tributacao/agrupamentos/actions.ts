"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { mergeTaxRegistries } from "@/lib/tributacao/registry-merge";
export async function mergeRegistriesAction(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
  await mergeTaxRegistries(databaseConnection, context.user, { kind: form.get("kind"), source: form.get("source"), target: form.get("target"), reason: form.get("reason") });
  revalidatePath("/tributacao/agrupamentos");
  revalidatePath("/cadastros");
  redirect("/tributacao/agrupamentos?done=1");
}
