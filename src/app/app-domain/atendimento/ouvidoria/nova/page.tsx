import Link from "next/link";
import { getAttendanceContext } from "@/lib/attendance/access";
import { createOmbudsman } from "../../actions";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { supportChannels } from "@/db/schema/attendance-portals";
import { ombudsmanReferenceCatalog } from "@/db/schema/ombudsman-reference-catalog";
import { departments as departmentTable } from "@/db/schema/administration";

export const dynamic = "force-dynamic";

export default async function NovaManifestacaoPage() {
  const context = await getAttendanceContext("edit");
  if (!context.attendanceAccess.isOmbudsman) throw new Error("Abertura de manifestacoes restrita a Ouvidoria.");
  const subjectSuggestions=await db.select().from(ombudsmanReferenceCatalog).where(eq(ombudsmanReferenceCatalog.isActive,true)).orderBy(asc(ombudsmanReferenceCatalog.name));
  const [channels, departments] = await Promise.all([
    db.select().from(supportChannels).where(eq(supportChannels.isActive, true)).orderBy(asc(supportChannels.sortOrder), asc(supportChannels.name)),
    db.select({ id: departmentTable.id, name: departmentTable.name }).from(departmentTable).where(eq(departmentTable.isActive, true)).orderBy(asc(departmentTable.name)),
  ]);
  return <div className="max-w-3xl space-y-6"><div><Link href="/atendimento/ouvidoria" className="text-sm text-violet-700">Voltar para Ouvidoria</Link><h1 className="text-2xl font-bold text-slate-900 mt-2">Nova Manifestação</h1><p className="text-slate-500">Registro interno com classificação de sigilo.</p></div><form action={createOmbudsman} className="bg-white border rounded-xl p-6 space-y-5"><div className="grid md:grid-cols-2 gap-4"><label className="field">Tipo *<select name="type" required className="input"><option>Denúncia</option><option>Reclamação</option><option>Sugestão</option><option>Elogio</option><option>Solicitação</option><option>Ocorrência</option></select></label><label className="field">Canal *<select name="channelId" required className="input">{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label><label className="field">Setor inicial<select name="departmentId" className="input"><option value="">Manter em triagem da Ouvidoria</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label className="field">Assunto *<input name="subject" required className="input" list="ombudsman-subjects" autoComplete="off"/><datalist id="ombudsman-subjects">{subjectSuggestions.filter(row=>row.kind==="SUBJECT").map(row=><option key={row.id} value={row.name}>{row.requestType}</option>)}</datalist></label></div><label className="field">Descrição *<textarea name="description" required rows={6} className="input resize-none" /></label><div className="flex flex-wrap gap-5"><label className="text-sm flex gap-2"><input type="checkbox" name="isAnonymous" /> Manifestação anônima</label><label className="text-sm flex gap-2"><input type="checkbox" name="isConfidential" /> Manifestação confidencial</label></div><div className="grid md:grid-cols-2 gap-4 bg-amber-50 border border-amber-200 p-4 rounded-lg"><label className="field">Nome do manifestante<input name="fullName" className="input" /></label><label className="field">CPF do manifestante<input name="cpf" className="input" /></label></div><div className="flex justify-end"><button className="px-4 py-2 bg-amber-600 text-white rounded-lg font-semibold">Registrar manifestação</button></div></form></div>;
}
