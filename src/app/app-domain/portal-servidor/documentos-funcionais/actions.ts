"use server";
import { revalidatePath } from "next/cache";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { issueOwnFunctionalDocument } from "@/lib/portal-servidor/generated-documents";
export async function issueMyFunctionalDocument(raw: unknown) {
  try {
    const access = await getEmployeePortalAccess(); if (access.status !== "AVAILABLE") return { error: "Acesso funcional indisponível." };
    const id = await issueOwnFunctionalDocument(access.context, raw);
    revalidatePath("/portal-servidor/documentos-funcionais");
    return { id, error: "" };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível emitir o documento." }; }
}
