"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { openConstructionEnforcement, assignConstructionEnforcement, recordConstructionEnforcementVisit, issueConstructionEnforcementAct, acknowledgeConstructionEnforcementAct } from "@/lib/obras/construction-enforcement-service";

async function mutate(input: unknown, operation: "open" | "assign" | "visit" | "act" | "acknowledge") {
  try {
    const context = await getTenantContextForModuleOperation("OBRAS", operation === "open" ? "create" : "update");
    if (operation === "open") await getTenantContextForModuleOperation("PROCESSOS", "create");
    const actor = { id: context.user.id, access: await resolveConstructionAccess(context) };
    const service = { open: openConstructionEnforcement, assign: assignConstructionEnforcement, visit: recordConstructionEnforcementVisit, act: issueConstructionEnforcementAct, acknowledge: acknowledgeConstructionEnforcementAct }[operation];
    const id = await context.prisma.$transaction((tx) => service(tx, actor, input));
    revalidatePath("/obras/construcao-civil/fiscalizacao");
    revalidatePath("/obras/construcao-civil/fiscalizacao/[id]", "page");
    revalidatePath("/obras/construcao-civil/fiscalizacao/[id]/atos/[actId]", "page");
    revalidatePath("/protocolos/processos", "layout");
    return { success: true, id };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0].message };
    if (error instanceof Prisma.PrismaClientKnownRequestError) return { error: error.code === "P2002" ? "Operação concorrente. Atualize a página e tente novamente com a mesma chave." : "Não foi possível registrar. Confira as referências." };
    return { error: error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível concluir a operação." };
  }
}
export async function openEnforcement(input: unknown) { return mutate(input, "open"); }
export async function assignEnforcement(input: unknown) { return mutate(input, "assign"); }
export async function recordEnforcementVisit(input: unknown) { return mutate(input, "visit"); }
export async function issueEnforcementAct(input: unknown) { return mutate(input, "act"); }
export async function acknowledgeEnforcementAct(input: unknown) { return mutate(input, "acknowledge"); }
