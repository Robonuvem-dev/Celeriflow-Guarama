import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { administrativeUnits, departments, employees, secretariats } from "@/db/schema/administration";
import { processDepartmentMetadata, processUnitMetadata } from "@/db/schema/process-reference-catalog";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { saveProcessStructure } from "./actions";
export const dynamic = "force-dynamic";
const style="rounded border p-2 text-sm";
type Option={id:string;name:string};
type RecordData={id:string;name:string;secretariatId:string;isActive:boolean;acronym:string|null;unitId?:string|null;responsibleEmployeeId?:string|null};
function Fields({kind,record,orgs,units,staff}:{kind:"unit"|"department";record?:RecordData;orgs:Option[];units:Option[];staff:Option[]}) {
 return <><input type="hidden" name="kind" value={kind}/><input type="hidden" name="id" value={record?.id??""}/><label>Órgão<select name="secretariatId" required defaultValue={record?.secretariatId??""} className={style}><option value="">Selecione</option>{orgs.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Descrição<input name="name" required maxLength={200} defaultValue={record?.name} className={style}/></label><label>Sigla<input name="acronym" required maxLength={30} defaultValue={record?.acronym??""} className={style}/></label>{kind==="department"&&<><label>Unidade<select required name="unitId" defaultValue={record?.unitId??""} className={style}><option value="">Selecione unidade do órgão</option>{units.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Responsável<select name="responsibleEmployeeId" defaultValue={record?.responsibleEmployeeId??""} className={style}><option value="">Sem responsável</option>{staff.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></>}<label><input name="isActive" type="checkbox" defaultChecked={record?.isActive??true}/> Ativo</label><button className={style}>{record?"Salvar":"Cadastrar"}</button></>;
}
export default async function StructurePage({searchParams}:{searchParams:Promise<{q?:string}>}) {
 const context=await getTenantContextForSystemAdministration(),database=context.database??db;
 const {q:raw=""}=await searchParams,q=typeof raw==="string"?raw.trim().slice(0,200):"";
 const [orgs,unitRows,departmentRows,staff]=await Promise.all([
 database.select({id:secretariats.id,name:secretariats.name}).from(secretariats).orderBy(asc(secretariats.name)),
 database.select({record:administrativeUnits,metadata:processUnitMetadata}).from(administrativeUnits).leftJoin(processUnitMetadata,eq(processUnitMetadata.unitId,administrativeUnits.id)).orderBy(asc(administrativeUnits.name)),
 database.select({record:departments,metadata:processDepartmentMetadata}).from(departments).leftJoin(processDepartmentMetadata,eq(processDepartmentMetadata.departmentId,departments.id)).orderBy(asc(departments.name)),
 database.select({id:employees.id,name:employees.name}).from(employees).where(eq(employees.isActive,true)).orderBy(asc(employees.name)),
 ]);
 const units=unitRows.map(row=>({id:row.record.id,name:row.record.name}));
 const matches=(name:string,acronym:string|null)=>!q||`${name} ${acronym??""}`.toLocaleLowerCase("pt-BR").includes(q.toLocaleLowerCase("pt-BR"));
 return <main className="space-y-5 p-4"><h1 className="text-xl font-bold">Estrutura de atendimento e processos</h1><Link href="/administracao/secretarias">Cadastrar órgão e sigla</Link><form method="get" className="flex gap-2"><input className={style} name="q" defaultValue={q} aria-label="Descrição ou sigla"/><button className={style}>Pesquisar</button><Link href="/protocolos/estrutura" className={style}>Limpar</Link></form>{(["unit","department"] as const).map(kind=><section className="space-y-3" key={kind}><h2 className="font-semibold">{kind==="unit"?"Unidades":"Setores e responsáveis"}</h2><form action={saveProcessStructure} className="flex flex-wrap items-end gap-3 rounded border p-3"><Fields kind={kind} orgs={orgs} units={units} staff={staff}/></form>{kind==="unit"?unitRows.filter(row=>matches(row.record.name,row.metadata?.acronym??null)).map(row=><form key={row.record.id} action={saveProcessStructure} className="flex flex-wrap items-end gap-3 rounded border p-3"><Fields kind={kind} record={{...row.record,acronym:row.metadata?.acronym??null}} orgs={orgs} units={units} staff={staff}/></form>):departmentRows.filter(row=>matches(row.record.name,row.metadata?.acronym??null)).map(row=><form key={row.record.id} action={saveProcessStructure} className="flex flex-wrap items-end gap-3 rounded border p-3"><Fields kind={kind} record={{...row.record,acronym:row.metadata?.acronym??null,unitId:row.metadata?.unitId,responsibleEmployeeId:row.metadata?.responsibleEmployeeId}} orgs={orgs} units={units} staff={staff}/></form>)}</section>)}<Link href="/protocolos">Voltar aos protocolos</Link></main>;
}
