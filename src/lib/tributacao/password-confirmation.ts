import { and, eq, gt, isNull } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { taxPasswordGrants, taxPasswordPreferences } from "@/db/schema/tax-password-confirmation";
export function assertPasswordIdentity(session: {firebaseUid:string;email:string}, proof: {uid:string;email?:string;auth_time:number;firebase?:{sign_in_provider?:string}}, now=Date.now()) {
 if (session.firebaseUid!==proof.uid || session.email.toLowerCase()!==proof.email?.toLowerCase() || proof.firebase?.sign_in_provider!=="password") throw new Error("Confirme a senha da mesma conta autenticada.");
 const age=Math.floor(now/1000)-proof.auth_time;
 if (!Number.isFinite(age)||age<0||age>60) throw new Error("Confirmação expirada; informe novamente sua senha.");
}
export async function readTaxPasswordPreference(db:DatabaseExecutor,userId:string) {
 const [preference]=await db.select().from(taxPasswordPreferences).where(eq(taxPasswordPreferences.userId,userId)).limit(1);
 return preference?.required ?? false;
}
export async function assertTaxPasswordConfirmation(db:DatabaseExecutor,userId:string,now=new Date()) {
 if (!await readTaxPasswordPreference(db,userId)) return;
 const grants=await db.update(taxPasswordGrants).set({consumedAt:now}).where(and(eq(taxPasswordGrants.userId,userId),isNull(taxPasswordGrants.consumedAt),gt(taxPasswordGrants.expiresAt,now))).returning({id:taxPasswordGrants.id});
 if (!grants.length) throw new Error("Confirmação de senha exigida. Use Confirmar senha no cabeçalho de Tributação antes de salvar; cada confirmação autoriza uma única manutenção.");
}
export async function grantTaxPasswordConfirmation(db:DatabaseExecutor,userId:string,authTime:number,now=new Date()) {
 const [grant]=await db.insert(taxPasswordGrants).values({userId,authTime,expiresAt:new Date(now.getTime()+60000)}).onConflictDoNothing().returning({id:taxPasswordGrants.id});
 if (!grant) throw new Error("Essa confirmação já foi usada. Confirme novamente sua senha.");
 return grant;
}
export async function setTaxPasswordPreference(db:DatabaseExecutor,userId:string,required:boolean) {
 await assertTaxPasswordConfirmation(db,userId);
 await db.insert(taxPasswordPreferences).values({userId,required,updatedAt:new Date()}).onConflictDoUpdate({target:taxPasswordPreferences.userId,set:{required,updatedAt:new Date()}});
}
