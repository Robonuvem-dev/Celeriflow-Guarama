import Link from "next/link";
import { getTenantContextForModule, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { searchSstPeople } from "@/db/repositories/sst/references";
import { sstDatabase } from "@/lib/sst/database";
import { readSstServiceOrderOptions } from "@/db/repositories/sst-pages/functional-options";
import { listServiceOrders } from "@/lib/sst/service-order-service";
import { SstRemoteTablePanel } from "../_components/SstRemoteTablePanel";
import { readPanelPage } from "../_components/read-panel-page";
import { sstColumn } from "../_components/operational-columns";
import { ResponsibilitiesTable } from "./ResponsibilitiesTable";
import { ServiceOrderEquipmentFields } from "./ServiceOrderEquipmentFields";
import { SstForm } from "../SstForm";
import { saveServiceOrder, saveTechnicalResponsibility } from "./actions";

function orderRows(records: Awaited<ReturnType<typeof listServiceOrders>>["records"]) {
  return records.map(r => ({ id: r.id, label: r.id, values: { id: r.id, scope: r.employeeId ? "Individual" : "GHE", startsAt: r.startsAt.toLocaleDateString("pt-BR"), endsAt: r.endsAt.toLocaleDateString("pt-BR"), status: r.revoked ? "Revogada" : "Emitida" }, links: [{ href: `/sst/ordens-servico/${r.id}`, label: "Abrir" }] }));
}
function responsibilityRows(records: Awaited<ReturnType<typeof readSstServiceOrderOptions>>["responsibilities"]) {
  return records.map(r => ({ id: r.id, person: r.snapshot.personName, kind: r.kind, revoked: r.revoked, startsAt: r.startsAt.toLocaleString("pt-BR"), endsAt: r.endsAt.toLocaleString("pt-BR") }));
}

export default async function ServiceOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const context = await getTenantContextForModule("SST");
  const database = sstDatabase(context), units = await listSstUnits(database, context);
  const unit = units.find((u) => u.id === params.budgetUnitId);
  const { records, total, page } = await listServiceOrders(context, params.budgetUnitId, Number(params.page));
  const {responsibilityCount,responsibilityPage,groups,programGroups,materials,responsibilities}=await readSstServiceOrderOptions(database,unit?.id,params);
  const people=params.personQ && params.personQ.trim().length >= 3 ? await searchSstPeople(database,params.personQ.trim()):[];
  async function loadOrdersPage(requestedPage: number) {
    "use server";
    return readPanelPage(async () => {
      const current = await getTenantContextForModule("SST");
      const next = await listServiceOrders(current, params.budgetUnitId, requestedPage);
      return { rows: orderRows(next.records), page: next.page, total: next.total };
    });
  }
  async function loadResponsibilitiesPage(requestedPage: number) {
    "use server";
    return readPanelPage(async () => {
      const current = await getTenantContextForModule("SST"), executor = sstDatabase(current);
      const allowedUnits = await listSstUnits(executor, current);
      const currentUnit = allowedUnits.find(candidate => candidate.id === params.budgetUnitId);
      const next = await readSstServiceOrderOptions(executor, currentUnit?.id, { ...params, responsibilityPage: String(requestedPage) });
      return { rows: responsibilityRows(next.responsibilities), page: next.responsibilityPage, total: next.responsibilityCount.total };
    });
  }
  const field = "block w-full rounded border p-2";
  const dates = <div className="grid gap-2 sm:grid-cols-2"><label>Início<input type="datetime-local" name="startsAt" required className={field}/></label><label>Fim exclusivo<input type="datetime-local" name="endsAt" required className={field}/></label></div>;
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Ordens de serviço e responsabilidade técnica</h1><Link href="/sst/vinculos" className="underline">Histórico funcional RH</Link><form className="grid gap-2 sm:grid-cols-3"><label>UG<select name="budgetUnitId" defaultValue={params.budgetUnitId} className={field}><option value="">Todas autorizadas</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Responsável no Cadastro Único<input name="personQ" defaultValue={params.personQ} minLength={3} className={field}/></label><label>Material canônico<input name="materialQ" defaultValue={params.materialQ} minLength={3} className={field}/></label><button className="rounded border p-2">Consultar</button></form>
    {unit && canPerformModuleOperation(context.user, "SST", "create") && <><details className="rounded border p-3"><summary>Cadastrar responsável ambiental/biológico</summary><SstForm action={saveTechnicalResponsibility}><input type="hidden" name="budgetUnitId" value={unit.id}/><label>Pessoa<select required name="personId" className={field}><option value="">Pesquise acima</option>{people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select></label><label>Tipo<select name="kind" className={field}><option value="ENVIRONMENTAL">Ambiental</option><option value="BIOLOGICAL">Biológico</option></select></label><label>GHE (vazio = UG)<select name="groupId" className={field}><option value="">Toda a UG</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>{dates}<label>Conselho<input name="council" required minLength={3} className={field}/></label><label>Ato/fonte da responsabilidade<input name="sourceReference" required minLength={10} className={field}/></label></SstForm></details>
    <details className="rounded border p-3"><summary>Emitir ordem de serviço</summary><SstForm action={saveServiceOrder} redirectBase="/sst/ordens-servico"><input type="hidden" name="budgetUnitId" value={unit.id}/><label>GHE e versão de riscos<select required name="programGroupId" className={field}><option value="">Selecione</option>{programGroups.map((g) => <option key={g.id} value={g.id}>{g.program.kind} {g.program.code} v{g.program.version} · {g.group.name}</option>)}</select></label><label>Responsável ambiental<select required name="responsibilityId" className={field}><option value="">Selecione</option>{responsibilities.filter((r) => r.kind === "ENVIRONMENTAL" && !r.revoked).map((r) => <option key={r.id} value={r.id}>{r.snapshot.personName} · {r.startsAt.toLocaleDateString("pt-BR")}</option>)}</select></label>{dates}<p>Para ordem coletiva, deixe servidor e período vazios. Ordem individual exige IDs do histórico RH compatível.</p><label>ID servidor individual<input name="employeeId" className={field}/></label><label>ID período funcional<input name="functionalPeriodId" className={field}/></label>{[["prevention", "Prevenção"], ["standards", "Normas"], ["accidentConduct", "Conduta em acidente"]].map(([name, label]) => <label key={name}>{label}<textarea name={name} required minLength={10} className={field}/></label>)}<label>Treinamentos requeridos (separados por ;)<textarea name="trainingRequirements" className={field}/></label><ServiceOrderEquipmentFields materials={materials} /></SstForm></details></>}
    <SstRemoteTablePanel title="Ordens de serviço" triggerLabel="Consultar ordens em tela cheia" description="Os formulários de emissão permanecem montados durante a consulta." preferenceId="sst-ordens-servico"
      columns={[sstColumn("id", "Ordem", 280, 140, "identifier"), sstColumn("scope", "Escopo", 130, 90), sstColumn("startsAt", "Início", 150, 100), sstColumn("endsAt", "Fim exclusivo", 150, 100), sstColumn("status", "Situação", 130, 90, "status"), sstColumn("actions", "Ficha", 80, 70, "actions")]}
      initial={{ rows: orderRows(records), page, total }} loadPageAction={loadOrdersPage} emptyMessage="Nenhuma ordem encontrada." />
    <ResponsibilitiesTable initial={{ rows: responsibilityRows(responsibilities), page: responsibilityPage, total: responsibilityCount.total }} loadPageAction={loadResponsibilitiesPage} canRevoke={canPerformModuleOperation(context.user, "SST", "update")} />
  </div>;
}
