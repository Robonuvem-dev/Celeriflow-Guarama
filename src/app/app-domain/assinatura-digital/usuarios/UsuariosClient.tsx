"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import type { CentralOrigin, CentralSigner, CentralSignerInput } from "@/lib/contracts/signature-central";
import { OperationalFilters, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OperationalPagedContent } from "@/components/app-ui/operational/OperationalPagedContent";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { editSigner, emptySigner, filterSigners, fromLocalDateTime, prefillOrigin, signerValidity, toLocalDateTime } from "./cadastro-model";
import { saveSignerAction } from "./actions";

const columns: OperationalColumn[] = [
  { key: "name", label: "Nome", type: "text", initialWidth: 160, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "role", label: "Cargo", type: "text", initialWidth: 150, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
  { key: "document", label: "CPF/CNPJ", type: "identifier", initialWidth: 130, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "phone", label: "Telefone", type: "text", initialWidth: 100, minWidth: 85, resizable: true, sortable: false, details: "overflow" },
  { key: "mobile", label: "Celular", type: "text", initialWidth: 100, minWidth: 85, resizable: true, sortable: false, details: "overflow" },
  { key: "email", label: "E-mail", type: "text", initialWidth: 160, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "kind", label: "Origem", type: "text", initialWidth: 95, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
  { key: "validity", label: "Validade", type: "text", initialWidth: 140, minWidth: 115, resizable: true, sortable: false, details: "overflow" },
  { key: "term", label: "Vigência", type: "status", initialWidth: 85, minWidth: 75, resizable: true, sortable: false, details: "overflow" },
  { key: "password", label: "Senha", type: "status", initialWidth: 85, minWidth: 75, resizable: true, sortable: false, details: "overflow" },
  { key: "state", label: "Situação", type: "status", initialWidth: 85, minWidth: 75, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 50, minWidth: 50, maxWidth: 50, resizable: false, sortable: false, details: "none" },
];
const fieldClass = "h-9 w-full rounded-md border bg-background px-3 font-normal";
type Draft = { input: CentralSignerInput; source: "MANUAL" | "IMPORT"; error: string | null };

export function UsuariosClient({ initialRows, initialNow, canCreate, canUpdate }: {
  initialRows: CentralSigner[]; initialNow: number; canCreate: boolean; canUpdate: boolean;
}) {
  const { device } = useOperationalWorkspace();
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("ALL");
  const [validity, setValidity] = useState("ALL");
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(initialNow);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pending, startTransition] = useTransition();
  const saving = useRef(false);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [origins, setOrigins] = useState<CentralOrigin[]>([]);
  const [originStatus, setOriginStatus] = useState("");
  const draft = selected ? drafts[selected] : undefined;
  const input = draft?.input;
  const originKind = input?.kind;
  const source = draft?.source;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (!open || !originKind || source !== "IMPORT" || query.trim().length < 2) return () => controller.abort();
    const timer = setTimeout(async () => {
      setOriginStatus("Buscando…");
      try {
        const response = await fetch(`/api/assinatura-digital/origens?${new URLSearchParams({ kind: originKind, q: query.trim() })}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as { origins?: CentralOrigin[]; error?: string };
        if (!response.ok || !Array.isArray(data.origins)) throw new Error(data.error || "Não foi possível consultar as origens.");
        if (controller.signal.aborted) return;
        setOrigins(data.origins);
        setOriginStatus(data.origins.length ? "Selecione um candidato para preencher os campos. Até 20 resultados; refine a busca se necessário." : "Nenhum candidato encontrado.");
      } catch (error) {
        if (!controller.signal.aborted) { setOrigins([]); setOriginStatus(error instanceof Error ? error.message : "Falha ao consultar origens."); }
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, originKind, source, open, selected]);

  const filtered = filterSigners(rows, search, active, validity, now);
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  const visible = filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE);

  function edit(row?: CentralSigner) {
    const key = row?.id ?? "new";
    setDrafts(current => current[key] ? current : { ...current, [key]: { input: row ? editSigner(row) : emptySigner(), source: row && (row.kind === "SERVIDOR" || row.personId) ? "IMPORT" : "MANUAL", error: null } });
    setSelected(key); setOpen(true); setQuery(""); setOrigins([]); setOriginStatus("");
  }
  function change(patch: Partial<CentralSignerInput>) {
    if (!selected) return;
    setDrafts(current => ({ ...current, [selected]: { ...current[selected], input: { ...current[selected].input, ...patch } } }));
  }
  function searchOrigins(value: string) { setQuery(value); setOrigins([]); setOriginStatus(""); }
  function changeSource(kind: CentralSignerInput["kind"], source: Draft["source"]) {
    if (!selected) return;
    setDrafts(current => ({ ...current, [selected]: { ...current[selected], source, input: { ...current[selected].input, kind, employeeId: null, personId: null }, error: null } }));
    searchOrigins("");
  }
  function save() {
    if (!input || !selected || saving.current || (input.id ? !canUpdate : !canCreate)) return;
    if (source === "IMPORT" && !(input.kind === "SERVIDOR" ? input.employeeId : input.personId)) {
      setDrafts(current => ({ ...current, [selected]: { ...current[selected], error: input.kind === "SERVIDOR" ? "Selecione um servidor no RH antes de salvar." : "Selecione uma pessoa cadastrada ou altere para cadastro manual." } }));
      return;
    }
    const key = selected;
    const snapshot = input;
    saving.current = true;
    setDrafts(current => ({ ...current, [key]: { ...current[key], error: null } }));
    startTransition(async () => {
      try {
        const result = await saveSignerAction(snapshot);
        if (result.error || !result.signer) throw new Error(result.error || "O servidor não confirmou o cadastro. Tente novamente.");
        const saved = result.signer;
        setRows(current => current.some(row => row.id === saved.id) ? current.map(row => row.id === saved.id ? saved : row) : [...current, saved]);
        setDrafts(current => {
          const next = { ...current }; delete next[key]; return next;
        });
        setSelected(saved.id); setOpen(false); setNow(Date.now());
        setStatus(`Usuário ${saved.name} salvo com sucesso.`);
      } catch (error) {
        setDrafts(current => ({ ...current, [key]: { ...current[key], error: error instanceof Error ? error.message : "Não foi possível salvar. Seu rascunho foi preservado." } }));
      } finally { saving.current = false; }
    });
  }

  return <OperationalListFrame label="Usuários da Central de Assinaturas"
    actions={<>{canCreate && <button type="button" className={styles.dialogButton} onClick={() => edit()}><Plus />Cadastrar usuário</button>}
      <OperationalFilters label="Filtros de usuários"><div className="grid gap-3">
        <label>Situação<select className={fieldClass} value={active} onChange={event => { setActive(event.target.value); setPage(1); }}><option value="ALL">Todas</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option></select></label>
        <label>Validade<select className={fieldClass} value={validity} onChange={event => { setValidity(event.target.value); setPage(1); }}><option value="ALL">Todas</option><option value="VALID">Vigentes</option><option value="EXPIRED">Vencidas</option></select></label>
      </div></OperationalFilters></>}
    toolbar={<div className="flex w-full items-center gap-3"><input type="search" className={styles.searchInput} aria-label="Buscar usuários" placeholder="Nome, cargo, CPF/CNPJ ou contato…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /><span role="status" className="text-xs">{status}</span></div>}
    pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
    <OperationalTable columns={columns} preferenceId="central-assinaturas-usuarios" caption="Usuários da Central de Assinaturas" rows={visible.map(row => ({
      id: row.id, label: row.name, values: { name: row.name, role: row.role, document: row.documentId,
        phone: row.phone, mobile: row.mobile, email: row.email, kind: row.kind === "SERVIDOR" ? "Servidor RH" : "Cidadão",
        validity: new Date(row.validUntil).toLocaleString("pt-BR"), term: signerValidity(row, now) === "VALID" ? "Vigente" : "Vencida", password: row.hasPassword ? "Definida" : "Pendente", state: row.active ? "Ativo" : "Inativo" },
      actions: <div className={styles.rowActions}><button type="button" className={styles.iconButton} disabled={!canUpdate} aria-label={`Editar ${row.name}`} title={canUpdate ? "Editar usuário" : "Somente consulta"} onClick={() => edit(row)}><Pencil /></button></div>,
    }))} />
    <Dialog open={open} onOpenChange={value => { if (!saving.current) setOpen(value); }}>
      <DialogContent showCloseButton={!pending} data-device={device} className="sm:max-w-2xl" style={{ display: "flex", flexDirection: "column", height: "min(760px, calc(100dvh - 16px))", maxHeight: "calc(100dvh - 16px)", minHeight: 0, overflow: "hidden" }}>
        <DialogHeader style={{ flexShrink: 0 }}><DialogTitle>{input?.id ? "Editar usuário" : "Cadastrar usuário"}</DialogTitle><DialogDescription>Senha pessoal somente para gravação. A validade usa seu horário local. Inative o cadastro para impedir novas assinaturas.</DialogDescription></DialogHeader>
        {input && <form style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }} onSubmit={event => { event.preventDefault(); save(); }}>
          <OperationalPagedContent device={device} label="Cadastro de usuário" footer={<div className="grid gap-2">
            {draft.error && <p role="alert" className="text-sm text-red-700">{draft.error} Os dados preenchidos foram mantidos.</p>}
            <div className="flex flex-wrap gap-2"><button type="button" className={styles.dialogButton} disabled={pending} onClick={() => setOpen(false)}>Fechar e manter rascunho</button><button type="submit" className={`${styles.dialogButton} ${styles.primaryButton}`} disabled={pending}>{pending ? "Salvando…" : "Salvar usuário"}</button></div>
          </div>}>
          <fieldset disabled={pending} className="grid gap-4">
            <label className="grid gap-1 font-medium">Origem<select aria-label="Origem" className={fieldClass} value={input.kind} onChange={event => { const kind = event.target.value as CentralSignerInput["kind"]; changeSource(kind, kind === "SERVIDOR" ? "IMPORT" : "MANUAL"); }}><option value="SERVIDOR">Servidor RH — vínculo obrigatório</option><option value="CIDADAO">Cidadão — CPF ou CNPJ</option></select></label>
            {input.kind === "CIDADAO" && <label className="grid gap-1 font-medium">Modo de cadastro<select aria-label="Modo de cadastro" className={fieldClass} value={source} onChange={event => changeSource("CIDADAO", event.target.value as Draft["source"])}><option value="MANUAL">Manual — sem pessoa preexistente</option><option value="IMPORT">Importar cadastro de pessoa (opcional)</option></select></label>}
            {source === "MANUAL" && <p className="text-xs">Preencha os dados do cidadão ou da pessoa jurídica. Não é necessário cadastro prévio de pessoa.</p>}
            {source === "IMPORT" && <>
            <label className="grid gap-1 font-medium">Buscar {input.kind === "SERVIDOR" ? "servidor no RH" : "pessoa cadastrada"}<input className={fieldClass} type="search" maxLength={100} value={query} onChange={event => searchOrigins(event.target.value)} placeholder="Pelo menos 2 caracteres" /></label>
            <p role="status" className="text-xs">{originStatus || "A seleção preenche os campos; o vínculo é revalidado no servidor."}</p>
            {!!origins.length && <label className="grid gap-1 font-medium">Candidatos da origem<select aria-label="Candidatos da origem" className={fieldClass} value="" onChange={event => { const origin = origins.find(candidate => candidate.id === event.target.value); if (origin) { change(prefillOrigin(input, origin)); setOrigins([]); setQuery(""); setOriginStatus(`Campos preenchidos a partir de ${origin.name}.`); } }}><option value="">Selecione entre {origins.length} candidatos</option>{origins.map(origin => <option key={origin.id} value={origin.id}>{origin.name} · {origin.documentId}{origin.role ? ` · ${origin.role}` : ""}</option>)}</select></label>}
            {(input.employeeId || input.personId) && <div className="flex items-center gap-2 text-xs"><span>Origem selecionada: {input.employeeId ? "servidor RH" : "pessoa"}. O servidor confirmará o vínculo ao salvar.</span><button type="button" className={styles.dialogButton} onClick={() => change({ employeeId: null, personId: null })}>Desvincular</button></div>}
            </>}
            <div className="grid gap-3 sm:grid-cols-2">{([
              ["name", "Nome", "text", true], ["role", "Cargo", "text", false], ["documentId", "CPF/CNPJ", "text", true],
              ["phone", "Telefone", "tel", false], ["mobile", "Celular", "tel", false], ["email", "E-mail", "email", false],
            ] as const).map(([key, label, type, required]) => <label key={key} className="grid gap-1 font-medium">{label}<input name={key} minLength={key === "name" ? 2 : undefined} maxLength={key === "email" ? 254 : key === "phone" || key === "mobile" ? 40 : key === "documentId" ? 18 : key === "role" ? 160 : 200} className={fieldClass} type={type} required={required} value={input[key]} onChange={event => change({ [key]: event.target.value })} /></label>)}
              <label className="grid gap-1 font-medium">Validade<input name="validUntil" className={fieldClass} type="datetime-local" step="0.001" required value={toLocalDateTime(input.validUntil)} onChange={event => change({ validUntil: fromLocalDateTime(event.target.value) })} /></label>
              <label className="grid gap-1 font-medium">{input.id ? "Nova senha (opcional)" : "Senha inicial"}<input name="password" className={fieldClass} type="password" minLength={8} maxLength={1024} autoComplete="new-password" required={!input.id} value={input.password ?? ""} onChange={event => change({ password: event.target.value })} /></label>
            </div>
            <p className="text-xs">Na edição, deixe a senha vazia para preservar a atual.</p>
            <label className="grid gap-1 font-medium">ID da conta do aplicativo (opcional)<input name="accountUserId" maxLength={200} className={fieldClass} value={input.accountUserId ?? ""} onChange={event => change({ accountUserId: event.target.value.trim() || null })} /><span className="text-xs font-normal">A associação só será aceita após o servidor confirmar a correspondência do CPF/CNPJ da conta com o cadastro. Informar o ID não concede acesso a dados ou permissões.</span></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={input.active} onChange={event => change({ active: event.target.checked })} />Cadastro ativo</label>
          </fieldset>
          </OperationalPagedContent>
        </form>}
      </DialogContent>
    </Dialog>
  </OperationalListFrame>;
}
