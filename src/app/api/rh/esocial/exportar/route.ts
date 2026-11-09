import { getTenantContextForModule, AccessError } from "@/lib/platform/tenant-context";
import { readDemo } from "@/lib/rh/esocial/service";
import { DEMO_LABEL } from "@/lib/rh/esocial/contract";
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const cell=(value:string)=>`"${(/^[=+@-]/.test(value)?"'"+value:value).replace(/"/g,'""')}"`;
export async function GET(request:Request){
 try{const p=new URL(request.url).searchParams,row=await readDemo(await getTenantContextForModule('RH'),p.get('employerId')||'',p.get('period')||'2026-10');if(!row)throw new AccessError('Cenário não encontrado.',404);
 const events=row.state.events.filter(e=>!p.get('eventId')||e.id===p.get('eventId'));
 const rows=[['Identificação','Tipo','Matrícula','Competência','Situação','Recibo DEMO','Fonte'],...events.map(e=>[e.id,e.type,e.registration||'',e.period,e.status,e.attempts.at(-1)?.receipt||'',e.sourceKind])];
 const html=p.get('format')==='html',body=html?`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>eSocial DEMO</title><h1>${DEMO_LABEL}</h1><p>XML conceitual; sem validação XSD oficial. CPF não incluído nesta exportação.</p><table>${rows.map((r,i)=>`<tr>${r.map(c=>`<${i?'td':'th'}>${escapeHtml(c)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</table></html>`:'\uFEFF'+cell(DEMO_LABEL)+'\r\n'+rows.map(r=>r.map(cell).join(';')).join('\r\n');
 return new Response(body,{headers:{'Content-Type':html?'text/html; charset=utf-8':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="esocial-DEMO.${html?'html':'csv'}"`,'Cache-Control':'private, no-store','Content-Security-Policy':"sandbox; default-src 'none'",'X-Content-Type-Options':'nosniff'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Exportação indisponível.'},{status:e instanceof AccessError?e.status:400});}
}
