import Link from "next/link";
import { ChevronDown, FolderTree, Headphones, Plus, Save, Settings2 } from "lucide-react";
import { getAttendanceContext } from "@/lib/attendance/access";
import { saveServiceSubject, saveSupportChannel } from "../actions";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { supportChannels, serviceSubjects } from "@/db/schema/attendance-portals";
import { departments as departmentTable } from "@/db/schema/administration";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function AtendimentoConfiguracoesPage() {
  const context = await getAttendanceContext("edit");
  if (!context.attendanceAccess.isManager) {
    throw new Error("Somente gestores podem configurar Atendimento.");
  }

  const [channels, subjects, departments] = await Promise.all([
    db.select().from(supportChannels).orderBy(asc(supportChannels.sortOrder), asc(supportChannels.name)),
    db.select().from(serviceSubjects).orderBy(asc(serviceSubjects.name)),
    db
      .select({ id: departmentTable.id, name: departmentTable.name })
      .from(departmentTable)
      .where(eq(departmentTable.isActive, true))
      .orderBy(asc(departmentTable.name)),
  ]);

  return (
    <PageFrame className="max-w-6xl space-y-5">
      <PageHeader
        title="Canais e Assuntos de Atendimento"
        icon={<Settings2 className="size-4 shrink-0 text-[#0e4c7e]" />}
        action={
          <Link
            href="/atendimento/cadastros"
            className="inline-flex h-7 items-center gap-1.5 rounded bg-[#0e4c7e] px-2.5 text-xs font-semibold text-white hover:bg-[#0a3a5f]"
          >
            <FolderTree className="size-3.5" />
            Catálogo da Ouvidoria
          </Link>
        }
      />

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[#0e4c7e]/10 text-[#0e4c7e]">
              <Headphones className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Canais de atendimento ({channels.length})</h2>
              <p className="text-xs text-slate-500">Meios de entrada utilizados na abertura de chamados e manifestações.</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <details open className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 bg-slate-100/80 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-800">
              <span className="flex items-center gap-1.5">
                <Plus className="size-4 text-[#0e4c7e]" />
                Adicionar novo canal de atendimento
              </span>
              <ChevronDown className="size-4 text-slate-500 transition-transform group-open:rotate-180" />
            </summary>
            <form action={saveSupportChannel} className="grid grid-cols-1 gap-3 border-t border-slate-200 bg-white p-4 md:grid-cols-12">
              <label className="field md:col-span-4">
                <span>Nome do canal *</span>
                <input name="name" required placeholder="Novo canal" className="input" />
              </label>
              <label className="field md:col-span-4">
                <span>Descrição</span>
                <input name="description" placeholder="Descrição" className="input" />
              </label>
              <label className="field md:col-span-2">
                <span>Ordem</span>
                <input name="sortOrder" type="number" min="0" defaultValue="0" className="input" />
              </label>
              <div className="flex items-end justify-between gap-2 md:col-span-2">
                <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                  <input name="isActive" type="checkbox" defaultChecked className="size-4 rounded border-slate-300" />
                  Ativo
                </label>
                <button className="portal-btn h-9 px-3 text-xs">Adicionar</button>
              </div>
            </form>
          </details>

          <div className="space-y-2">
            {channels.map((channel) => (
              <form
                action={saveSupportChannel}
                key={channel.id}
                className="grid grid-cols-1 items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/40 p-3.5 md:grid-cols-12"
              >
                <input type="hidden" name="id" value={channel.id} />
                <label className="field md:col-span-4">
                  <span>Canal</span>
                  <input name="name" required defaultValue={channel.name} className="input" />
                </label>
                <label className="field md:col-span-4">
                  <span>Descrição</span>
                  <input name="description" defaultValue={channel.description || ""} className="input" />
                </label>
                <label className="field md:col-span-2">
                  <span>Ordem</span>
                  <input name="sortOrder" type="number" min="0" defaultValue={channel.sortOrder} className="input" />
                </label>
                <div className="flex items-center justify-between gap-2 md:col-span-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                      name="isActive"
                      type="checkbox"
                      defaultChecked={channel.isActive}
                      className="size-4 rounded border-slate-300"
                    />
                    Ativo
                  </label>
                  <button className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100">
                    <Save className="size-3.5" />
                    Salvar
                  </button>
                </div>
              </form>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Assuntos de serviço e SLA ({subjects.length})</h2>
            <p className="text-xs text-slate-500">Define o setor responsável padrão, prioridade e prazo estimado em dias.</p>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <details open className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 bg-slate-100/80 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-800">
              <span className="flex items-center gap-1.5">
                <Plus className="size-4 text-[#0e4c7e]" />
                Adicionar assunto de serviço e SLA
              </span>
              <ChevronDown className="size-4 text-slate-500 transition-transform group-open:rotate-180" />
            </summary>
            <form action={saveServiceSubject} className="grid grid-cols-1 gap-3 border-t border-slate-200 bg-white p-4 md:grid-cols-12">
              <label className="field md:col-span-3">
                <span>Assunto *</span>
                <input name="name" required placeholder="Novo assunto" className="input" />
              </label>
              <label className="field md:col-span-3">
                <span>Setor padrão</span>
                <select name="defaultDepartmentId" className="input">
                  <option value="">Sem setor padrão</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field md:col-span-2">
                <span>Prioridade</span>
                <select name="defaultPriority" defaultValue="Normal" className="input">
                  <option>Baixa</option>
                  <option>Normal</option>
                  <option>Alta</option>
                  <option>Urgente</option>
                </select>
              </label>
              <label className="field md:col-span-2">
                <span>Prazo (dias)</span>
                <input name="defaultDueDays" type="number" min="1" placeholder="Prazo (dias)" className="input" />
              </label>
              <div className="flex items-end justify-between gap-2 md:col-span-2">
                <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                  <input name="isActive" type="checkbox" defaultChecked className="size-4 rounded border-slate-300" />
                  Ativo
                </label>
                <button className="portal-btn h-9 px-3 text-xs">Adicionar</button>
              </div>
            </form>
          </details>

          <div className="space-y-2">
            {subjects.map((subject) => (
              <form
                action={saveServiceSubject}
                key={subject.id}
                className="grid grid-cols-1 items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/40 p-3.5 md:grid-cols-12"
              >
                <input type="hidden" name="id" value={subject.id} />
                <label className="field md:col-span-3">
                  <span>Assunto</span>
                  <input name="name" required defaultValue={subject.name} className="input" />
                </label>
                <label className="field md:col-span-3">
                  <span>Setor padrão</span>
                  <select name="defaultDepartmentId" defaultValue={subject.defaultDepartmentId || ""} className="input">
                    <option value="">Sem setor padrão</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field md:col-span-2">
                  <span>Prioridade</span>
                  <select name="defaultPriority" defaultValue={subject.defaultPriority} className="input">
                    <option>Baixa</option>
                    <option>Normal</option>
                    <option>Alta</option>
                    <option>Urgente</option>
                  </select>
                </label>
                <label className="field md:col-span-2">
                  <span>Prazo (dias)</span>
                  <input
                    name="defaultDueDays"
                    type="number"
                    min="1"
                    defaultValue={subject.defaultDueDays || ""}
                    placeholder="Prazo (dias)"
                    className="input"
                  />
                </label>
                <div className="flex items-center justify-between gap-2 md:col-span-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                      name="isActive"
                      type="checkbox"
                      defaultChecked={subject.isActive}
                      className="size-4 rounded border-slate-300"
                    />
                    Ativo
                  </label>
                  <button className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100">
                    <Save className="size-3.5" />
                    Salvar
                  </button>
                </div>
              </form>
            ))}
          </div>
        </div>
      </section>
    </PageFrame>
  );
}
