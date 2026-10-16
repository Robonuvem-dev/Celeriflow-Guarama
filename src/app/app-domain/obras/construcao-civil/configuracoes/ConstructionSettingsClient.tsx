"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { constructionCatalogs, areaKeys, areaLabels } from "@/lib/obras/construction-policy";
import { saveConstructionCatalog, publishConstructionConfiguration } from "../actions";

type Entry = { id: string; kind: string; name: string; description: string | null; isActive: boolean };
type Weights = Record<keyof typeof areaLabels, number>;
type Configuration = { version: number; publishedAt: string; freeRevisions: number; correctionDays: number; checkPropertyDebts: boolean; subjectIds: string[]; areaWeights: Weights; instructions: string };
const field = "h-8 w-full rounded border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const defaults = { freeRevisions: 0, correctionDays: 30, checkPropertyDebts: false, subjectIds: [] as string[], areaWeights: { existingArea: 0, expandedArea: 0, irregularArea: 0, renovationArea: 0, demolitionArea: 0 }, instructions: "" };

export default function ConstructionSettingsClient({ entries, kind, q, status, page, total, config, canManage, subjects }: { entries: Entry[]; kind: keyof typeof constructionCatalogs; q: string; status: string; page: number; total: number; config: Configuration | null; canManage: boolean; subjects: { id: string; name: string }[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Entry | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setActive] = useState(true);
  const [values, setValues] = useState(config || defaults);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  function reset() { setEditing(null); setName(""); setDescription(""); setActive(true); }
  async function submit(event: React.FormEvent<HTMLFormElement>, configuration: boolean) {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      const result = configuration ? await publishConstructionConfiguration(values) : await saveConstructionCatalog({ id: editing?.id, kind, name, description, isActive });
      if (result.error) { setMessage(result.error); return; }
      if (!configuration) reset();
      setMessage(configuration ? "Nova versão publicada. Processos anteriores preservam sua configuração." : "Cadastro salvo."); router.refresh();
    } catch { setMessage("Falha de comunicação. Tente novamente."); } finally { setPending(false); }
  }
  const href = (target: number) => `?${new URLSearchParams({ kind, q, status, page: String(target) })}`;
  return <div className="space-y-3">
    {message && <p role="status" className="rounded border p-2 text-sm">{message}</p>}
    <section className="rounded-lg border bg-white dark:bg-slate-900">
      <form method="GET" className="grid gap-2 border-b p-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
        <select name="kind" aria-label="Catálogo" defaultValue={kind} className={field}>{Object.entries(constructionCatalogs).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>
        <input name="q" aria-label="Buscar classificação" type="search" defaultValue={q} className={field} placeholder="Buscar nome..." />
        <select name="status" aria-label="Situação" defaultValue={status} className={field}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>
        <button className="rounded bg-blue-600 px-3 text-xs text-white">Filtrar</button>
      </form>
      {canManage && <form onSubmit={(event) => submit(event, false)} className="grid gap-2 border-b p-3 sm:grid-cols-2">
        <label className="text-xs">Nome<input required minLength={2} maxLength={160} disabled={pending} className={field} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="text-xs">Descrição<input maxLength={2000} disabled={pending} className={field} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={pending} checked={isActive} onChange={(event) => setActive(event.target.checked)} />Ativo</label>
        <div className="flex justify-end gap-2">{editing && <button type="button" disabled={pending} onClick={reset} className="rounded border px-3 py-1 text-xs">Cancelar edição</button>}<button disabled={pending} className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50">{pending ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar"}</button></div>
      </form>}
      <table className="w-full table-fixed text-left text-xs"><thead className="bg-slate-100 text-[10px] uppercase text-slate-500 dark:bg-slate-800"><tr><th className="p-2">Nome</th><th className="hidden p-2 sm:table-cell">Descrição</th><th className="w-20 p-2">Situação</th><th className="w-16 p-2 text-right">Ação</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="h-9 border-t"><td className="truncate p-2" title={entry.name}>{entry.name}</td><td className="hidden truncate p-2 sm:table-cell" title={entry.description || ""}>{entry.description || "—"}</td><td className="p-2">{entry.isActive ? "Ativo" : "Inativo"}</td><td className="p-2 text-right">{canManage && <button disabled={pending} className="text-blue-700 underline" onClick={() => { setEditing(entry); setName(entry.name); setDescription(entry.description || ""); setActive(entry.isActive); }}>Editar</button>}</td></tr>)}</tbody></table>
      {!entries.length && <p className="p-5 text-center text-xs text-slate-500">Nenhuma classificação encontrada.</p>}
      <div className="border-t p-2"><ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} label="classificações" /></div>
    </section>
    <section className="space-y-3 rounded-lg border p-3"><h2 className="text-sm font-semibold">Parâmetros publicados {config ? `— versão ${config.version}` : "— nenhuma versão"}</h2>
      <p className="text-xs text-slate-500">Publicar cria uma versão histórica. A regra de área deve refletir a norma municipal; não há fórmula legal pré-configurada. Valores iniciais do formulário só são aplicados após publicação.</p>
      <form onSubmit={(event) => submit(event, true)} className="grid gap-3 sm:grid-cols-2"><fieldset disabled={pending || !canManage} className="contents">
        <label className="text-xs">Readequações sem nova taxa<input type="number" required min={0} max={100} className={field} value={values.freeRevisions} onChange={(event) => setValues({ ...values, freeRevisions: Number(event.target.value) })} /></label>
        <label className="text-xs">Prazo de exigência (dias)<input type="number" required min={1} max={3650} className={field} value={values.correctionDays} onChange={(event) => setValues({ ...values, correctionDays: Number(event.target.value) })} /></label>
        <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" checked={values.checkPropertyDebts} onChange={(event) => setValues({ ...values, checkPropertyDebts: event.target.checked })} />Verificar débitos imobiliários na conclusão</label>
        <fieldset className="grid gap-2 rounded border p-2 sm:col-span-2 sm:grid-cols-5"><legend className="text-xs">Regra de área total (m²): coeficiente por componente</legend>{areaKeys.map((key) => <label key={key} className="text-xs">{areaLabels[key]}<select className={field} value={values.areaWeights[key]} onChange={(event) => setValues({ ...values, areaWeights: { ...values.areaWeights, [key]: Number(event.target.value) } })}><option value={0}>Ignorar (0)</option><option value={1}>Somar (+1)</option><option value={-1}>Subtrair (-1)</option></select></label>)}</fieldset>
        <label className="text-xs sm:col-span-2">Orientações de abertura<textarea required minLength={3} maxLength={10000} rows={4} className="w-full rounded border bg-transparent p-2 text-sm" value={values.instructions} onChange={(event) => setValues({ ...values, instructions: event.target.value })} /></label>
        <fieldset className="space-y-2 rounded border p-2 sm:col-span-2"><legend className="text-xs">Assuntos de protocolo habilitados para Construção Civil</legend>{subjects.map((subject) => <label key={subject.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={values.subjectIds.includes(subject.id)} onChange={(event) => setValues({ ...values, subjectIds: event.target.checked ? [...values.subjectIds, subject.id] : values.subjectIds.filter((id) => id !== subject.id) })} />{subject.name}</label>)}{!subjects.length && <p className="text-xs text-slate-500">Cadastre um tipo e assunto ativo em Protocolos antes de publicar.</p>}</fieldset>
        {canManage && <div className="text-right sm:col-span-2"><button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">{pending ? "Publicando..." : "Publicar nova versão"}</button></div>}
      </fieldset></form>
    </section>
  </div>;
}
