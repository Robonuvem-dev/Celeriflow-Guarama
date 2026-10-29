import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { readSstExposurePage } from "@/db/repositories/sst-pages/administration";
import { SstForm } from "../SstForm";
import { createSstExposureGroup } from "./actions";
import { SstTablePanel } from "../_components/SstTablePanel";
import { SstRemoteTablePanel } from "../_components/SstRemoteTablePanel";
import { readPanelPage } from "../_components/read-panel-page";
import { sstColumn } from "../_components/operational-columns";
import { SstSelectionField } from "../_components/SstSelectionField";

function workerRows({ workers, roles, departments, groups }: Awaited<ReturnType<typeof readSstExposurePage>>) {
  return workers.map(worker => ({ id: worker.id, label: worker.name, values: { name: worker.name, registration: worker.registration || "—", role: roles.find(item => item.id === worker.roleId)?.name || "Não informado", department: departments.find(item => item.id === worker.departmentId)?.name || "Não informado", groups: groups.filter(group => (!group.roleIds.length || Boolean(worker.roleId && group.roleIds.includes(worker.roleId))) && (!group.departmentIds.length || Boolean(worker.departmentId && group.departmentIds.includes(worker.departmentId)))).map(group => group.code).join(", ") || "Sem GHE" } }));
}

export default async function SstExposurePage({ searchParams }: { searchParams: Promise<{ budgetUnitId?: string; groupId?: string; page?: string; groupPage?: string; without?: string; q?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const database = sstDatabase(context), units = await listSstUnits(database, context);
  const unit = units.find(item => item.id === params.budgetUnitId);
  const initial = await readSstExposurePage(database, unit, params, new Date());
  const { groups, departments, roles, total, page, groupPage } = initial;
  async function loadWorkersPage(requestedPage: number) {
    "use server";
    return readPanelPage(async () => {
      const current = await getTenantContextForModule("SST"), executor = sstDatabase(current);
      const allowedUnits = await listSstUnits(executor, current);
      const currentUnit = allowedUnits.find(candidate => candidate.id === params.budgetUnitId);
      const next = await readSstExposurePage(executor, currentUnit, { ...params, page: String(requestedPage) }, new Date());
      return { rows: workerRows(next), page: next.page, total: next.total };
    });
  }
  return <div className="space-y-4 p-4">
    <h1 className="text-xl font-semibold">Grupos homogêneos de exposição</h1>
    <p>Vínculos calculados automaticamente por lotação e pelo cadastro canônico de cargos/funções. Não é necessário associar cada servidor manualmente.</p>
    <form className="flex flex-wrap gap-2"><label>UG<select name="budgetUnitId" defaultValue={params.budgetUnitId} className="rounded border p-2"><option value="">Selecione a UG</option>{units.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>GHE<select name="groupId" defaultValue={params.groupId} className="rounded border p-2"><option value="">Todos os grupos</option>{groups.map(group => <option key={group.id} value={group.id}>{group.code} · {group.name}</option>)}</select></label><input aria-label="Servidor" name="q" defaultValue={params.q} placeholder="Servidor" className="rounded border p-2" /><label className="p-2"><input name="without" type="checkbox" value="1" defaultChecked={params.without === "1"} /> Apenas sem GHE</label><button className="rounded border p-2">Consultar</button></form>
    {unit && <details className="rounded border p-3"><summary>Cadastrar GHE</summary><SstForm action={createSstExposureGroup}><input type="hidden" name="budgetUnitId" value={unit.id} /><label>Código<input required name="code" className="block rounded border p-2" /></label><label>Descrição<input required name="name" className="block w-full rounded border p-2" /></label><label>Vigência inicial<input required name="startsAt" type="datetime-local" className="block rounded border p-2" /></label><label>Vigência final (opcional)<input name="endsAt" type="datetime-local" className="block rounded border p-2" /></label><SstSelectionField title="Locais de trabalho (vazio = todos da secretaria)" name="departmentIds" options={departments} preferenceId="sst-ghe-locais-edicao" /><SstSelectionField title="Cargos/funções (vazio = todos)" name="roleIds" options={roles} preferenceId="sst-ghe-cargos-edicao" /></SstForm></details>}
    <SstTablePanel title="GHEs vigentes" triggerLabel="Consultar grupos em tela cheia" description="O cadastro de GHE, incluindo seleção de cargos e locais, permanece montado durante as consultas." preferenceId="sst-ghe-grupos"
      columns={[sstColumn("code", "Código", 180, 100, "identifier"), sstColumn("name", "Grupo", 350, 160), sstColumn("departments", "Locais", 150, 90), sstColumn("roles", "Cargos/funções", 180, 100)]}
      rows={groups.map(group => ({ id: group.id, label: group.name, values: { code: group.code, name: group.name, departments: String(group.departmentIds.length || "Todos"), roles: String(group.roleIds.length || "Todos") } }))} initialPage={groupPage} />
    <SstRemoteTablePanel title="Servidores por GHE" triggerLabel="Consultar servidores em tela cheia" preferenceId="sst-ghe-servidores"
      columns={[sstColumn("name", "Servidor", 280, 140), sstColumn("registration", "Matrícula", 130, 90, "identifier"), sstColumn("role", "Cargo/função", 210, 110), sstColumn("department", "Local", 210, 110), sstColumn("groups", "Grupos atuais", 240, 120)]}
      initial={{ rows: workerRows(initial), page, total }} loadPageAction={loadWorkersPage} />
  </div>;
}
