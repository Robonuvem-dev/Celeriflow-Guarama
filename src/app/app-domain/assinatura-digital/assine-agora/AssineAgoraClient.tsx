"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { CentralA1Integration, CentralDocumentType, CentralSignatureMethod, CentralSigner } from "@/lib/contracts/signature-central";
import { Button } from "@/components/ui/button";
import { FileSignature, ShieldCheck, Upload } from "lucide-react";
import { BatchItem, BatchOptions, type GedBatchSource, downloadCentralFile, FILE_ACCEPT, fileError, integrationProblem, MAX_BATCH_FILES, signerProblem, submitBatch } from "./batch";

const date = (value: string) => new Date(value).toLocaleString("pt-BR");
const field = "mt-1 block min-h-10 w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60";

export default function AssineAgoraClient({ signers, documentTypes, integrations, canCreate, currentUserName, gedSource }: { signers: CentralSigner[]; documentTypes: CentralDocumentType[]; integrations: CentralA1Integration[]; canCreate: boolean; currentUserName?: string; gedSource?: GedBatchSource }) {
  const id = useId();
  const [items, setItems] = useState<BatchItem[]>(() => gedSource ? [{ requestId: gedSource.requestId, file: new File([], gedSource.filename, { type: gedSource.mimeType }), gedSource, status: "pending" }] : []);
  const [signerId, setSignerId] = useState(() => (signers.find(signer => signer.active && Date.parse(signer.validUntil) > Date.now()) ?? signers[0])?.id ?? "");
  const [documentTypeId, setDocumentTypeId] = useState("");
  const [method, setMethod] = useState<CentralSignatureMethod>("INTERNAL");
  const [integrationId, setIntegrationId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const running = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Uma tentativa ambígua deve repetir exatamente o mesmo envelope e UUID.
  const lockedOptions = useRef<Omit<BatchOptions, "password"> | null>(null);
  const [locked, setLocked] = useState(false);
  const signer = signers.find(value => value.id === signerId);
  const integration = integrations.find(value => value.id === integrationId);
  const needsPassword = method === "INTERNAL";
  const problem = !canCreate ? "Você não possui permissão para assinar." : !signers.length ? "Nenhum assinador vinculado à sua conta. Solicite o vínculo no Cadastro de Usuários." : signerProblem(signer, now, method) || (!documentTypes.some(type => type.id === documentTypeId && type.active) ? "Selecione um tipo de documento ativo." : "") || integrationProblem(integration, method, now);
  const pending = items.filter(item => item.status !== "success").length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current) return;
    const currentProblem = signerProblem(signer, now, method) || integrationProblem(integration, method, now);
    if (problem || currentProblem || (needsPassword && !password) || !pending) { setMessage(problem || currentProblem || (needsPassword && !password ? "Informe a senha pessoal do assinador." : "Selecione arquivos pendentes.")); return; }
    running.current = true; setBusy(true); setMessage("");
    lockedOptions.current ??= { signerId, documentTypeId, method, integrationId };
    setLocked(true);
    try {
      await submitBatch(items, { ...lockedOptions.current, password }, next => setItems(current => current.map(item => item.requestId === next.requestId ? next : item)));
    } finally { running.current = false; setBusy(false); setPassword(""); }
  }

  async function download(item: BatchItem, kind: "documentos" | "comprovantes") {
    if (!item.record) return;
    setDownloadBusy(true); setMessage("");
    try { await downloadCentralFile(item.record.id, kind, kind === "documentos" ? item.record.filename : `comprovante-${item.record.code}.json`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Download indisponível."); }
    finally { setDownloadBusy(false); }
  }

  return <section className="flex min-h-full w-full min-w-0 flex-col gap-4 p-3 text-sm sm:p-4 lg:p-6" aria-labelledby="assine-title">
    <h1 id="assine-title" className="flex items-center gap-2 text-xl font-semibold"><FileSignature className="size-5 text-primary" aria-hidden="true" />Assine Agora</h1>
    <form onSubmit={submit} className="min-w-0 space-y-4 rounded-xl border bg-card p-4 shadow-sm lg:p-5" aria-busy={busy}>
      <fieldset disabled={busy || locked || !canCreate} className="min-w-0 space-y-4">
        <legend className="sr-only">Identificação da assinatura</legend>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <div><label htmlFor={`${id}-method`} className="font-medium">Método</label><select id={`${id}-method`} className={field} value={method} onChange={event => { setMethod(event.target.value as CentralSignatureMethod); setIntegrationId(""); setPassword(""); }}><option value="INTERNAL">Assinatura interna / eletrônica</option><option value="A1_ECPF">A1 e-CPF</option><option value="A1_ECNPJ">A1 e-CNPJ</option></select></div>
          {method !== "INTERNAL" && <div><label htmlFor={`${id}-integration`}>Integração A1</label><select id={`${id}-integration`} className={field} value={integrationId} onChange={event => setIntegrationId(event.target.value)} required><option value="">Selecione o certificado…</option>{integrations.filter(value => value.kind === method && value.documentId.replace(/\D/g, "") === signer?.documentId.replace(/\D/g, "")).map(value => <option key={value.id} value={value.id}>{value.alias} · {value.ownerName}{!value.active ? " · inativa" : ""}</option>)}</select></div>}
        </div>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div><label htmlFor={`${id}-signer`}>Assinador</label>{signers.length > 1 ? <select id={`${id}-signer`} className={field} value={signerId} onChange={event => { setSignerId(event.target.value); setIntegrationId(""); setPassword(""); }} required>{signers.map(value => <option key={value.id} value={value.id}>{value.name}{!value.active ? " · inativo" : ""}</option>)}</select> : <input id={`${id}-signer`} className={field} value={signer?.name ?? currentUserName ?? "Sem assinador cadastrado"} readOnly />}</div>
        <div><label htmlFor={`${id}-type`}>Tipo de documento</label><select id={`${id}-type`} className={field} value={documentTypeId} onChange={event => setDocumentTypeId(event.target.value)} required><option value="">Selecione…</option>{documentTypes.map(type => <option key={type.id} value={type.id} disabled={!type.active}>{type.name}{!type.active ? " · inativo" : ""}</option>)}</select></div>
        </div>
      </fieldset>
      {needsPassword && <div className="grid min-w-0 gap-4 md:grid-cols-2"><div><label htmlFor={`${id}-password`}>Senha do assinador</label><input id={`${id}-password`} className={field} type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} disabled={busy || !canCreate} required /></div></div>}
      {locked && <p className="text-xs text-muted-foreground">Para alterar a identificação, inicie um novo lote.</p>}
      <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
      <Button type="button" variant="outline" className="min-h-11 w-full border-2 border-primary bg-primary/10 px-5 font-semibold text-primary shadow-sm hover:bg-primary/20 sm:w-auto" disabled={busy || locked || !canCreate} onClick={() => fileInput.current?.click()} aria-describedby={`${id}-file-help`}><Upload className="size-4" aria-hidden="true" />Selecionar arquivos</Button>
      <input ref={fileInput} className="sr-only" tabIndex={-1} aria-label="Selecionar arquivos" type="file" multiple accept={FILE_ACCEPT} disabled={busy || locked || !canCreate} onChange={event => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (items.length + files.length > MAX_BATCH_FILES) { setMessage("O lote aceita no máximo 20 arquivos. Nenhum arquivo desta seleção foi adicionado."); return; }
        setItems(current => [...current, ...files.map(file => ({ requestId: crypto.randomUUID(), file, status: "pending" as const, error: fileError(file) }))]);
        setMessage("");
      }} />
      <p id={`${id}-file-help`} className="mt-1.5 text-xs text-muted-foreground">Arquivos (até 20, máximo 3 MiB cada)</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"><Button type="submit" className="min-h-11 px-6 font-semibold shadow-sm" disabled={busy || !!problem || !pending || (needsPassword && !password)}><FileSignature className="size-4" aria-hidden="true" />{busy ? "Assinando…" : locked ? "Repetir pendentes/falhas" : "Assinar lote"}</Button>
        <Button type="button" variant="outline" disabled={busy || !items.length} onClick={() => { setItems([]); setLocked(false); lockedOptions.current = null; setPassword(""); setMessage(""); }}>{locked && pending > 0 ? "Descartar pendentes e iniciar novo lote" : "Novo lote"}</Button></div>
      </div>
      {problem && <p className="text-xs text-muted-foreground" role="status">{problem}</p>}
    </form>
    {message && <p role="alert">{message}</p>}
    <div className="min-w-0 space-y-3" aria-live="polite" aria-label="Resultados individuais do lote">
      <p>{items.filter(item => item.status === "success").length} concluídos · {pending} pendentes/falhas · {items.length} arquivos</p>
      {items.map(item => <article key={item.requestId} className="rounded-md border p-3">
        <h2 className="break-all font-semibold">{item.file.name}</h2><p>{(item.gedSource?.byteLength ?? item.file.size).toLocaleString("pt-BR")} bytes · {item.gedSource ? "Original GED · " : ""}{({ pending: "Pendente", sending: "Enviando…", success: "Assinado", error: "Falha" })[item.status]}</p>
        {item.error && <p role="alert">{item.error}</p>}
        {!locked && <Button type="button" variant="outline" size="sm" className="max-w-full" aria-label={`Remover ${item.file.name}`} onClick={() => setItems(current => current.filter(value => value.requestId !== item.requestId))}>Remover</Button>}
        {item.record && <><p>Código: {item.record.code} · Assinado em {date(item.record.signedAt)} · Original expira em {date(item.record.expiresAt)}</p><p className="break-all">SHA-256: {item.record.hashSha256}</p><div className="mt-2 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={downloadBusy || !!item.record.storageDeletedAt || Date.parse(item.record.expiresAt) <= now} onClick={() => void download(item, "documentos")}>Baixar original preservado</Button><Button type="button" size="sm" disabled={downloadBusy} onClick={() => void download(item, "comprovantes")}>Baixar comprovante JSON destacado</Button><a className="underline" href={`/validar-assinatura/${encodeURIComponent(item.record.code)}`} target="_blank" rel="noopener noreferrer">Validação pública</a></div></>}
      </article>)}
    </div>
    <aside className="mt-auto flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-[11px] leading-relaxed text-muted-foreground" aria-label="Armazenamento e retenção">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <p>Armazenamento Blob privado por <strong>90 dias</strong>, com download autenticado. Após a expiração, o original fica indisponível e é excluído pela rotina de retenção. O comprovante, os metadados e a validação permanecem disponíveis.</p>
    </aside>
  </section>;
}
