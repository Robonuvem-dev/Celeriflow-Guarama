import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { getProtocolContext } from "@/lib/protocols/access";
import { createProtocol } from "../../actions";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { db } from "@/db/client";
import { and, asc, eq, inArray } from "drizzle-orm";
import { processTypes, processSubjects } from "@/db/schema/processes";
import { people } from "@/db/schema/people";
import { companies } from "@/db/schema/registry";
import { departments } from "@/db/schema/administration";
import { processReferenceCatalog } from "@/db/schema/process-reference-catalog";

export const dynamic = "force-dynamic";

export default async function NovoProtocoloPage() {
  await getProtocolContext("edit");
  // Buscar os tipos de processo e pessoas para o formulário
  const types = await db.select({ id: processTypes.id, name: processTypes.name }).from(processTypes).where(eq(processTypes.isActive, true));
  const subjects = types.length ? await db.select({ id: processSubjects.id, name: processSubjects.name, processTypeId: processSubjects.processTypeId }).from(processSubjects).where(and(eq(processSubjects.isActive, true), inArray(processSubjects.processTypeId, types.map(type => type.id)))) : [];
  const tiposProcesso = types.map(type => ({ ...type, subjects: subjects.filter(subject => subject.processTypeId === type.id) }));
  
  const pessoas = await db.select({ id: people.id, fullName: people.fullName, cpf: people.cpf }).from(people).where(eq(people.status, "Ativo")).limit(100);
  const empresas = await db.select({ id: companies.id, corporateName: companies.corporateName, cnpj: companies.cnpj }).from(companies).where(eq(companies.status, "Ativo")).orderBy(asc(companies.corporateName)).limit(100);
  const departamentos = await db.select({ id: departments.id, name: departments.name }).from(departments).where(eq(departments.isActive, true)).orderBy(asc(departments.name));
  const otherApplicants = await db.select({id:processReferenceCatalog.id,name:processReferenceCatalog.name}).from(processReferenceCatalog).where(and(eq(processReferenceCatalog.kind,"OTHER_APPLICANT"),eq(processReferenceCatalog.isActive,true))).orderBy(asc(processReferenceCatalog.name));

  return (
    <PageFrame className="max-w-5xl space-y-2">
      <PageHeader title="Novo Protocolo" action={<Link href="/protocolos/processos" aria-label="Voltar" className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ArrowLeft className="size-3.5" /><span className="hidden sm:inline">Voltar</span></Link>} />
      <p className="text-xs text-slate-500">Abra um novo processo digital e encaminhe para o setor responsável.</p>

      <form action={createProtocol} className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="space-y-5 p-3 md:p-4">
          
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-2">1. Identificação</h3>
            
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 block">Interessado (Pessoa física)</label>
                <select name="personId" className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-all">
                  <option value="">Selecione um interessado</option>
                  {pessoas.map(p => (
                    <option key={p.id} value={p.id}>{p.fullName} (CPF: {p.cpf})</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Selecione pessoa física ou empresa, quando aplicável.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 block">Interessado (Pessoa jurídica)</label>
                <select name="companyId" className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-all">
                  <option value="">Selecione uma empresa</option>
                  {empresas.map(empresa => (
                    <option key={empresa.id} value={empresa.id}>{empresa.corporateName} (CNPJ: {empresa.cnpj})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2"><label className="block text-sm font-semibold text-slate-700">Outro requerente<select name="otherApplicantId" className="w-full rounded-lg border p-2 text-sm"><option value="">Sem outro requerente</option>{otherApplicants.map(applicant=><option key={applicant.id} value={applicant.id}>{applicant.name}</option>)}</select></label><Link href="/protocolos/cadastros?kind=OTHER_APPLICANT" className="text-xs underline">Cadastrar outro requerente</Link></div>
              <div className="space-y-2"><label className="block text-sm font-semibold text-slate-700">Representante do requerente<select name="representativePersonId" className="w-full rounded-lg border p-2 text-sm"><option value="">Sem representante</option>{pessoas.map(person => <option key={person.id} value={person.id}>{person.fullName} (CPF: {person.cpf})</option>)}</select></label></div>
              <div className="space-y-2"><label className="block text-sm font-semibold text-slate-700">Valor do processo (opcional)<input name="declaredValue" type="number" min="0" max="9999999999999999.99" step="0.01" className="w-full rounded-lg border p-2 text-sm" /></label></div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 block">Tipo de Processo *</label>
                <select name="processTypeId" required className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-all">
                  <option value="">Selecione o tipo</option>
                  {tiposProcesso.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 block">Assunto *</label>
                <select name="subjectId" required className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-all">
                  <option value="">Selecione o assunto</option>
                  {tiposProcesso.map(t => 
                    t.subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({t.name})</option>
                    ))
                  )}
                </select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 block">Prioridade</label>
                <select name="priority" className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-all">
                  <option value="">Usar prioridade configurada</option>
                  <option value="Normal">Normal</option>
                  <option value="Alta">Alta</option>
                  <option value="Urgente">Urgente</option>
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-700 block">Setor inicial</label>
                <select name="initialDepartmentId" className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-all">
                  <option value="">Usar setor configurado no Tipo ou Assunto</option>
                  {departamentos.map(departamento => (
                    <option key={departamento.id} value={departamento.id}>{departamento.name}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Obrigatório quando o Tipo e o Assunto não possuem setor inicial configurado.</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-100 pb-2">2. Descrição da Solicitação</h3>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 block">Descrição Inicial</label>
              <textarea 
                name="description"
                rows={5}
                placeholder="Descreva detalhadamente o motivo da abertura do processo..."
                className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-all resize-none"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Anexos serão disponibilizados na próxima etapa operacional, após a abertura do protocolo.
          </div>

        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 p-3">
          <Link href="/protocolos/processos" className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors">
            Cancelar
          </Link>
          <button type="submit" className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-sm flex items-center gap-2 transition-colors">
            <Save className="w-4 h-4" />
            Gerar Protocolo
          </button>
        </div>
      </form>
    </PageFrame>
  );
}
