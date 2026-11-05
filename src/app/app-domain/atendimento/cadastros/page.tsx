import Link from "next/link";
import { asc } from "drizzle-orm";
import { ChevronDown, FolderTree, Layers, Plus, Save, Search, Settings2 } from "lucide-react";
import { db } from "@/db/client";
import { ombudsmanReferenceCatalog as catalog } from "@/db/schema/ombudsman-reference-catalog";
import { getAttendanceContext } from "@/lib/attendance/access";
import { ombudsmanReferenceKinds, ombudsmanRequestTypes } from "@/lib/attendance/reference-catalog";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { saveOmbudsmanReference } from "./actions";

export const dynamic = "force-dynamic";

type RecordData = typeof catalog.$inferSelect;

function ReferenceFields({
  kind,
  record,
  records,
}: {
  kind: keyof typeof ombudsmanReferenceKinds;
  record?: RecordData;
  records: RecordData[];
}) {
  return (
    <div className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={record?.id ?? ""} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <label className="field">
          <span>Tipo de solicitação <span className="text-red-600">*</span></span>
          <select name="requestType" defaultValue={record?.requestType ?? "Solicitação"} className="input">
            {ombudsmanRequestTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label className={kind === "SUBJECT" ? "field md:col-span-2" : "field md:col-span-1 lg:col-span-2"}>
          <span>Descrição / Nome do item <span className="text-red-600">*</span></span>
          <input
            name="name"
            required
            maxLength={200}
            defaultValue={record?.name}
            placeholder={
              kind === "SUBJECT"
                ? "Ex.: Rua e Bairro, Lixo e Limpeza, Iluminação Pública"
                : kind === "SUBSUBJECT"
                  ? "Ex.: Tapa-buraco, Varrição, Limpeza de bueiros"
                  : "Ex.: Demanda atendida no local, Sem competência municipal"
            }
            className="input"
          />
        </label>

        {kind !== "SUBJECT" && (
          <label className="field md:col-span-2 lg:col-span-2">
            <span>Assunto vinculado <span className="text-red-600">*</span></span>
            <select name="subjectId" required defaultValue={record?.subjectId ?? ""} className="input">
              <option value="">Selecione assunto do tipo informado</option>
              {records
                .filter((row) => row.kind === "SUBJECT")
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.requestType} — {row.name}
                  </option>
                ))}
            </select>
          </label>
        )}

        {kind === "JUSTIFICATION" && (
          <label className="field md:col-span-2 lg:col-span-3">
            <span>Subassunto vinculado <span className="text-red-600">*</span></span>
            <select name="subsubjectId" required defaultValue={record?.subsubjectId ?? ""} className="input">
              <option value="">Selecione subassunto</option>
              {records
                .filter((row) => row.kind === "SUBSUBJECT")
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.requestType} — {records.find((parent) => parent.id === row.subjectId)?.name} — {row.name}
                  </option>
                ))}
            </select>
          </label>
        )}

        {kind === "SUBSUBJECT" && (
          <label className="field md:col-span-2 lg:col-span-3">
            <span>Informação e instruções do serviço ao cidadão</span>
            <textarea
              name="serviceInformation"
              rows={2}
              maxLength={4000}
              defaultValue={record?.serviceInformation ?? ""}
              placeholder="Instruções exibidas no portal quando o cidadão selecionar este subassunto..."
              className="input resize-y"
            />
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center gap-5">
          {kind === "SUBSUBJECT" && (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  name="isAnonymous"
                  type="checkbox"
                  defaultChecked={record?.isAnonymous ?? true}
                  className="size-4 rounded border-slate-300 text-[#0e4c7e]"
                />
                Permite manifestação anônima
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  name="isOnline"
                  type="checkbox"
                  defaultChecked={record?.isOnline ?? true}
                  className="size-4 rounded border-slate-300 text-[#0e4c7e]"
                />
                Disponível on-line (Portal)
              </label>
            </>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              name="isActive"
              type="checkbox"
              defaultChecked={record?.isActive ?? true}
              className="size-4 rounded border-slate-300 text-[#0e4c7e]"
            />
            Ativo
          </label>
        </div>

        <button className="portal-btn h-8 cursor-pointer px-4 text-xs">
          <Save className="size-3.5" />
          {record ? "Salvar" : "Cadastrar"}
        </button>
      </div>
    </div>
  );
}

export default async function OmbudsmanCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string }>;
}) {
  const context = await getAttendanceContext("edit");
  if (!context.attendanceAccess.isManager) {
    throw new Error("Somente gestores podem configurar Atendimento.");
  }
  const database = context.database ?? db;
  const query = await searchParams;
  const kind =
    query.kind && Object.hasOwn(ombudsmanReferenceKinds, query.kind)
      ? (query.kind as keyof typeof ombudsmanReferenceKinds)
      : "SUBJECT";
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 200) : "";

  const records = await database
    .select()
    .from(catalog)
    .orderBy(asc(catalog.requestType), asc(catalog.name))
    .catch(() => []);

  const visible = records.filter(
    (row) =>
      row.kind === kind &&
      (!q || `${row.name} ${row.requestType}`.toLocaleLowerCase("pt-BR").includes(q.toLocaleLowerCase("pt-BR"))),
  );

  const counts = {
    SUBJECT: records.filter((r) => r.kind === "SUBJECT").length,
    SUBSUBJECT: records.filter((r) => r.kind === "SUBSUBJECT").length,
    JUSTIFICATION: records.filter((r) => r.kind === "JUSTIFICATION").length,
  };

  return (
    <PageFrame className="max-w-6xl space-y-4">
      <PageHeader
        title={`Ouvidoria — ${ombudsmanReferenceKinds[kind]}`}
        icon={<FolderTree className="size-4 shrink-0 text-[#0e4c7e]" />}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/atendimento/configuracoes"
              className="inline-flex h-7 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Settings2 className="size-3.5" />
              Canais e assuntos de atendimento
            </Link>
            <Link
              href="/atendimento/cadastros/configuracoes"
              className="inline-flex h-7 items-center gap-1.5 rounded bg-[#0e4c7e] px-2.5 text-xs font-semibold text-white hover:bg-[#0a3a5f]"
            >
              <Layers className="size-3.5" />
              Roteiros, questionários e situações
            </Link>
          </div>
        }
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
          <nav aria-label="Categorias do catálogo" className="flex flex-wrap gap-2">
            {(Object.entries(ombudsmanReferenceKinds) as [keyof typeof ombudsmanReferenceKinds, string][]).map(
              ([value, label]) => {
                const active = kind === value;
                return (
                  <Link
                    key={value}
                    href={`/atendimento/cadastros?kind=${value}`}
                    className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
                      active
                        ? "bg-[#0e4c7e] text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span>{label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                        active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {counts[value]}
                    </span>
                  </Link>
                );
              },
            )}
          </nav>

          <form method="get" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="kind" value={kind} />
            <div className="relative">
              <input
                name="q"
                aria-label="Descrição ou tipo"
                defaultValue={q}
                placeholder="Filtrar por nome ou tipo..."
                className="h-9 w-60 rounded-lg border border-slate-300 bg-white pl-3 pr-3 text-xs text-slate-800"
              />
            </div>
            <button className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white hover:bg-slate-900">
              <Search className="size-3.5" />
              Pesquisar
            </button>
            {q && (
              <Link
                href={`/atendimento/cadastros?kind=${kind}`}
                className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Limpar
              </Link>
            )}
          </form>
        </div>

        <div className="p-4 sm:p-5">
          <details open className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 bg-slate-100/80 px-4 py-3 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-200/60">
              <span className="flex items-center gap-2">
                <Plus className="size-4 text-[#0e4c7e]" />
                Novo cadastro — {ombudsmanReferenceKinds[kind]}
              </span>
              <ChevronDown className="size-4 text-slate-500 transition-transform group-open:rotate-180" />
            </summary>
            <form action={saveOmbudsmanReference} className="border-t border-slate-200 bg-white p-4">
              <ReferenceFields kind={kind} records={records} />
            </form>
          </details>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-slate-900">
            Registros ({visible.length})
          </h2>
          <span className="text-xs text-slate-500">Clique em um item para expandir e editar seus parâmetros</span>
        </div>

        {visible.length > 0 ? (
          <div className="space-y-2.5">
            {visible.map((record, index) => {
              const parentSubject = record.subjectId
                ? records.find((item) => item.id === record.subjectId)?.name
                : null;
              const parentSubsubject = record.subsubjectId
                ? records.find((item) => item.id === record.subsubjectId)?.name
                : null;
              return (
                <details
                  key={record.id}
                  open={index < 3}
                  className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-slate-50">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[#0e4c7e]/10 px-2 py-0.5 text-xs font-bold text-[#0e4c7e]">
                        {record.requestType}
                      </span>
                      {parentSubject && (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {parentSubject}
                        </span>
                      )}
                      {parentSubsubject && (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {parentSubsubject}
                        </span>
                      )}
                      <span className="font-bold text-slate-900 text-sm">{record.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          record.isActive
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {record.isActive ? "Ativo" : "Inativo"}
                      </span>
                      <ChevronDown className="size-4 text-slate-400 transition-transform group-open:rotate-180" />
                    </div>
                  </summary>
                  <form action={saveOmbudsmanReference} className="border-t border-slate-200 bg-slate-50/40 p-4">
                    <ReferenceFields kind={kind} record={record} records={records} />
                  </form>
                </details>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Nenhum registro encontrado para o filtro selecionado.
          </div>
        )}
      </section>
    </PageFrame>
  );
}
