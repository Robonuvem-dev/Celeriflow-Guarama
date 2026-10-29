"use server";

import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import { issuePortalLicense } from "@/lib/tributacao/portal-licenses";

export async function issuePortalLicenseAction(input:Parameters<typeof issuePortalLicense>[2]) {
  try {const account=await getCitizenAccount("/portal/tributario/alvaras");const license=await issuePortalLicense(databaseConnection,account.id,input);revalidatePath("/portal/tributario/alvaras");return {authCode:license.qrCode};}catch(error){return {error:error instanceof Error ? error.message : "Não foi possível emitir o alvará."};}
}
