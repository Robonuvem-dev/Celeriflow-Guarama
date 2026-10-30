import Link from "next/link";
import { db } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listReferenceRecords } from "@/lib/rh/reference-records";
import { S1ActionForm } from "../S1ActionForm";
import { saveEducationLeaveType, deleteEducationLeaveType } from "./actions";
export const dynamic = "force-dynamic";
export default async function EducationLeavePage({searchParams}:{searchParams:Promise<{id?:string}>}) {
 const context = await getTenantContextForModule("EDUCACAO");
 const records = await listReferenceRecords(context.database ?? db,"LICENCA_EDUCACAO"); const params = await searchParams; const selected = records.find(r=>r.id===params.id);
 return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Tipos de licença e férias escolares</h1><p>Cadastre os tipos autorizados e seu limite de dias de afastamento conforme o regulamento municipal.</p>
 <S1ActionForm key={selected?.id || "novo"} title={selected ? `Editar ${selected.name}` : "Novo tipo"} submitLabel="Salvar" action={saveEducationLeaveType} fields={[{name:"id",label:"ID",type:"hidden",defaultValue:selected?.id},{name:"code",label:"Código",required:true,defaultValue:selected?.code},{name:"name",label:"Tipo de licença ou férias",required:true,defaultValue:selected?.name},{name:"maximumDays",label:"Limite de dias de afastamento",type:"number",required:true,defaultValue:selected?.details.maximumDays},{name:"legalReference",label:"Regulamento / fundamento legal",required:true,defaultValue:selected?.details.legalReference}]} />
 <table className="w-full text-left"><thead><tr><th>Código</th><th>Tipo</th><th>Limite (dias)</th><th>Fundamento</th><th>Ações</th></tr></thead><tbody>{records.map(r=><tr key={r.id}><td>{r.code}</td><td>{r.name}</td><td>{r.details.maximumDays}</td><td>{r.details.legalReference}</td><td><Link href={`/educacao/licencas?id=${r.id}`}>Editar</Link><form action={deleteEducationLeaveType}><input type="hidden" name="id" value={r.id}/><button>Excluir</button></form></td></tr>)}</tbody></table></div>;
}
