import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { budgetAppropriations } from "@/db/schema/finance-budget";
import { employees } from "@/db/schema/administration";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { referenceDefinitions, referenceKindSchema, listReferenceRecords } from "@/lib/rh/reference-records";
import { S1ActionForm } from "../../educacao/S1ActionForm";
import { savePersonnelReference, deletePersonnelReference } from "./actions";
export const dynamic = "force-dynamic";
export default async function PersonnelReferencePage({ searchParams }: { searchParams: Promise<{ kind?: string; id?: string; q?: string }> }) {
  const context = await getTenantContextForModule("RH");
  const database = context.database ?? db;
  const params = await searchParams;
  const requestedKind = referenceKindSchema.catch("FERIADO").parse(params.kind);
  const kind = requestedKind === "LICENCA_EDUCACAO" ? "FERIADO" : requestedKind;
  const definition = referenceDefinitions[kind];
  const [records, teams, ranges, workers, appropriations] = await Promise.all([listReferenceRecords(database, kind), listReferenceRecords(database, "EQUIPE"), listReferenceRecords(database, "FAIXA"), database.select({ id: employees.id, name: employees.name }).from(employees).orderBy(asc(employees.name)), database.select({id:budgetAppropriations.id,name:budgetAppropriations.code}).from(budgetAppropriations).orderBy(asc(budgetAppropriations.code))]);
  const selected = records.find(r => r.id === params.id);
  const q = (params.q || "").trim().toLocaleLowerCase("pt-BR");
  const rows = records.filter(r => !q || `${r.code} ${r.name} ${Object.values(r.details).join(" ")}`.toLocaleLowerCase("pt-BR").includes(q));
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Cadastros de RH e ponto · {definition.title}</h1>
    <section><h2 className="font-semibold">Relatórios do cadastro pessoal</h2><Link href="/rh/documentos">Contratos e decretos por servidor</Link><div className="flex flex-wrap gap-3">{([['CADASTRO_GERAL','Geral'],['CADASTRO_LOTACAO','Lotação'],['CADASTRO_LOCAL','Local de trabalho'],['CADASTRO_DOTACAO','Dotação orçamentária']] as const).flatMap(([report,label]) => (['PDF','XLSX','CSV'] as const).map(format => <a key={`${report}-${format}`} className="text-blue-700 underline" href={`/api/rh/relatorios?kind=${report}&format=${format}`}>{label} · {format}</a>))}</div></section>
    <nav className="flex flex-wrap gap-3">{referenceKindSchema.options.filter(k => k !== "LICENCA_EDUCACAO").map(k => <Link className="text-blue-700 underline" key={k} href={`/rh/cadastros?kind=${k}`}>{referenceDefinitions[k].title}</Link>)}</nav>
    <S1ActionForm key={selected?.id || kind} title={selected ? `Editar ${selected.name}` : "Novo cadastro"} submitLabel="Salvar" action={savePersonnelReference} fields={[
      { name: "kind", label: "Tipo", type: "hidden", defaultValue: kind }, { name: "id", label: "Identificador", type: "hidden", defaultValue: selected?.id },
      { name: "code", label: "Código", required: true, defaultValue: selected?.code }, { name: "name", label: "Nome", required: true, defaultValue: selected?.name },
      ...definition.fields.map(f => ({ name: f.name, label: f.label, required: true, type: f.options || ["teamId", "rangeId", "employeeId", "appropriationId"].includes(f.name) ? "select" as const : f.type || "text" as const, defaultValue: selected?.details[f.name], options: f.options?.map(value => ({ value, label: value })) || (f.name === "teamId" ? teams : f.name === "rangeId" ? ranges : f.name === "employeeId" ? workers : f.name === "appropriationId" ? appropriations : []).map(r => ({ value: r.id, label: r.name })) })),
    ]} />
    <form className="flex gap-2"><input type="hidden" name="kind" value={kind} /><input name="q" aria-label="Buscar cadastro" defaultValue={params.q} className="rounded border p-2" /><button>Buscar</button></form>
    <p>{rows.length} cadastro(s)</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Código</th><th>Nome</th>{definition.fields.map(f => <th key={f.name}>{f.label}</th>)}<th>Ações</th></tr></thead><tbody>{rows.map(r => <tr key={r.id} className="border-t"><td>{r.code}</td><td>{r.name}</td>{definition.fields.map(f => <td key={f.name}>{f.name === "teamId" ? teams.find(t => t.id === r.details[f.name])?.name : f.name === "rangeId" ? ranges.find(t => t.id === r.details[f.name])?.name : f.name === "appropriationId" ? appropriations.find(t => t.id === r.details[f.name])?.name : f.name === "employeeId" ? workers.find(t => t.id === r.details[f.name])?.name : r.details[f.name]}</td>)}<td><Link href={`/rh/cadastros?kind=${kind}&id=${r.id}`}>Editar</Link><form action={deletePersonnelReference}><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={r.id} /><button className="text-red-700">Excluir</button></form></td></tr>)}</tbody></table></div>
  </div>;
}
