import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { employees } from "@/db/schema/administration";
import { hrEmployeeDocuments } from "@/db/schema/personnel-reference-records";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listReferenceRecords } from "@/lib/rh/reference-records";
import { createEmployeeDocument } from "./actions";
import { PrintButton } from "./PrintButton";
export const dynamic = "force-dynamic";
export default async function EmployeeDocumentsPage({searchParams}:{searchParams:Promise<{employeeId?:string;id?:string}>}) {
 const context = await getTenantContextForModule("RH"); const database = context.database ?? db; const params = await searchParams;
 const [workers,templates,documents] = await Promise.all([database.select({id:employees.id,name:employees.name}).from(employees).orderBy(asc(employees.name)),listReferenceRecords(database,"MODELO_DOCUMENTO"),database.select().from(hrEmployeeDocuments).where(params.employeeId ? eq(hrEmployeeDocuments.employeeId,params.employeeId) : undefined).orderBy(desc(hrEmployeeDocuments.createdAt))]);
 const selected = documents.find(d=>d.id===params.id);
 return <div className="space-y-4 p-4"><div className="space-y-3 print:hidden"><h1 className="text-xl font-semibold">Contratos e decretos por servidor</h1><Link href="/rh/cadastros?kind=MODELO_DOCUMENTO">Cadastrar e editar modelos</Link><form action={createEmployeeDocument} className="flex flex-wrap gap-3"><label>Servidor<select name="employeeId" required defaultValue={params.employeeId}><option value="">Selecione</option>{workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label>Modelo<select name="templateId" required><option value="">Selecione</option>{templates.map(t=><option key={t.id} value={t.id}>{t.details.documentType} · {t.name}</option>)}</select></label><button>Gerar e salvar documento</button></form>
 <form><label>Consultar ficha do servidor<select name="employeeId" defaultValue={params.employeeId}><option value="">Todos</option>{workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><button>Consultar</button></form><ul>{documents.map(d=><li key={d.id}><Link href={`/rh/documentos?employeeId=${d.employeeId}&id=${d.id}`}>{workers.find(w=>w.id===d.employeeId)?.name} · {d.documentType} · {d.title} · {d.createdAt.toLocaleDateString("pt-BR")}</Link></li>)}</ul></div>
 {selected && <article className="space-y-3"><h2 className="text-lg font-semibold">{selected.title}</h2><pre className="whitespace-pre-wrap font-serif">{selected.body}</pre><PrintButton /></article>}</div>;
}
