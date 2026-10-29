import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { readSstSettingsPage } from "@/db/repositories/sst-pages/administration";
import { createSstReason, saveSstAccessGrant } from "../actions";
import { SstForm } from "../SstForm";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import Link from "next/link";
import { SstSelectionField } from "../_components/SstSelectionField";

export default async function SstSettingsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const database = sstDatabase(context), units = await listSstUnits(database, context);
  const admin = isSystemAdministrator(context.user);
  const { total, page, reasons, roles, regimes, users, grants } = await readSstSettingsPage(database, units.map(item => item.id), params.page, admin);
  const unitSelect = <label>Unidade gestora<select required name="budgetUnitId" className="block w-full rounded border p-2"><option value="">Selecione</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Configurações de atestados</h1>
    <SstForm action={createSstReason} label="Cadastrar motivo">{unitSelect}<div className="grid gap-3 sm:grid-cols-2"><label>Código<input required name="code" className="block w-full rounded border p-2"/></label><label>Descrição<input required name="name" className="block w-full rounded border p-2"/></label></div><label>Dependente<select name="dependentPolicy" className="block w-full rounded border p-2"><option value="DISABLED">Desabilitado</option><option value="OPTIONAL">Opcional</option><option value="REQUIRED">Obrigatório</option></select></label><label>Tipo de afastamento RH<input required name="leaveType" defaultValue="Licença médica" className="block w-full rounded border p-2"/></label><fieldset className="flex flex-wrap gap-4"><legend className="mb-2 font-semibold">Automatizações</legend>{[
      ["autoProtocol", "Gerar protocolo automaticamente", true], ["autoPresentedAt", "Registrar entrega automaticamente", true], ["printReceipt", "Abrir impressão do comprovante", false], ["suggestLeave", "Sugerir confirmação de afastamento", false], ["createLeaveOnApproval", "Gerar afastamento após perícia deferida", false],
    ].map(([name, label, checked]) => <label key={String(name)}><input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)} className="mr-2"/>{String(label)}</label>)}</fieldset><SstSelectionField title="Cargos impedidos de usar este motivo" name="restrictedRoleIds" options={roles} preferenceId="sst-motivo-cargos-edicao" /><SstSelectionField title="Regimes contratuais RH impedidos" name="restrictedRegimeIds" options={regimes} preferenceId="sst-motivo-regimes-edicao" /></SstForm>
    <section className="space-y-2 rounded border p-4"><h2 className="font-semibold">Motivos cadastrados</h2>{reasons.map((reason) => <p key={reason.id}>{reason.budgetUnit.name} · {reason.code} · {reason.name} · <Link className="underline" href={`/sst/configuracoes/${reason.id}`}>Editar / inativar</Link></p>)}<ErpPagination page={page} total={total} previousHref={`/sst/configuracoes?page=${page - 1}`} nextHref={`/sst/configuracoes?page=${page + 1}`}/></section>
    {admin && <><h2 className="text-lg font-semibold">Autorização clínica por usuário e unidade</h2><SstForm action={saveSstAccessGrant} label="Salvar autorização">{unitSelect}<label>Usuário<select required name="usuarioId" className="block w-full rounded border p-2"><option value="">Selecione</option>{users.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}</select></label><p>A autorização complementa as permissões do módulo SST e o acesso à UG. Não concede acesso ao SUS.</p>{[["canReadClinical", "Ler e registrar informações clínicas"], ["canAssess", "Registrar perícias"], ["isActive", "Autorização ativa"]].map(([name, label]) => <label key={name}><input type="checkbox" name={name} className="mr-2"/>{label}</label>)}</SstForm><section className="rounded border p-4"><h2 className="font-semibold">Autorizações existentes</h2>{grants.map((grant) => <p key={grant.id}>{users.find((user) => user.id === grant.usuarioId)?.nome || "Usuário inativo"} · {grant.budgetUnit.name} · {grant.isActive ? "Ativa" : "Inativa"} · Clínica: {grant.canReadClinical ? "Sim" : "Não"} · Perícia: {grant.canAssess ? "Sim" : "Não"}</p>)}</section></>}
  </div>;
}
