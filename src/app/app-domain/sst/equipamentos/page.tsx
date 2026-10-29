import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listEquipment } from "@/lib/sst/equipment-queries";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { sstColumn } from "../_components/operational-columns";
import { SstNewLink } from "../_components/SstNewLink";
import { SstForm } from "../SstForm";
import { saveEquipmentPolicy } from "./actions";
import { EquipmentCatalogForm } from "./EquipmentCatalogForm";
import { EquipmentNav,EquipmentField,equipmentControl as control,equipmentDate } from "./EquipmentUi";
import { sstDatabase } from "@/lib/sst/database";
import { readSstEquipmentCatalogOptions, findSstEquipmentPolicy } from "@/db/repositories/sst-pages/equipment";

export default async function EquipmentPage({searchParams}:{searchParams:Promise<{budgetUnitId?:string;q?:string;materialQ?:string;supplierQ?:string;page?:string;view?:string}>}) {
  const context=await getTenantContextForModule("SST"); const params=await searchParams;
  const data=await listEquipment(context,params); const unit=data.units.find(u=>u.id===params.budgetUnitId);
  const database=sstDatabase(context);
  const {materials,supplierRecords}=unit ? await readSstEquipmentCatalogOptions(database,params):{materials:[],supplierRecords:[]};
  const policy=unit ? await findSstEquipmentPolicy(database,unit.id):undefined;
  const suppliers=supplierRecords.map(s=>({id:s.id,name:s.person?.fullName||s.company?.corporateName||s.id}));
  if (params.view !== "manage") {
    const columns = [sstColumn("code", "Código", 100, 80, "identifier"), sstColumn("name", "Material", 240, 140), sstColumn("kind", "Tipo", 90, 70), sstColumn("validity", "Uso (dias)", 110, 90, "text", "right"), sstColumn("review", "Revisão (dias)", 130, 110, "text", "right"), sstColumn("ca", "CA", 150, 100), sstColumn("caValidUntil", "Validade CA", 130, 110), sstColumn("actions", "Ficha", 90, 80, "actions")];
    const values = { budgetUnitId: params.budgetUnitId, q: params.q, materialQ: params.materialQ, supplierQ: params.supplierQ };
    return <OperationalListFrame label="Equipamentos de proteção — EPI/EPC" actions={<SstNewLink href={`/sst/equipamentos?${new URLSearchParams({ budgetUnitId: params.budgetUnitId || "", materialQ: params.materialQ || "", supplierQ: params.supplierQ || "", view: "manage" })}`}>Cadastro e integração</SstNewLink>}
      toolbar={<><form method="GET" className={styles.searchForm}>{Object.entries(values).filter(([key]) => key !== "q").map(([key, value]) => <input type="hidden" key={key} name={key} value={value || ""} />)}<input name="q" aria-label="Busca no catálogo" defaultValue={params.q} placeholder="Buscar equipamento" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button></form><OperationalFilters activeCount={Number(!!params.budgetUnitId)}><form method="GET" className={styles.filterFields}><input type="hidden" name="q" value={params.q || ""} /><input type="hidden" name="materialQ" value={params.materialQ || ""} /><input type="hidden" name="supplierQ" value={params.supplierQ || ""} /><label>UG<select name="budgetUnitId" defaultValue={params.budgetUnitId}><option value="">Todas autorizadas</option>{data.units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><button className={styles.primaryButton}>Aplicar</button><Link href="/sst/equipamentos">Limpar</Link></form></OperationalFilters><OperationalFilters label="Equipamentos SST"><EquipmentNav /></OperationalFilters></>}
      pagination={<OperationalLinkPagination page={data.page} total={data.total} pathname="/sst/equipamentos" values={values} />}>
      <OperationalTable columns={columns} preferenceId="sst-equipamentos" caption="Equipamentos de proteção — EPI/EPC" emptyMessage="Nenhum equipamento encontrado." rows={data.records.map(e => ({ id: e.id, label: e.name, values: { code: e.code, name: e.name, kind: e.kind, validity: String(e.validityDays), review: String(e.reviewDays), ca: e.ca || "Não aplicável", caValidUntil: equipmentDate(e.caValidUntil, true) }, actions: <Link href={`/sst/equipamentos/${e.id}`}>Abrir</Link> }))} />
    </OperationalListFrame>;
  }
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Equipamentos de proteção — EPI/EPC</h1><EquipmentNav/>
    <Link href={`/sst/equipamentos?budgetUnitId=${encodeURIComponent(params.budgetUnitId || "")}`}>Voltar ao catálogo</Link>
    <form className="grid gap-3 sm:grid-cols-4"><input type="hidden" name="view" value="manage" /><EquipmentField label="UG"><select className={control} name="budgetUnitId" defaultValue={params.budgetUnitId}><option value="">Todas autorizadas</option>{data.units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></EquipmentField><EquipmentField label="Busca no catálogo"><input className={control} name="q" defaultValue={params.q}/></EquipmentField><EquipmentField label="Buscar material canônico (3 letras)"><input className={control} name="materialQ" defaultValue={params.materialQ}/></EquipmentField><button className="self-end rounded border p-2">Consultar</button></form>
    {unit && <><form className="flex flex-wrap gap-2"><input type="hidden" name="view" value="manage" /><input type="hidden" name="budgetUnitId" value={unit.id}/><input type="hidden" name="materialQ" value={params.materialQ||""}/><EquipmentField label="Buscar fornecedor por nome (3 letras, até 20)"><input name="supplierQ" defaultValue={params.supplierQ} className={control}/></EquipmentField><button className="self-end rounded border p-2">Carregar fornecedores</button></form><details className="rounded border p-3"><summary>Cadastrar complemento de material</summary><EquipmentCatalogForm budgetUnitId={unit.id} materials={materials} suppliers={suppliers}/></details>
    <details className="rounded border p-3"><summary>Parâmetro de integração com Almoxarifado</summary><SstForm action={saveEquipmentPolicy}><input type="hidden" name="budgetUnitId" value={unit.id}/><label><input type="checkbox" name="integrateStock" defaultChecked={policy?.integrateStock}/> Entregas desta UG geram saída real de estoque</label><p>Exige PATRIMONIO/create, depósito com centro de custo da secretaria e lote disponível. Baixa de uso nunca gera retorno automático.</p></SstForm></details></>}
    <p className="text-sm">Selecione uma UG para cadastrar.</p>
  </div>;
}
