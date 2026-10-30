"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OperationalContext } from "@/components/app-ui/operational/OperationalContext";
import { OperationalSurface, useOptionalOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import type { CentralA1Integration } from "@/lib/contracts/signature-central";
import type { CentralA1Input } from "@/lib/signatures/central-a1";

const columns: OperationalColumn[] = [
  { key: "alias", label: "Integração", type: "text", initialWidth: 190, minWidth: 100, resizable: true, sortable: true, details: "overflow" },
  { key: "kind", label: "Tipo", type: "text", initialWidth: 90, minWidth: 75, resizable: true, sortable: true, details: "none" },
  { key: "owner", label: "Titular / CPF-CNPJ", type: "identifier", initialWidth: 230, minWidth: 130, resizable: true, sortable: true, details: "overflow" },
  { key: "validTo", label: "Validade", type: "text", initialWidth: 100, minWidth: 85, resizable: true, sortable: true, details: "none" },
  { key: "status", label: "Estado", type: "status", initialWidth: 100, minWidth: 85, resizable: true, sortable: true, details: "none" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 170, minWidth: 150, resizable: false, sortable: false, details: "none" },
];
const empty: CentralA1Input = { kind: "A1_ECPF", alias: "", ownerName: "", documentId: "", credentialReference: "", certificatePem: "", intermediatePems: [], trustedRootPem: "", active: false };
const endpoint = "/assinatura-digital/integracoes/api";
const field = "mt-1 block w-full rounded border p-2 text-sm";

type Props = { initial: CentralA1Integration[]; canManage: boolean; status: { internalKeyPresent: boolean; internalKeyValid: boolean; blobConfigured: boolean } };
export default function IntegrationsClient(props: Props) {
  const workspace = useOptionalOperationalWorkspace();
  return workspace ? <IntegrationInventory {...props} /> : <OperationalSurface title="Integrações da Central"><IntegrationInventory {...props} /></OperationalSurface>;
}

function IntegrationInventory({ initial, canManage, status }: Props) {
  const [rows, setRows] = useState(initial), [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<CentralA1Input | null>(null), [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [help, setHelp] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const formOpen = Boolean(form);
  useEffect(() => {
    if (formOpen) formRef.current?.querySelector<HTMLElement>("select,input,textarea")?.focus();
  }, [formOpen, step]);
  useEffect(() => {
    if (formOpen && message && !busy) errorRef.current?.focus();
  }, [formOpen, message, busy]);
  async function api(method: string, input?: unknown, id?: string) {
    const response = await fetch(endpoint + (id ? `?id=${encodeURIComponent(id)}` : ""), { method, headers: { "Content-Type": "application/json" }, body: input ? JSON.stringify(input) : undefined, cache: "no-store" });
    const data = await response.json().catch(() => { throw new Error("Não foi possível ler a resposta do servidor. Tente novamente."); });
    if (!response.ok) throw new Error(data.error || "Operação indisponível.");
    return data;
  }
  async function edit(id: string) {
    setBusy(true); setMessage("");
    try { const data = await api("GET", undefined, id); setForm(data.configuration); setStep(0); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao abrir configuração."); }
    finally { setBusy(false); }
  }
  async function suspend(id: string) {
    setBusy(true); setMessage("");
    try { await api("PATCH", { id, active: false }); setRows((await api("GET")).integrations); setMessage("Integração suspensa."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao suspender."); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!form) return;
    if (step < 2) { setStep(step + 1); return; }
    setBusy(true); setMessage("");
    try { await api("POST", form); setRows((await api("GET")).integrations); setForm(null); setMessage("Configuração pública salva e validada."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }
  const visible = rows.filter(r => `${r.alias} ${r.ownerName} ${r.documentId} ${r.kind}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / OPERATIONAL_PAGE_SIZE)));
  const paged = visible.slice((currentPage - 1) * OPERATIONAL_PAGE_SIZE, currentPage * OPERATIONAL_PAGE_SIZE);
  return <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)_28px]">
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <label>Buscar <input aria-label="Buscar integrações" className="rounded border px-2 py-1" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label>
      {canManage && <button disabled={busy} className="rounded border px-2 py-1" onClick={() => { setForm({ ...empty }); setStep(0); setMessage(""); }}>Cadastrar A1</button>}
      <button className="rounded border px-2 py-1" onClick={() => setHelp(true)}>Configuração e retenção</button>
      <span>Interna: {status.internalKeyValid ? "chave válida" : status.internalKeyPresent ? "chave inválida" : "chave ausente"} · Blob: {status.blobConfigured ? "configurado" : "ausente"}</span>
      <span role="status">{message}</span>
    </div>
    <OperationalTable columns={columns} preferenceId="signature-central-a1" rows={paged.map(r => ({ id: r.id, label: r.alias, values: { alias: r.alias, kind: r.kind === "A1_ECPF" ? "e-CPF A1" : "e-CNPJ A1", owner: `${r.ownerName} · ${r.documentId}`, validTo: new Date(r.validTo).toLocaleDateString("pt-BR"), status: !r.active ? "Suspensa" : new Date(r.validTo) < new Date() ? "Vencida" : "Ativa" }, actions: canManage ? <span className="flex gap-2"><button disabled={busy} onClick={() => void edit(r.id)}>{r.active ? "Editar" : "Editar / ativar"}</button>{r.active && <button disabled={busy} onClick={() => void suspend(r.id)}>Suspender</button>}</span> : <span>Consulta</span> }))} />
    <OperationalPagination page={currentPage} total={visible.length} pending={busy} onPageChange={setPage} />
    <OperationalContext.Provider value={null}>
      <Dialog open={Boolean(form)} onOpenChange={open => { if (!open && !busy) setForm(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{form?.id ? "Atualizar integração A1" : "Cadastrar integração A1"}</DialogTitle><DialogDescription>Etapa {step + 1} de 3 · Apenas metadados e certificados públicos. Nunca envie chave privada ou senha.</DialogDescription></DialogHeader>
          {form && <form ref={formRef} onSubmit={save} className="grid gap-3">
            {step === 0 && <>
              <label>Tipo<select className={field} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as CentralA1Input["kind"] })}><option value="A1_ECPF">e-CPF A1</option><option value="A1_ECNPJ">e-CNPJ A1</option></select></label>
              {([ ["alias", "Nome da integração"], ["ownerName", "Nome do titular (rótulo)"], ["documentId", "CPF/CNPJ do titular"], ["credentialReference", "Prefixo ENV (ex.: MUNICIPIO_A1)"] ] as const).map(([key, label]) => <label key={key}>{label}<input className={field} required maxLength={key === "credentialReference" ? 81 : 200} pattern={key === "credentialReference" ? "[A-Z][A-Z0-9_]{2,80}" : undefined} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}
            </>}
            {step === 1 && <label>Certificado público do titular PEM<textarea className={`${field} h-52 font-mono text-xs`} required value={form.certificatePem} onChange={e => setForm({ ...form, certificatePem: e.target.value })} /><span className="text-xs">CPF/CNPJ e tipo serão comprovados nos OIDs do certificado, além da cadeia, validade e chave correspondente.</span></label>}
            {step === 2 && <>
              <label>Intermediárias PEM (ordem da cadeia; separe por ---CERTIFICATE---)<textarea className={`${field} h-28 font-mono text-xs`} value={form.intermediatePems.join("\n---CERTIFICATE---\n")} onChange={e => setForm({ ...form, intermediatePems: e.target.value.split("---CERTIFICATE---").map(v => v.trim()).filter(Boolean) })} /></label>
              <label>Raiz confiável pública PEM<textarea className={`${field} h-28 font-mono text-xs`} required value={form.trustedRootPem} onChange={e => setForm({ ...form, trustedRootPem: e.target.value })} /></label>
              <label><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Integração ativa</label>
            </>}
            <p ref={errorRef} role="alert" tabIndex={-1}>{message}</p>
            <div className="flex justify-between"><button type="button" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>Voltar</button><button className="rounded border px-3 py-1" disabled={busy}>{busy ? "Validando…" : step < 2 ? "Próxima etapa" : "Validar e salvar"}</button></div>
          </form>}
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Configuração da Central</DialogTitle><DialogDescription>Assinatura interna e A1 são métodos distintos, com evidência destacada.</DialogDescription></DialogHeader>
        <p>Interna: configure uma chave privada persistente e protegida em <code>SIGNATURE_CENTRAL_PRIVATE_KEY_PEM</code> (RSA de pelo menos 2048 bits, EC ou Ed25519). O estado acima verifica presença, tipo aceito e assinatura/verificação real.</p>
        <p>A1: configure no servidor <code>PREFIX_PRIVATE_KEY_PEM</code> e, quando necessário, <code>PREFIX_PRIVATE_KEY_PASSPHRASE</code>. Cadastre apenas o prefixo, certificado público, intermediárias e raiz confiável. A raiz deve ser conferida pelo administrador com fonte oficial ICP-Brasil. Certificados de teste nunca devem compor confiança de produção.</p>
        <p>Blob privado: configure <code>BLOB_READ_WRITE_TOKEN</code>. O indicador confirma presença de configuração, sem teste de conectividade. Arquivos são retidos por 90 dias; após esse prazo os downloads ficam indisponíveis, mas hashes e evidências permanecem para verificação histórica.</p>
        <p>O original é preservado. A evidência criptográfica é destacada; esta Central não produz PAdES. Rotação de configuração não altera os snapshots públicos das assinaturas anteriores.</p>
      </DialogContent></Dialog>
    </OperationalContext.Provider>
  </div>;
}
