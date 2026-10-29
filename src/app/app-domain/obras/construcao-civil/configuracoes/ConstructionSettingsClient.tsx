"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { OperationalListFrame, OperationalLinkPagination, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { operationalColumns } from "../../../patrimonio/_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import { constructionCatalogs, areaKeys, areaLabels } from "@/lib/obras/construction-policy";
import { saveConstructionCatalog, publishConstructionConfiguration } from "../actions";

type Entry = { id: string; kind: string; name: string; description: string | null; isActive: boolean };
type Weights = Record<keyof typeof areaLabels, number>;
type Configuration = { version: number; publishedAt: string; freeRevisions: number; correctionDays: number; checkPropertyDebts: boolean; subjectIds: string[]; areaWeights: Weights; instructions: string };
const field = "h-8 w-full rounded border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const defaults = { freeRevisions: 0, correctionDays: 30, checkPropertyDebts: false, subjectIds: [] as string[], areaWeights: { existingArea: 0, expandedArea: 0, irregularArea: 0, renovationArea: 0, demolitionArea: 0 }, instructions: "" };

export default function ConstructionSettingsClient({ entries, kind, q, status, page, total, config, canManage, subjects, configurationMode = false }: { entries: Entry[]; kind: keyof typeof constructionCatalogs; q: string; status: string; page: number; total: number; config: Configuration | null; canManage: boolean; subjects: { id: string; name: string }[]; configurationMode?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Entry | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setActive] = useState(true);
  const [values, setValues] = useState(config || defaults);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
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
  return <>
    {!configurationMode && <OperationalListFrame actions={<><Link href={`?${new URLSearchParams({ kind, q, status, page: String(page), view: "parametros" })}`} className={styles.dialogButton}>Parâmetros publicados</Link>{canManage && <button type="button" className={styles.newButton} onClick={() => setEditorOpen(true)}>{editing ? "Continuar edição" : "Cadastrar classificação"}</button>}</>} toolbar={<>
      <form method="GET" role="search" className={styles.searchForm}>
        <input type="hidden" name="kind" value={kind} /><input type="hidden" name="status" value={status} />
        <input name="q" aria-label="Buscar classificação" type="search" defaultValue={q} className={styles.searchInput} placeholder="Buscar nome..." />
        <button className={styles.dialogButton}>Filtrar</button>
      </form><OperationalFilters activeCount={status === "all" ? 0 : 1}><form className={styles.filterFields}><input type="hidden" name="q" value={q} />
        <label>Catálogo<select name="kind" defaultValue={kind}>{Object.entries(constructionCatalogs).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Situação<select name="status" defaultValue={status}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
        <button className={styles.primaryButton}>Aplicar</button><Link href={`?kind=${kind}`}>Limpar</Link>
      </form></OperationalFilters></>} pagination={<OperationalLinkPagination page={page} total={total} pathname="/obras/construcao-civil/configuracoes" values={{ kind, q, status }} />}>
      <OperationalTable preferenceId={`obras-classificacoes-${kind}`} caption={constructionCatalogs[kind]} emptyMessage="Nenhuma classificação encontrada." columns={operationalColumns([["name", "Nome", 300, 150, "identifier"], ["description", "Descrição", 400, 180], ["status", "Situação", 120, 90, "status"], ["actions", "Ação", 80, 70, "actions"]])} rows={entries.map(entry => ({ id: entry.id, label: entry.name, values: { name: entry.name, description: entry.description || "—", status: entry.isActive ? "Ativo" : "Inativo" }, actions: canManage && <button disabled={pending} className={styles.iconButton} aria-label={`Editar ${entry.name}`} onClick={() => { setEditing(entry); setName(entry.name); setDescription(entry.description || ""); setActive(entry.isActive); setEditorOpen(true); }}><Pencil /></button> }))} />
    </OperationalListFrame>}
    {canManage && !configurationMode && <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent><DialogHeader><DialogTitle>{editing ? "Editar classificação" : "Cadastrar classificação"}</DialogTitle><DialogDescription>{constructionCatalogs[kind]}</DialogDescription></DialogHeader>{message && <p role="status">{message}</p>}<form onSubmit={(event) => submit(event, false)} className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">Nome<input required minLength={2} maxLength={160} disabled={pending} className={field} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="text-xs">Descrição<input maxLength={2000} disabled={pending} className={field} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={pending} checked={isActive} onChange={(event) => setActive(event.target.checked)} />Ativo</label>
        <div className="flex justify-end gap-2">{editing && <button type="button" disabled={pending} onClick={reset} className="rounded border px-3 py-1 text-xs">Cancelar edição</button>}<button disabled={pending} className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50">{pending ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar"}</button></div>
      </form></DialogContent></Dialog>}
    {configurationMode && <section className="space-y-3 rounded-lg border p-3"><h2 className="text-sm font-semibold">Parâmetros publicados {config ? `— versão ${config.version}` : "— nenhuma versão"}</h2>
      <Link href={`?${new URLSearchParams({ kind, q, status, page: String(page) })}`}>Voltar às classificações</Link>{message && <p role="status">{message}</p>}
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
    </section>}
  </>;
}
