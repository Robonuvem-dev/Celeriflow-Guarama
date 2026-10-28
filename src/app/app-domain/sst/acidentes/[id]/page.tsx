import Link from "next/link";
import { getTenantContextForModule, AccessError } from "@/lib/platform/tenant-context";
import { readCat, listAccidentEvidence, readAccidentLedger, readAccidentState } from "@/lib/sst/accident-service";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { assertDisciplineAccess } from "@/lib/sst/clinical-access";
import { EvidenceForm } from "../EvidenceForm";
import { RepeatableSstForm as SstForm } from "../RepeatableSstForm";
import { saveLedger } from "../actions";
import { readLatestCatLayout, catLayoutCanonicalDefaults } from "@/lib/sst/accident-layout-service";
import { CatLayoutForm } from "../CatLayoutForm";
import { searchSstPeople } from "@/db/repositories/sst/references";
import { readSstAccidentClinicalOptions } from "@/db/repositories/sst-pages/accidents";
import { sstDatabase } from "@/lib/sst/database";
export default async function CatPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; person?: string }> }) {
  const context = await getTenantContextForModule("SST"), { id } = await params, cat = await readCat(context, id);
  let clinical = false;
  try { await assertDisciplineAccess(context, cat.budgetUnitId, "MEDICINE"); clinical = true; } catch (e) { if (!(e instanceof AccessError)) throw e; }
  const search = await searchParams;
  const [history, ledger] = await Promise.all([listAccidentEvidence(context, id, Number(search.page || 1), clinical), readAccidentLedger(context, id)]);
  const database = sstDatabase(context);
  const people = (search.person || "").trim().length >= 3 ? await searchSstPeople(database, search.person!.trim()) : [];
  const {doctors,attendances} = clinical ? await readSstAccidentClinicalOptions(database,id,cat.budgetUnitId) : {doctors:[],attendances:[]};
  const evidence = history.rows;
  const state = await readAccidentState(context, id), closed = state.homologated;
  const layout = cat.kind !== "INCIDENT" ? await readLatestCatLayout(context,id,clinical) : null;
  const canonical = cat.kind !== "INCIDENT" ? await catLayoutCanonicalDefaults(context,id) : null;
  return <main className="space-y-4 p-4"><h1 className="text-xl font-semibold">CAT / incidente — {cat.snapshot.employeeName}</h1><p>{closed ? "Homologada" : "Em investigação"} · {cat.kind} · {cat.source}</p>
    <Link href={`/sst/acidentes/${id}/imprimir`}>Relatório conjunto / impressão</Link>
    {cat.kind !== "INCIDENT" && <section className="space-y-3"><h2 className="font-semibold">CAT no formulário oficial INSS</h2>{layout && <a className="underline" href={`/sst/acidentes/${id}/imprimir/inss`} target="_blank" rel="noreferrer">Abrir PDF INSS preenchido — revisão {layout.layout.version}</a>}<details><summary>Preencher / revisar os campos INSS</summary><CatLayoutForm key={layout?.layout.id || "initial"} catId={id} version={layout?.layout.version || 0} fields={{ ...canonical?.fields, ...layout?.layout.fields }} medicalFields={layout?.medical?.fields || {}} medicalEvidenceId={layout?.medical?.medicalEvidenceId || ""} clinical={clinical} attendances={attendances.map(a => ({ id:a.id,label:`Atendimento ${a.createdAt.toLocaleString("pt-BR")} · ${a.id}` }))} /></details></section>}
    <dl className="grid gap-2">{Object.entries(cat.data).filter(([k]) => !["submissionKey","employeeId","budgetUnitId"].includes(k)).map(([k,v]) => <div key={k}><dt className="font-semibold">{k}</dt><dd className="whitespace-pre-wrap break-words">{typeof v === "string" ? v : JSON.stringify(v)}</dd></div>)}</dl>
    <h2 className="font-semibold">Evidências e revisões</h2>{evidence.map(e => <section key={e.id} className="rounded border p-3"><h3>{e.kind} · revisão {e.version} · {e.approved ? "Favorável" : "Registrado"}</h3><pre className="whitespace-pre-wrap break-words text-sm">{JSON.stringify(e.data, null, 2)}</pre></section>)}
    <ErpPagination page={history.page} total={history.total} pageSize={20} previousHref={`/sst/acidentes/${id}?page=${history.page - 1}`} nextHref={`/sst/acidentes/${id}?page=${history.page + 1}`} jumpTo={{ pathname: `/sst/acidentes/${id}` }} />
    {!clinical && <p>Dados da investigação, atendimento e parecer médico exigem autorização clínica de Medicina.</p>}
    {!closed && <><form className="flex gap-2"><input name="person" placeholder="Buscar responsável técnico (3 letras)" minLength={3} required defaultValue={search.person || ""} className="rounded border p-2" /><button>Buscar no Cadastro Único</button></form><EvidenceForm catId={id} clinical={clinical} version={state.version} people={people} doctors={doctors} /></>}
    <h2 className="font-semibold">Despesas e reembolsos — registro financeiro de controle, sem executar pagamento</h2>
    {ledger.map(l => <p key={l.id}>{l.kind} · R$ {l.amount} · {l.description} · referência {l.id}</p>)}
    <SstForm action={saveLedger}><input type="hidden" name="catId" value={id} /><label>Tipo<select name="kind"><option value="EXPENSE">Despesa</option><option value="REIMBURSEMENT">Reembolso</option></select></label><label>Valor decimal<input name="amount" required placeholder="125.50" pattern="[0-9]+\.[0-9]{2}" /></label><label>Descrição<input name="description" required /></label><label>Despesa de origem (ID para reembolso)<input name="expenseId" /></label></SstForm>
  </main>;
}
