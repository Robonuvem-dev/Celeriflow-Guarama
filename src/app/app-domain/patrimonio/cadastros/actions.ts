"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { catalogDefinition } from "@/lib/patrimonio/catalog-definitions";
import { copyAssetRequesters, saveAssetCatalog } from "@/lib/patrimonio/catalog-service";

export async function saveCatalogAction(form: FormData): Promise<void> {
  const kind = String(form.get("kind") || "");
  const definition = catalogDefinition(kind);
  const context = await getTenantContextForModuleOperation(definition.module, form.get("id") ? "update" : "create");
  const details = Object.fromEntries(definition.fields.map(field => [field.key, String(form.get(field.key) || "")]));
  await saveAssetCatalog(databaseConnection, context.user, { id: String(form.get("id") || ""), version: String(form.get("version") || ""), kind, code: String(form.get("code") || ""), name: String(form.get("name") || ""), year: form.get("year"), departmentId: String(form.get("departmentId") || ""), details });
  const base = definition.module === "FROTAS" ? "/frotas/cadastros" : "/patrimonio/cadastros";
  revalidatePath(base);
  redirect(`${base}?kind=${encodeURIComponent(kind)}&year=${Number(form.get("year"))}`);
}
export async function copyRequestersAction(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("PATRIMONIO", "create");
  const year = Number(form.get("year"));
  await copyAssetRequesters(databaseConnection, context.user, String(form.get("departmentId") || ""), year);
  revalidatePath("/patrimonio/cadastros");
  redirect(`/patrimonio/cadastros?kind=requisitantes&year=${year + 1}`);
}
