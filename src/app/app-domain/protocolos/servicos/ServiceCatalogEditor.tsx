"use client";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { digitalServiceSchema, serviceProviders } from "@/lib/portal-cidadao/services-policy";
import { saveDigitalServiceAction, saveServiceNoticeAction, prepareServiceTemplatesAction } from "./actions";

type Service = { id: string; slug: string; group: string; provider: string; audience: string; published: boolean; featured: boolean; requiresLogin: boolean; configuration: unknown; publicService: { name: string; description: string; requirements: string | null; steps: string | null; deadline: string | null; cost: string | null } };
const columns: OperationalColumn[] = [
  ...([["name", "Serviço", 260, 130], ["slug", "Código / slug", 180, 110], ["audience", "Público", 140, 100], ["provider", "Executor", 160, 100], ["published", "Publicação", 130, 95]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 650, type: key === "published" ? "status" : "text", resizable: true, sortable: false, details: "overflow" })),
  { key: "actions", label: "Ação", type: "actions", initialWidth: 56, minWidth: 56, maxWidth: 80, resizable: false, sortable: false, details: "none" },
];
export default function ServiceCatalogEditor({ services, subjects }: { services: Service[]; subjects: { id: string; name: string; processTypeId: string; processType: { name: string } }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const initialService = services.find(service => service.id === params.get("id")) || null;
  const [editing, setEditing] = useState<Service | null>(initialService);
  const [configuration, setConfiguration] = useState(JSON.stringify(initialService?.configuration ?? digitalServiceSchema.parse({}), null, 2));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const shortFields: [string, string, string | null | undefined][] = [["slug", "Código / slug", editing?.slug], ["name", "Nome", editing?.publicService.name], ["group", "Grupo", editing?.group || "Serviços municipais"], ["deadline", "Prazo informado", editing?.publicService.deadline], ["cost", "Custo / condições", editing?.publicService.cost]];
  const longFields: [string, string, string | null | undefined][] = [["description", "Descrição", editing?.publicService.description], ["requirements", "Requisitos", editing?.publicService.requirements], ["steps", "Etapas", editing?.publicService.steps]];
  const filtered = services.filter(service => [service.publicService.name, service.slug, service.audience, service.provider].some(value => value.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  if (!["novo", "editar", "avisos"].includes(params.get("view") || "")) return <OperationalListFrame label="Catálogo de serviços" actions={<><button type="button" className={styles.newButton} onClick={() => { setEditing(null); setConfiguration(JSON.stringify(digitalServiceSchema.parse({}), null, 2)); router.push("/protocolos/servicos?view=novo"); }}>Novo serviço</button><button type="button" className={styles.dialogButton} onClick={() => router.push("/protocolos/servicos?view=avisos")}>Avisos</button><button type="button" disabled={pending} className={styles.dialogButton} onClick={async () => { setPending(true); try { const result = await prepareServiceTemplatesAction(); setMessage(result.error || "Modelos preparados como rascunhos."); if (!result.error) router.refresh(); } finally { setPending(false); } }}>Preparar modelos</button></>}
    toolbar={<><input aria-label="Buscar serviço" className={styles.searchInput} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar serviço, código ou executor…" />{message && <span role="status">{message}</span>}</>} pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
    <OperationalTable columns={columns} preferenceId="protocolos.servicos" caption="Catálogo — modelos são rascunhos; configure os vínculos antes de publicar" emptyMessage="Nenhum serviço encontrado." rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map(service => ({ id: service.id, label: service.publicService.name, values: { name: service.publicService.name, slug: service.slug, audience: service.audience, provider: service.provider, published: service.published ? "Publicado" : "Rascunho" }, actions: <button type="button" className={styles.iconButton} aria-label={`Editar ou criar versão de ${service.publicService.name}`} onClick={() => { setEditing(service); setConfiguration(JSON.stringify(service.configuration, null, 2)); router.push(`/protocolos/servicos?view=editar&id=${encodeURIComponent(service.id)}`); }}><Pencil /></button> }))} />
  </OperationalListFrame>;
  if (params.get("view") === "avisos") return <div className="space-y-4 p-4"><button type="button" onClick={() => router.push("/protocolos/servicos")}>Voltar ao catálogo</button><ServiceNoticeEditor /></div>;
  return <div className="space-y-6">
    <button type="button" onClick={() => router.push("/protocolos/servicos")}>Voltar ao catálogo</button>
    <div className="rounded border bg-slate-50 p-4"><button type="button" disabled={pending} onClick={async () => { setPending(true); try { const result = await prepareServiceTemplatesAction(); setMessage(result.error || "Modelos preparados como rascunhos."); if (!result.error) router.refresh(); } finally { setPending(false); } }} className="rounded border bg-white px-4 py-2 text-sm font-semibold text-emerald-800">Preparar modelos iniciais do catálogo</button><p className="mt-2 text-xs leading-6 text-slate-600">Os modelos são rascunhos. Configure assuntos, setores, requisitos, classes documentais, unidade fiscal, espaços e vagas antes de publicar.</p></div>
    <button type="button" onClick={() => { setEditing(null); setConfiguration(JSON.stringify(digitalServiceSchema.parse({}), null, 2)); }} className="rounded border px-4 py-2 text-sm">Novo serviço</button>
    <form key={editing?.id || "new"} className="grid gap-4 rounded border bg-white p-5 sm:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault(); setPending(true); setMessage(""); const form = new FormData(event.currentTarget);
      try {
        const result = await saveDigitalServiceAction({ ...(editing ? { id: editing.id } : {}), slug: String(form.get("slug")), name: String(form.get("name")), description: String(form.get("description")), group: String(form.get("group")), audience: String(form.get("audience")), provider: String(form.get("provider")), requirements: String(form.get("requirements") || ""), steps: String(form.get("steps") || ""), deadline: String(form.get("deadline") || ""), cost: String(form.get("cost") || ""), published: form.get("published") === "on", featured: form.get("featured") === "on", requiresLogin: form.get("requiresLogin") === "on", configuration: JSON.parse(configuration) });
        setMessage(result.error || "Versão salva."); if (!result.error) router.refresh();
      } catch (issue) { setMessage(issue instanceof Error ? issue.message : "Configuração inválida."); } finally { setPending(false); }
    }}>
      <h2 className="text-lg font-semibold sm:col-span-2">{editing ? `Editar ${editing.publicService.name}` : "Novo serviço digital"}</h2>
      {shortFields.map(([name, label, value]) => <label key={name} className="text-sm font-semibold">{label}<input name={name} defaultValue={value || ""} required={["slug", "name", "group"].includes(name)} readOnly={name === "slug" && Boolean(editing)} className="mt-2 w-full rounded border p-2" /></label>)}
      <label className="text-sm font-semibold">Público<select name="audience" defaultValue={editing?.audience || "CIDADAO"} className="mt-2 w-full rounded border p-2">{["CIDADAO", "CONTRIBUINTE", "SERVIDOR", "FORNECEDOR", "ESTABELECIMENTO"].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="text-sm font-semibold">Executor<select name="provider" defaultValue={editing?.provider || "ADMINISTRATIVO"} className="mt-2 w-full rounded border p-2">{serviceProviders.map((item) => <option key={item}>{item}</option>)}</select></label>
      {longFields.map(([name, label, value]) => <label key={name} className="text-sm font-semibold sm:col-span-2">{label}<textarea name={name} defaultValue={value || ""} required={name === "description"} rows={3} className="mt-2 w-full rounded border p-2 font-normal" /></label>)}
      <label className="text-sm font-semibold sm:col-span-2">Assunto / roteiro<select className="mt-2 w-full rounded border p-2" defaultValue={digitalServiceSchema.parse(editing?.configuration || {}).subjectId} onChange={(event) => {
        const subject = subjects.find((item) => item.id === event.target.value);
        if (subject) { try { setConfiguration((current) => JSON.stringify({ ...JSON.parse(current), processTypeId: subject.processTypeId, subjectId: subject.id }, null, 2)); } catch { setMessage("Corrija a configuração antes de trocar o assunto."); } }
      }}><option value="">Selecione para solicitações com protocolo</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.processType.name} — {subject.name}</option>)}</select></label>
      <label className="text-sm font-semibold sm:col-span-2">Formulário, documentos, termo, destino e vagas (configuração validada)<textarea value={configuration} onChange={(event) => setConfiguration(event.target.value)} rows={18} spellCheck={false} className="mt-2 w-full rounded border p-3 font-mono text-xs" /><span className="mt-2 block text-xs font-normal text-slate-500">Cada salvamento cria uma versão imutável. Campos: code, label, type, required, options. Documentos: code, label, documentClassCode, required. Destino especializado: targetPath. Reserva: resourceKey, availableSlots e slotMinutes.</span></label>
      <div className="flex flex-wrap gap-4 text-sm sm:col-span-2"><label><input name="published" type="checkbox" defaultChecked={editing?.published} className="mr-2" />Publicar</label><label><input name="featured" type="checkbox" defaultChecked={editing?.featured} className="mr-2" />Destaque</label><label><input name="requiresLogin" type="checkbox" defaultChecked={editing?.requiresLogin ?? true} className="mr-2" />Exige login</label></div>
      <button disabled={pending} className="w-fit rounded bg-emerald-700 px-5 py-2 text-sm font-semibold text-white">{pending ? "Salvando…" : "Salvar versão"}</button><p role="status" className="text-sm sm:col-span-2">{message}</p>
    </form>
    <ServiceNoticeEditor />
  </div>;
}

function ServiceNoticeEditor() {
  const [message, setMessage] = useState("");
  return <form className="grid gap-3 rounded border bg-white p-5 sm:grid-cols-2" onSubmit={async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { const result = await saveServiceNoticeAction({ title: String(form.get("title")), text: String(form.get("text")), audience: String(form.get("audience")), popup: form.get("popup") === "on", startsAt: new Date(String(form.get("startsAt"))).toISOString(), endsAt: new Date(String(form.get("endsAt"))).toISOString() }); setMessage(result.error || "Aviso publicado."); } catch { setMessage("Confira as datas."); }
  }}><h2 className="font-semibold sm:col-span-2">Avisos e pop-up do Autoatendimento</h2><input name="title" required placeholder="Título" aria-label="Título do aviso" className="rounded border p-2 sm:col-span-2" /><textarea name="text" required placeholder="Mensagem" aria-label="Mensagem do aviso" className="rounded border p-2 sm:col-span-2" /><label className="text-sm">Início<input type="datetime-local" name="startsAt" required className="mt-1 w-full rounded border p-2" /></label><label className="text-sm">Fim<input type="datetime-local" name="endsAt" required className="mt-1 w-full rounded border p-2" /></label><select name="audience" aria-label="Público do aviso" className="rounded border p-2"><option value="PUBLICO">Público</option><option value="LOGADO">Logado</option></select><label className="text-sm"><input type="checkbox" name="popup" className="mr-2" />Exibir como pop-up</label><button className="w-fit rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Publicar aviso</button><p role="status" className="text-sm">{message}</p></form>;
}
