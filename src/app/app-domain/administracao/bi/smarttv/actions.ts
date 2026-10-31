"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getDisplayEditor, mutateDisplay, previewDisplay } from "@/lib/bi/display-service";

export async function saveSmartTv(input: Parameters<typeof mutateDisplay>[1]) {
  try {
    const context = await getTenantContextForModule("ADMINISTRACAO");
    if (!["save", "publish", "withdraw", "restore"].includes(input.operation)) return { error: "Operação inválida." };
    await mutateDisplay(context, input);
    revalidatePath("/administracao/bi/smarttv");
    revalidatePath("/Smarttv");
    return { state: await getDisplayEditor(context) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar a programação." };
  }
}
export async function previewSmartTv(config: unknown) {
  try { return { display: await previewDisplay(await getTenantContextForModule("ADMINISTRACAO"), config) }; }
  catch { return { error: "Confira os campos e imagens antes de visualizar a programação." }; }
}
