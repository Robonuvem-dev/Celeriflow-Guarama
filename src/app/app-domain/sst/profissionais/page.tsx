import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { searchSstPeople } from "@/db/repositories/sst/references";
import { sstDatabase } from "@/lib/sst/database";
import { readSstProfessionalsPage } from "@/db/repositories/sst-pages/administration";
import { clinicalDisciplines, disciplineInput } from "@/lib/sst/clinical-policy";
import { formatSstCivilDate } from "@/lib/sst/aso-policy";
import { SstForm } from "../SstForm";
import { saveSstProfessional, saveSstDisciplineGrant } from "./actions";
import { ProfessionalManagementTable } from "./ProfessionalManagementTable";
import { readPanelPage } from "../_components/read-panel-page";
import Link from "next/link";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { sstColumn } from "../_components/operational-columns";
import { SstNewLink } from "../_components/SstNewLink";

function professionalManagementRows(records: Awaited<ReturnType<typeof readSstProfessionalsPage>>["records"]) {
  return records.map(record => ({ id: record.id, name: record.person.fullName, discipline: clinicalDisciplines[disciplineInput.parse(record.discipline)], council: record.council, period: `${formatSstCivilDate(record.startsAt)} — ${formatSstCivilDate(record.endsAt)}`, active: record.isActive }));
}

export default async function SstProfessionalsPage({ searchParams }: { searchParams: Promise<{ budgetUnitId?: string; personQ?: string; page?: string; view?: string; target?: string }> }) {
  const context = await getTenantContextForModule("SST"); const params = await searchParams;
  const admin = isSystemAdministrator(context.user);
  const database = sstDatabase(context), units = await listSstUnits(database, context);
  const unit = units.find((item) => item.id === params.budgetUnitId);
  const people = admin && unit && (params.personQ || "").trim().length >= 3 ? await searchSstPeople(database, params.personQ!.trim().slice(0, 200)) : [];
  const { users, total, page, records } = await readSstProfessionalsPage(database, params.budgetUnitId ? unit ? [unit.id] : [] : units.map(item => item.id), params.page, admin);
  async function loadManagementPage(requestedPage: number) {
    "use server";
    return readPanelPage(async () => {
      const current = await getTenantContextForModule("SST"), executor = sstDatabase(current);
      const allowed = await listSstUnits(executor, current);
      const currentUnit = allowed.find(candidate => candidate.id === params.budgetUnitId);
      const next = await readSstProfessionalsPage(executor, params.budgetUnitId ? currentUnit ? [currentUnit.id] : [] : allowed.map(item => item.id), String(requestedPage), isSystemAdministrator(current.user));
      return { rows: professionalManagementRows(next.records), page: next.page, total: next.total };
    });
  }
  const disciplineSelect = <label>Atuação<select required name="discipline" className="block w-full rounded border p-2">{Object.entries(clinicalDisciplines).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>;
  const userSelect = <label>Usuário registrador<select name="usuarioId" className="block w-full rounded border p-2"><option value="">Profissional externo sem conta vinculada</option>{users.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}</select></label>;
  if (params.view !== "manage") {
    const columns = [sstColumn("name", "Profissional", 260, 150), sstColumn("discipline", "Atuação", 150, 110), sstColumn("council", "Conselho", 160, 100), sstColumn("period", "Vigência", 220, 185), sstColumn("status", "Situação", 100, 80, "status"), sstColumn("actions", "Ações", 130, 120, "actions")];
    return <OperationalListFrame label="Habilitação profissional ocupacional" actions={admin && <SstNewLink href={`/sst/profissionais?${new URLSearchParams({ budgetUnitId: params.budgetUnitId || "", personQ: params.personQ || "", view: "manage" })}`}>Habilitações e autorizações</SstNewLink>}
      toolbar={<OperationalFilters label="Unidade gestora" activeCount={Number(!!params.budgetUnitId)}><form method="GET" className={styles.filterFields}><label>UG<select name="budgetUnitId" defaultValue={params.budgetUnitId}><option value="">Todas as UGs autorizadas</option>{units.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><input type="hidden" name="personQ" value={params.personQ || ""} /><button className={styles.primaryButton}>Aplicar</button><Link href="/sst/profissionais">Limpar</Link></form></OperationalFilters>}
      pagination={<OperationalLinkPagination page={page} total={total} pathname="/sst/profissionais" values={{ budgetUnitId: params.budgetUnitId, personQ: params.personQ }} />}>
      <OperationalTable columns={columns} preferenceId="sst-profissionais" caption="Habilitação profissional ocupacional" emptyMessage="Nenhuma habilitação encontrada." rows={records.map(record => ({ id: record.id, label: record.person.fullName, values: { name: record.person.fullName, discipline: clinicalDisciplines[disciplineInput.parse(record.discipline)], council: record.council, period: `${formatSstCivilDate(record.startsAt)} — ${formatSstCivilDate(record.endsAt)}`, status: record.isActive ? "Ativa" : "Inativa" }, actions: admin && record.isActive ? <Link href={`/sst/profissionais?${new URLSearchParams({ view: "manage", budgetUnitId: params.budgetUnitId || "", page: String(page), target: record.id })}#professional-${record.id}`}>Gerir habilitação</Link> : undefined }))} />
    </OperationalListFrame>;
  }
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Habilitação profissional ocupacional</h1><Link href={`/sst/profissionais?budgetUnitId=${encodeURIComponent(params.budgetUnitId || "")}`}>Voltar à listagem</Link><form className="flex flex-wrap gap-2"><input type="hidden" name="view" value="manage" /><select aria-label="UG" name="budgetUnitId" defaultValue={params.budgetUnitId} className="rounded border p-2"><option value="">Todas as UGs autorizadas</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input aria-label="Profissional" name="personQ" defaultValue={params.personQ} placeholder="Nome no Cadastro Único (3 letras)" className="rounded border p-2"/><button className="rounded border p-2">Carregar</button></form>
    {admin && unit && <><SstForm action={saveSstProfessional} label="Cadastrar habilitação"><input type="hidden" name="budgetUnitId" value={unit.id}/><label>Pessoa<select required name="personId" className="block w-full rounded border p-2"><option value="">Selecione</option>{people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label>{disciplineSelect}{userSelect}<label>Conselho/UF/número<input required name="council" minLength={3} className="block w-full rounded border p-2"/></label><label>Vigência inicial<input type="date" required name="startsAt" className="block rounded border p-2"/></label><label>Vigência final<input type="date" required name="endsAt" className="block rounded border p-2"/></label></SstForm><SstForm action={saveSstDisciplineGrant} label="Salvar autorização por atuação"><input type="hidden" name="budgetUnitId" value={unit.id}/>{disciplineSelect}{userSelect}<p>Selecionar usuário é obrigatório. A autorização complementa SST, UG e autorização clínica geral.</p>{[["canRead", "Leitura"], ["canWrite", "Gravação"], ["isActive", "Ativa"]].map(([name, label]) => <label key={name}><input type="checkbox" name={name} className="mr-2"/>{label}</label>)}</SstForm></>}
    <ProfessionalManagementTable initial={{ rows: professionalManagementRows(records), page, total }} loadPageAction={loadManagementPage} canInactivate={admin} initialSelectedId={params.target} />
  </div>;
}
