import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { administrativeUnits, departments, secretariats } from "@/db/schema/administration";
import { ombudsmanConfigurations, ombudsmanReferenceCatalog } from "@/db/schema/ombudsman-reference-catalog";
import { getAttendanceContext } from "@/lib/attendance/access";
import { ombudsmanRequestTypes } from "@/lib/attendance/reference-catalog";
import { saveOmbudsmanConfiguration } from "../actions";

export const dynamic="force-dynamic";
const kinds={ROUTE:"Roteiros da solicitação",QUESTIONNAIRE:"Questionários de classificação",STATUS:"Situações da solicitação"} as const;
type Kind=keyof typeof kinds;
type RecordData=typeof ombudsmanConfigurations.$inferSelect;
type Option={id:string;name:string};
type Catalog=typeof ombudsmanReferenceCatalog.$inferSelect;
const style="rounded border p-2 text-sm";
function Fields({kind,record,catalog,orgs,units,sectors}:{kind:Kind;record?:RecordData;catalog:Catalog[];orgs:Option[];units:Option[];sectors:Option[]}){
 const settings=record?.settings??{};
 return <><input type="hidden" name="kind" value={kind}/><input type="hidden" name="id" value={record?.id??""}/>
  {record&&<span className="text-xs">Código: {record.id}</span>}
  <label>Descrição<input className={style} name="name" required maxLength={200} defaultValue={record?.name}/></label>
  {kind==="ROUTE"&&<>
   <label>Tipo de solicitação<select className={style} name="requestType" defaultValue={settings.requestType??"Solicitação"}>{ombudsmanRequestTypes.map(type=><option key={type}>{type}</option>)}</select></label>
   <label>Assunto<select name="subjectId" className={style} required defaultValue={settings.subjectId??""}><option value="">Selecione</option>{catalog.filter(row=>row.kind==="SUBJECT").map(row=><option value={row.id} key={row.id}>{row.requestType} — {row.name}</option>)}</select></label>
   <label>Subassunto<select name="subsubjectId" className={style} required defaultValue={settings.subsubjectId??""}><option value="">Selecione</option>{catalog.filter(row=>row.kind==="SUBSUBJECT").map(row=><option value={row.id} key={row.id}>{row.requestType} — {catalog.find(parent=>parent.id===row.subjectId)?.name} — {row.name}</option>)}</select></label>
   <label>Número da rota<input className={style} name="routeNumber" type="number" min={1} required defaultValue={settings.routeNumber??1}/></label>
   <label>Sequência<input className={style} name="sequence" type="number" min={1} required defaultValue={settings.sequence??1}/></label>
   {([{name:"secretariatId",label:"Órgão",rows:orgs},{name:"unitId",label:"Unidade",rows:units},{name:"departmentId",label:"Setor",rows:sectors}] as const).map(field=><label key={field.name}>{field.label}<select className={style} name={field.name} required defaultValue={settings[field.name]??""}><option value="">Selecione</option>{field.rows.map(row=><option value={row.id} key={row.id}>{row.name}</option>)}</select></label>)}
   <label>Previsão de dias<input className={style} name="dueDays" type="number" min={0} max={3650} required defaultValue={settings.dueDays??5}/></label>
  </>}
  {kind==="STATUS"&&<><label><input name="availableToApplicant" type="checkbox" defaultChecked={settings.availableToApplicant??true}/> Disponível ao requerente</label><label>Status<select className={style} name="status" defaultValue={settings.status??"Movimentado"}><option>Cancelado</option><option>Encerrado</option><option>Movimentado</option></select></label></>}
  <label><input name="isActive" type="checkbox" defaultChecked={record?.isActive??true}/> Ativo</label><button className={style}>{record?"Salvar":"Cadastrar"}</button>
 </>;
}
export default async function OmbudsmanConfigurationPage({searchParams}:{searchParams:Promise<{kind?:string}>}){
 const context=await getAttendanceContext("edit");
 if(!context.attendanceAccess.isManager)throw new Error("Somente gestores podem configurar a Ouvidoria.");
 const database=context.database??db,{kind:requested}=await searchParams,kind:Kind=requested&&Object.hasOwn(kinds,requested)?requested as Kind:"ROUTE";
 const [records,catalog,orgs,units,sectors]=await Promise.all([
  database.select().from(ombudsmanConfigurations).where(eq(ombudsmanConfigurations.kind,kind)).orderBy(asc(ombudsmanConfigurations.name)),
  database.select().from(ombudsmanReferenceCatalog).orderBy(asc(ombudsmanReferenceCatalog.name)),
  database.select({id:secretariats.id,name:secretariats.name}).from(secretariats).where(eq(secretariats.isActive,true)).orderBy(asc(secretariats.name)),
  database.select({id:administrativeUnits.id,name:administrativeUnits.name}).from(administrativeUnits).where(eq(administrativeUnits.isActive,true)).orderBy(asc(administrativeUnits.name)),
  database.select({id:departments.id,name:departments.name}).from(departments).where(eq(departments.isActive,true)).orderBy(asc(departments.name)),
 ]);
 const fields={kind,catalog,orgs,units,sectors};
 return <main className="space-y-5 p-4"><h1 className="text-xl font-bold">Ouvidoria — {kinds[kind]}</h1>
  <nav className="flex flex-wrap gap-3"><Link className={style} href="/atendimento/cadastros">Assuntos, subassuntos e justificativas</Link>{Object.entries(kinds).map(([value,label])=><Link className={style} key={value} href={`/atendimento/cadastros/configuracoes?kind=${value}`}>{label}</Link>)}</nav>
  <section className="space-y-3"><h2 className="font-semibold">Novo cadastro</h2>{kind==="QUESTIONNAIRE"&&<p>O código é gerado automaticamente ao cadastrar a descrição.</p>}<form action={saveOmbudsmanConfiguration} className="flex flex-wrap items-end gap-3 rounded border p-3"><Fields {...fields}/></form></section>
  <section className="space-y-3"><h2 className="font-semibold">Registros ({records.length})</h2>{records.map(record=><form action={saveOmbudsmanConfiguration} key={record.id} className="flex flex-wrap items-end gap-3 rounded border p-3"><Fields {...fields} record={record}/></form>)}</section>
 </main>;
}
