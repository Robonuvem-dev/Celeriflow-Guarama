"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { approveAndExecutePersonMerge, getPersonMergeCandidates, proposePersonMerge, reversePersonMerge } from "@/lib/cadastros/person-merge-service";
import { databaseConnection, db } from "@/db/client";

type ActionResult = { success: true } | { error: string };

function errorResult(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message : "Não foi possível concluir a mesclagem." };
}

export async function reviewPersonMergeCandidates(sourcePersonId: string): Promise<{ candidates: Awaited<ReturnType<typeof getPersonMergeCandidates>> } | { error: string }> {
  try {
    const context = await getTenantContextForSystemAdministration();
    return { candidates: await getPersonMergeCandidates(context.database ?? db, sourcePersonId) };
  } catch (error) {
    return errorResult(error);
  }
}

export async function proposePfDuplicateMerge(sourcePersonId: string, targetPersonId: string): Promise<ActionResult> {
  try {
    const { user } = await getTenantContextForSystemAdministration();
    await proposePersonMerge(databaseConnection, user, sourcePersonId, targetPersonId);
    revalidatePath("/configuracoes/mesclagem-pf");
    return { success: true };
  } catch (error) {
    return errorResult(error);
  }
}

export async function approveAndExecutePfDuplicateMerge(requestId: string): Promise<ActionResult> {
  try {
    const { user } = await getTenantContextForSystemAdministration();
    await approveAndExecutePersonMerge(databaseConnection, user, requestId);
    revalidatePath("/configuracoes/mesclagem-pf");
    revalidatePath("/cadastros/pessoas-fisicas");
    return { success: true };
  } catch (error) {
    return errorResult(error);
  }
}

export async function reversePfDuplicateMerge(requestId: string): Promise<ActionResult> {
  try {
    const { user } = await getTenantContextForSystemAdministration();
    await reversePersonMerge(databaseConnection, user, requestId);
    revalidatePath("/configuracoes/mesclagem-pf");
    revalidatePath("/cadastros/pessoas-fisicas");
    return { success: true };
  } catch (error) {
    return errorResult(error);
  }
}
