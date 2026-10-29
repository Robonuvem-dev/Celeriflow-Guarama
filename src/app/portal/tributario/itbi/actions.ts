"use server";

import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import { sendPortalItbiMessage, requestPortalItbiContestation } from "@/lib/tributacao/itbi-process-channel";
import { issueConfiguredItbiDocument } from "@/lib/tributacao/itbi-document-models";

export async function issuePortalConfiguredItbiDocumentAction(input: Parameters<typeof issueConfiguredItbiDocument>[2]) {
  const account = await getCitizenAccount("/portal/tributario/itbi");
  try { const result = await issueConfiguredItbiDocument(databaseConnection, { usuarioId: account.id }, input); revalidatePath("/portal/tributario/itbi"); return result; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível emitir a declaração." }; }
}

export async function requestPortalItbiContestationAction(input: Parameters<typeof requestPortalItbiContestation>[2]) {
  const account = await getCitizenAccount("/portal/tributario/itbi");
  try { await requestPortalItbiContestation(databaseConnection, account.id, input); revalidatePath("/portal/tributario/itbi"); revalidatePath("/tributacao/itbi/processos"); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível encaminhar a impugnação." }; }
}

export async function sendPortalItbiMessageAction(input: Parameters<typeof sendPortalItbiMessage>[2]) {
  const account = await getCitizenAccount("/portal/tributario/itbi");
  try { await sendPortalItbiMessage(databaseConnection, account.id, input); revalidatePath("/portal/tributario/itbi"); revalidatePath("/tributacao/itbi/comunicacao"); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível enviar a resposta ao processo." }; }
}
