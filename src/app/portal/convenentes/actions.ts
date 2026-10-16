"use server";
import { revalidatePath } from "next/cache";
import { getCurrentTenantContext } from "@/lib/platform/tenant-context";
import { reservePartnerDiscount, postPartnerDiscount } from "@/lib/rh/partner-discounts";

export async function reservePartnerDiscountAction(raw: unknown) {
  try { const context = await getCurrentTenantContext(); const id = await reservePartnerDiscount(context, raw); revalidatePath("/portal/convenentes"); revalidatePath("/rh/consignacoes"); return { id, error: "" }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível reservar o desconto." }; }
}
export async function postPartnerDiscountAction(raw: unknown) {
  try { const context = await getCurrentTenantContext(); await postPartnerDiscount(context, raw); revalidatePath("/portal/convenentes"); revalidatePath("/rh/consignacoes"); return { error: "" }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível lançar a parcela." }; }
}
