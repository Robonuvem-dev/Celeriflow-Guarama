import Link from "next/link";
import { and, asc, eq, ilike } from "drizzle-orm";
import { db } from "@/db/client";
import { processReferenceCatalog } from "@/db/schema/process-reference-catalog";
import { processSubjects } from "@/db/schema/processes";
import { getProtocolContext } from "@/lib/protocols/access";
import { processReferenceKinds } from "@/lib/protocols/reference-catalog";
import { saveProcessReference } from "./actions";
export const dynamic = "force-dynamic";
const input = "rounded border border-slate-300 p-2 text-sm";
function Fields({ record, kind, subjects }: { record?: typeof processReferenceCatalog.$inferSelect; kind: keyof typeof processReferenceKinds; subjects: { id: string; name: string }[] }) {
    return <><input type="hidden" name="kind" value={kind} />{record && <input type="hidden" name="id" value={record.id} />}<label>Descrição<input name="name" required maxLength={200} defaultValue={record?.name} className={input} /></label><label>Detalhes<input name="description" maxLength={2000} defaultValue={record?.description ?? ""} className={input} /></label><label>Assunto<select name="subjectId" required={kind === "SUBJECT_CHILD"} defaultValue={record?.subjectId ?? ""} className={input}><option value="">{kind === "SUBJECT_CHILD" ? "Selecione o assunto pai" : "Sem vínculo com assunto"}</option>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label><input name="isActive" type="checkbox" defaultChecked={record?.isActive ?? true} /> Ativo</label></>;
  }
export default async function ProcessReferencePage({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string }> }) {
  const context = await getProtocolContext();
  const database = context.database ?? db;
  const query = await searchParams;
  const kind = query.kind && Object.hasOwn(processReferenceKinds, query.kind) ? query.kind as keyof typeof processReferenceKinds : "SUBJECT_CHILD";
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 200) : "";
  const [records, subjects] = await Promise.all([
    database.select().from(processReferenceCatalog).where(and(eq(processReferenceCatalog.kind, kind), q ? ilike(processReferenceCatalog.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined)).orderBy(asc(processReferenceCatalog.name)),
    database.select({ id: processSubjects.id, name: processSubjects.name }).from(processSubjects).orderBy(asc(processSubjects.name)),
  ]);

  return <main className="space-y-5 p-4"><h1 className="text-xl font-bold">Cadastros de processos — {processReferenceKinds[kind]}</h1><nav className="flex flex-wrap gap-3">{Object.entries(processReferenceKinds).map(([value, label]) => <Link key={value} href={`/protocolos/cadastros?kind=${value}`} aria-current={value === kind ? "page" : undefined} className={input}>{label}</Link>)}</nav><form method="get" className="flex gap-2"><input type="hidden" name="kind" value={kind} /><input name="q" defaultValue={q} aria-label="Pesquisar descrição" className={input} /><button className={input}>Pesquisar</button><Link href={`/protocolos/cadastros?kind=${kind}`} className={input}>Limpar</Link></form>{context.protocolAccess.canCreate && <section className="rounded border p-4"><h2 className="font-semibold">Novo cadastro</h2><form action={saveProcessReference} className="flex flex-wrap items-end gap-3"><Fields kind={kind} subjects={subjects} /><button className={input}>Cadastrar</button></form></section>}<section className="space-y-3"><h2 className="font-semibold">Registros ({records.length})</h2>{records.map(record => context.protocolAccess.canUpdate ? <form key={record.id} action={saveProcessReference} className="flex flex-wrap items-end gap-3 rounded border p-3"><Fields record={record} kind={kind} subjects={subjects} /><button className={input}>Salvar</button></form> : <p key={record.id}>{record.name} — {record.isActive ? "Ativo" : "Inativo"}</p>)}{!records.length && <p>Nenhum registro encontrado.</p>}</section><Link href="/protocolos/processos">Voltar aos processos</Link></main>;
}
