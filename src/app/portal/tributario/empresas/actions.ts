"use server";

import { prisma } from "@/lib/prisma";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import { issuePortalEconomicDocument } from "@/lib/tributacao/portal-economic-documents";

export async function issuePortalEconomicDocumentAction(input: Parameters<typeof issuePortalEconomicDocument>[2]) {
  const account = await getCitizenAccount("/portal/tributario/empresas");
  try { return await issuePortalEconomicDocument(prisma, account.id, input); }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível emitir o documento cadastral." }; }
}
