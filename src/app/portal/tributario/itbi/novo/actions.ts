"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import { previewOnlineItbiProperty, submitOnlineItbi } from "@/lib/tributacao/itbi-online";

export async function previewOnlineItbiAction(input: Parameters<typeof previewOnlineItbiProperty>[2]) {
  const account = await getCitizenAccount("/portal/tributario/itbi/novo");
  try { return { property: await previewOnlineItbiProperty(db, account.id, input) }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Imóvel indisponível." }; }
}
export async function submitOnlineItbiAction(input: Parameters<typeof submitOnlineItbi>[2]) {
  const account = await getCitizenAccount("/portal/tributario/itbi/novo");
  try { const result = await submitOnlineItbi(db, account.id, input); revalidatePath("/portal/tributario/itbi"); revalidatePath("/tributacao/itbi"); return result; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível protocolar a declaração." }; }
}
