"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { structureKinds } from "@/lib/cemeteries/structure-config";
import { saveStructure } from "@/lib/cemeteries/structure-service";

export async function saveStructureAction(kind: string, id: string | undefined, input: Record<string, unknown>) {
  try {
    const c = await getTenantContextForModuleOperation("CEMITERIOS", id ? "update" : "create");
    const record = await saveStructure(c.prisma, { usuarioId: c.user.id }, z.enum(structureKinds).parse(kind), id, input);
    revalidatePath("/cemiterios", "layout");
    return { id: record.id, error: undefined };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar o cadastro." }; }
}
