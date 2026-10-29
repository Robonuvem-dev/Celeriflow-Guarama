import Link from "next/link";
import { getTenantContextForModule, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { clinicalDisciplines, disciplineInput, clinicalSnapshot } from "@/lib/sst/clinical-policy";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { searchSstWorkerPeople, readSstUserProfessionals, searchSstPageMedicines, readSstClinicalQuestionnaireOptions } from "@/db/repositories/sst-pages/clinical-options";
import { questionnaireQuestions } from "@/lib/sst/questionnaire-policy";
import { QuestionnaireForm } from "../questionarios/QuestionnaireForm";
import { ClinicalRecordForm } from "./ClinicalRecordForm";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { sstColumn } from "../_components/operational-columns";
import { SstNewLink } from "../_components/SstNewLink";
import { listClinicalRecords } from "@/lib/sst/clinical-service";

type Search = { discipline?: string; budgetUnitId?: string; personQ?: string; q?: string; medicineQ?: string; questionnaireVersionId?: string; templateQ?: string; page?: string; view?: string };
export default async function SstClinicalPage({ searchParams }: { searchParams: Promise<Search> }) {
  const context = await getTenantContextForModule("SST"); const params = await searchParams;
  const parsedDiscipline = disciplineInput.safeParse(params.discipline || "MEDICINE"); const discipline = parsedDiscipline.success ? parsedDiscipline.data : "MEDICINE";
  const n = Number(params.page);
  const { units, unit, total, page, records } = await listClinicalRecords(context, { discipline, budgetUnitId: params.budgetUnitId || "", q: params.q?.trim().slice(0, 200) || "", page: Number.isFinite(n) ? Math.max(1, Math.trunc(n)) : 1 });
  const database = sstDatabase(context);
  const writeUnit = unit ? (await listSstUnits(database, context, discipline, true)).find(candidate => candidate.id === unit.id) : null;
  const create = !!writeUnit && canPerformModuleOperation(context.user, "SST", "create");
  const people = create && (params.personQ || "").trim().length >= 3 ? await searchSstWorkerPeople(database, params.personQ!) : [];
  const professionals = create && unit ? await readSstUserProfessionals(database, unit.id, discipline, context.user.id, true) : [];
  const medicines = create && discipline === "MEDICINE" && (params.medicineQ || "").trim().length >= 3 ? await searchSstPageMedicines(database, params.medicineQ!) : [];
  const { versions, selected } = await readSstClinicalQuestionnaireOptions(database, unit?.id, discipline, params);
  if (params.view !== "manage") {
    const columns = [sstColumn("person", "Pessoa", 400, 180), sstColumn("attendedAt", "Atendimento", 230, 170), sstColumn("actions", "Ficha", 120, 110, "actions")];
    const values = Object.fromEntries(Object.entries({ ...params, discipline }).filter(([key]) => key !== "page" && key !== "view"));
    return <OperationalListFrame label="Prontuários ocupacionais por atuação" actions={<SstNewLink href={`/sst/prontuarios?${new URLSearchParams({ ...values, view: "manage" })}`}>Atendimento e questionários</SstNewLink>}
      toolbar={<><form method="GET" className={styles.searchForm}>{Object.entries(values).filter(([key]) => key !== "q").map(([key, value]) => <input key={key} type="hidden" name={key} value={value || ""} />)}<input name="q" aria-label="Pessoa na consulta" defaultValue={params.q} placeholder="Pessoa na consulta" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button></form><OperationalFilters activeCount={Number(!!params.budgetUnitId)}><form method="GET" className={styles.filterFields}>{Object.entries(values).filter(([key]) => key !== "discipline" && key !== "budgetUnitId").map(([key, value]) => <input key={key} type="hidden" name={key} value={value || ""} />)}<label>Atuação<select name="discipline" defaultValue={discipline}>{Object.entries(clinicalDisciplines).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>UG<select name="budgetUnitId" defaultValue={unit?.id || ""}><option value="">Todas autorizadas</option>{units.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className={styles.primaryButton}>Aplicar</button><Link href="/sst/prontuarios">Limpar</Link></form></OperationalFilters>{!units.length && <span role="status">Sem autorização clínica para esta atuação.</span>}</>}
      pagination={<OperationalLinkPagination page={page} total={total} pathname="/sst/prontuarios" values={values} />}>
      <OperationalTable columns={columns} preferenceId="sst-prontuarios" caption="Prontuários ocupacionais por atuação" emptyMessage="Nenhum atendimento encontrado." rows={records.map(record => ({ id: record.id, label: clinicalSnapshot.parse(record.snapshot).personName, values: { person: clinicalSnapshot.parse(record.snapshot).personName, attendedAt: record.attendedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) }, actions: <Link href={`/sst/prontuarios/${record.id}`}>Abrir ficha</Link> }))} />
    </OperationalListFrame>;
  }
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Prontuários ocupacionais por atuação</h1><Link href={`/sst/prontuarios?${new URLSearchParams({ discipline, budgetUnitId: params.budgetUnitId || "", q: params.q || "" })}`}>Voltar à listagem</Link><form className="grid gap-3 rounded border p-3 sm:grid-cols-2"><input type="hidden" name="view" value="manage" /><label>Atuação<select name="discipline" defaultValue={discipline} className="block w-full rounded border p-2">{Object.entries(clinicalDisciplines).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>UG<select name="budgetUnitId" defaultValue={unit?.id || ""} className="block w-full rounded border p-2"><option value="">Todas autorizadas</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{[["q","Pessoa na consulta"],["personQ","Pessoa para atendimento (3 letras)"],["medicineQ","Medicamento (3 letras)"],["templateQ","Título de questionário"]].map(([name,label]) => <label key={name}>{label}<input name={name} defaultValue={params[name as keyof Search]} className="block w-full rounded border p-2"/></label>)}<label>Versão do questionário<select name="questionnaireVersionId" defaultValue={selected?.id || ""} className="block w-full rounded border p-2"><option value="">Sem questionário</option>{versions.map((version) => <option key={version.id} value={version.id}>{version.title} v{version.version}</option>)}</select></label><button className="w-fit rounded border p-2">Carregar opções</button></form>
    {create && unit && <><details className="rounded border p-3"><summary>Novo questionário desta atuação</summary><QuestionnaireForm key={`${unit.id}:${discipline}`} budgetUnitId={unit.id} discipline={discipline}/></details><ClinicalRecordForm key={`${unit.id}:${discipline}:${params.personQ || ""}:${params.medicineQ || ""}:${selected?.id || ""}`} budgetUnitId={unit.id} discipline={discipline} people={people} professionals={professionals.map((role) => ({ id: role.id, name: role.person.fullName, council: role.council }))} medicines={medicines} questionnaire={selected ? { id: selected.id, questions: questionnaireQuestions.parse(selected.questions) } : undefined}/></>}
    {!units.length && <p>Sem autorização clínica para esta atuação. A administração configura habilitação e autorização em Profissionais.</p>}
    <section><h2 className="font-semibold">Questionários encontrados (até 20 por busca)</h2>{versions.map((version) => <p key={version.id}><Link className="underline" href={`/sst/questionarios/${version.id}`}>{version.title} v{version.version} · Consultar/imprimir</Link></p>)}</section>
  </div>;
}
