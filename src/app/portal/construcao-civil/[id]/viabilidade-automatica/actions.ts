"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { runConstructionAutomaticViability } from "@/lib/obras/construction-automatic-viability";
import { automaticViabilityInputSchema } from "@/lib/obras/construction-automatic-viability-policy";

export async function requestAutomaticViability(input: unknown) {
  try {
    const data = automaticViabilityInputSchema.parse(input);
    const identity = await getConstructionPortalIdentity();
    const id = await runConstructionAutomaticViability(prisma, identity.id, data);
    revalidatePath(`/portal/construcao-civil/${data.caseId}/viabilidade-automatica`);
    revalidatePath(`/obras/construcao-civil/${data.caseId}`);
    return { success: true, id };
  } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues[0].message : error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível concluir a consulta automática." };
  }
}
