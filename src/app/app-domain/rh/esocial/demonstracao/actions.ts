"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { configureDemoPermission } from "@/lib/rh/esocial/service";
export async function saveEsocialPermission(form:FormData):Promise<void>{
 const employerId=String(form.get('employerId')||'');let error='';
 try{await configureDemoPermission(await getTenantContextForModule('RH'),{employerId,email:form.get('email'),permission:form.get('permission'),enabled:form.get('enabled')==='true'});}catch(e){error=e instanceof Error?e.message:'Falha ao configurar permissão.';}
 revalidatePath('/rh/esocial');
 redirect('/rh/esocial?'+new URLSearchParams({employerId,competencia:form.get('period')==='2026'?'2026':'2026-10',tab:'auditoria',...(error?{error}:{notice:'Permissão atualizada. O usuário também precisa de acesso RH e à unidade.'})}));
}
