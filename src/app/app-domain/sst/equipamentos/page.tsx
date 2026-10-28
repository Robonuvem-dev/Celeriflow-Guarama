import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listEquipment } from "@/lib/sst/equipment-queries";
import { EquipmentPagination as ErpPagination } from "./EquipmentPagination";
import { SstForm } from "../SstForm";
import { saveEquipmentPolicy } from "./actions";
import { EquipmentCatalogForm } from "./EquipmentCatalogForm";
import { EquipmentNav,EquipmentField,equipmentControl as control,equipmentDate } from "./EquipmentUi";
import { sstDatabase } from "@/lib/sst/database";
import { readSstEquipmentCatalogOptions, findSstEquipmentPolicy } from "@/db/repositories/sst-pages/equipment";

export default async function EquipmentPage({searchParams}:{searchParams:Promise<{budgetUnitId?:string;q?:string;materialQ?:string;supplierQ?:string;page?:string}>}) {
  const context=await getTenantContextForModule("SST"); const params=await searchParams;
  const data=await listEquipment(context,params); const unit=data.units.find(u=>u.id===params.budgetUnitId);
  const database=sstDatabase(context);
  const {materials,supplierRecords}=unit ? await readSstEquipmentCatalogOptions(database,params):{materials:[],supplierRecords:[]};
  const policy=unit ? await findSstEquipmentPolicy(database,unit.id):undefined;
  const suppliers=supplierRecords.map(s=>({id:s.id,name:s.person?.fullName||s.company?.corporateName||s.id}));
  const href=(page:number)=>`/sst/equipamentos?${new URLSearchParams(Object.entries({...params,page:String(page)}).filter((entry):entry is [string,string]=>entry[1]!==undefined))}`;
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Equipamentos de proteção — EPI/EPC</h1><EquipmentNav/>
    <form className="grid gap-3 sm:grid-cols-4"><EquipmentField label="UG"><select className={control} name="budgetUnitId" defaultValue={params.budgetUnitId}><option value="">Todas autorizadas</option>{data.units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></EquipmentField><EquipmentField label="Busca no catálogo"><input className={control} name="q" defaultValue={params.q}/></EquipmentField><EquipmentField label="Buscar material canônico (3 letras)"><input className={control} name="materialQ" defaultValue={params.materialQ}/></EquipmentField><button className="self-end rounded border p-2">Consultar</button></form>
    {unit && <><form className="flex flex-wrap gap-2"><input type="hidden" name="budgetUnitId" value={unit.id}/><input type="hidden" name="materialQ" value={params.materialQ||""}/><EquipmentField label="Buscar fornecedor por nome (3 letras, até 20)"><input name="supplierQ" defaultValue={params.supplierQ} className={control}/></EquipmentField><button className="self-end rounded border p-2">Carregar fornecedores</button></form><details className="rounded border p-3"><summary>Cadastrar complemento de material</summary><EquipmentCatalogForm budgetUnitId={unit.id} materials={materials} suppliers={suppliers}/></details>
    <details className="rounded border p-3"><summary>Parâmetro de integração com Almoxarifado</summary><SstForm action={saveEquipmentPolicy}><input type="hidden" name="budgetUnitId" value={unit.id}/><label><input type="checkbox" name="integrateStock" defaultChecked={policy?.integrateStock}/> Entregas desta UG geram saída real de estoque</label><p>Exige PATRIMONIO/create, depósito com centro de custo da secretaria e lote disponível. Baixa de uso nunca gera retorno automático.</p></SstForm></details></>}
    <p className="text-sm">{data.total} equipamentos. Selecione uma UG para cadastrar.</p><table className="w-full table-fixed text-left text-sm"><colgroup><col className="w-[42%]"/><col className="w-[14%]"/><col className="w-[26%]"/><col className="w-[18%]"/></colgroup><thead><tr><th className="p-2">Material / tipo</th><th className="p-2">Uso / revisão</th><th className="p-2">CA</th><th className="p-2">Ficha</th></tr></thead><tbody>{data.records.map(e=><tr key={e.id} className="border-b"><td className="break-words p-2">{e.code} — {e.name}<br/>{e.kind}</td><td className="p-2">{e.validityDays} / {e.reviewDays} dias</td><td className="break-words p-2">{e.ca||"Não aplicável"}<br/>{equipmentDate(e.caValidUntil,true)}</td><td className="p-2"><Link className="underline" href={`/sst/equipamentos/${e.id}`}>Abrir</Link></td></tr>)}</tbody></table>{!data.records.length&&<p>Nenhum equipamento encontrado.</p>}<ErpPagination page={data.page} total={data.total} pageSize={20} previousHref={href(data.page-1)} nextHref={href(data.page+1)}/>
  </div>;
}
