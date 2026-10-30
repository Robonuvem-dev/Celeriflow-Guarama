"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { adminAuth } from "@/lib/firebase/server";
import { db } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getSessionPrincipal, SESSION_COOKIE_NAME } from "@/lib/platform/session";
import { assertPasswordIdentity, grantTaxPasswordConfirmation, readTaxPasswordPreference, setTaxPasswordPreference } from "@/lib/tributacao/password-confirmation";
export async function getTaxPasswordSetting() {
 const context=await getTenantContextForModule("TRIBUTACAO");
 return {required:await readTaxPasswordPreference(context.database??db,context.user.id)};
}
export async function confirmTaxPassword(idToken:string) {
 try {
  const context=await getTenantContextForModule("TRIBUTACAO");
  if (idToken.length<100||idToken.length>20000) throw new Error("Token inválido.");
  const cookieStore=await cookies(); const session=await getSessionPrincipal(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) throw new Error("Sessão expirada.");
  const proof=await adminAuth.verifyIdToken(idToken,true); assertPasswordIdentity(session,proof);
  await grantTaxPasswordConfirmation(context.database??db,context.user.id,proof.auth_time);
  return {error:null};
 } catch(error) {return {error:error instanceof Error?error.message:"Falha na confirmação."};}
}
export async function updateTaxPasswordSetting(required:boolean) {
 try {
  if (typeof required!=="boolean") throw new Error("Opção inválida.");
  const context=await getTenantContextForModule("TRIBUTACAO");
  await setTaxPasswordPreference(context.database??db,context.user.id,required);
  revalidatePath("/tributacao/seguranca"); return {error:null};
 } catch(error) {return {error:error instanceof Error?error.message:"Falha ao salvar preferência."};}
}
