"use server";
import { revalidatePath } from "next/cache";
import { getPlanningContext } from "@/lib/planejamento/access";
import { saveRegionalActionRecord } from "@/lib/planejamento/regional-actions";
export async function saveRegionalAction(form: FormData): Promise<void> {
  await saveRegionalActionRecord(await getPlanningContext("EXECUTIVE"), { id: String(form.get("id") || "") || undefined, actionId: form.get("actionId"), region: form.get("region"), subactionCode: form.get("subactionCode") || "", name: form.get("name"), active: form.get("active") === "on" });
  revalidatePath("/planejamento/regionalizacao");
}
