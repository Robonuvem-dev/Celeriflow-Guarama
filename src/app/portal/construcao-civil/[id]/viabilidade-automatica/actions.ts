"use server";
import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { constructionActionMessage } from "@/lib/obras/construction-errors";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { runConstructionAutomaticViability } from "@/lib/obras/construction-automatic-viability";
import { automaticViabilityInputSchema } from "@/lib/obras/construction-automatic-viability-policy";

export async function requestAutomaticViability(input: unknown) {
  try {
    const data = automaticViabilityInputSchema.parse(input);
    const identity = await getConstructionPortalIdentity();
    const id = await runConstructionAutomaticViability(databaseConnection, identity.id, data);
    revalidatePath(`/portal/construcao-civil/${data.caseId}/viabilidade-automatica`);
    revalidatePath(`/obras/construcao-civil/${data.caseId}`);
    return { success: true, id };
  } catch (error) {
    return { error: constructionActionMessage(error, "Não foi possível concluir a consulta automática.") };
  }
}
