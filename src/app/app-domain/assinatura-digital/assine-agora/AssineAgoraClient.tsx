"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { CentralA1Integration, CentralDocumentType, CentralSignatureMethod, CentralSigner } from "@/lib/contracts/signature-central";
import { Button } from "@/components/ui/button";
import { BatchItem, BatchOptions, downloadCentralFile, FILE_ACCEPT, fileError, integrationProblem, MAX_BATCH_FILES, signerProblem, submitBatch } from "./batch";

const date = (value: string) => new Date(value).toLocaleString("pt-BR");
const field = "block w-full rounded-md border bg-background px-3 py-2";

export default function AssineAgoraClient({ signers, documentTypes, integrations, canCreate }: { signers: CentralSigner[]; documentTypes: CentralDocumentType[]; integrations: CentralA1Integration[]; canCreate: boolean }) {
  const id = useId();
  const [items, setItems] = useState<BatchItem[]>([]);
  const [signerId, setSignerId] = useState("");
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
  // Uma tentativa ambígua deve repetir exatamente o mesmo envelope e UUID.
  const lockedOptions = useRef<Omit<BatchOptions, "password"> | null>(null);
  const [locked, setLocked] = useState(false);
  const signer = signers.find(value => value.id === signerId);
  const integration = integrations.find(value => value.id === integrationId);
  const problem = !canCreate ? "Você não possui permissão para assinar." : signerProblem(signer, now) || (!documentTypes.some(type => type.id === documentTypeId && type.active) ? "Selecione um tipo de documento ativo." : "") || integrationProblem(integration, method, now);
  const pending = items.filter(item => item.status !== "success").length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current) return;
    const currentProblem = signerProblem(signer) || integrationProblem(integration, method);
    if (problem || currentProblem || !password || !pending) { setMessage(problem || currentProblem || "Informe a senha pessoal e selecione arquivos pendentes."); return; }
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

  return <section className="mx-auto w-full max-w-5xl space-y-5 p-4 text-sm" aria-labelledby="assine-title">
    <h1 id="assine-title" className="text-xl font-semibold">Assine Agora</h1>
    <p>O arquivo ORIGINAL é preservado. A assinatura gera um comprovante JSON destacado; não altera o PDF nem produz assinatura PAdES incorporada.</p>
    <p className="rounded-md border p-3">Armazenamento Blob privado por <strong>90 dias</strong>, com download autenticado. Após a expiração, o original fica indisponível e é excluído pela rotina de retenção. O comprovante, os metadados e a validação permanecem disponíveis.</p>
    <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
      <fieldset disabled={busy || locked} className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-semibold">Identificação da assinatura</legend>
        <div><label htmlFor={`${id}-signer`}>Assinador</label><select id={`${id}-signer`} className={field} value={signerId} onChange={event => setSignerId(event.target.value)} required><option value="">Selecione…</option>{signers.map(value => <option key={value.id} value={value.id}>{value.name} · {value.active ? `válido até ${date(value.validUntil)}` : "inativo"}</option>)}</select></div>
        <div><label htmlFor={`${id}-type`}>Tipo de documento</label><select id={`${id}-type`} className={field} value={documentTypeId} onChange={event => setDocumentTypeId(event.target.value)} required><option value="">Selecione…</option>{documentTypes.map(type => <option key={type.id} value={type.id} disabled={!type.active}>{type.name}{!type.active ? " · inativo" : ""}</option>)}</select></div>
        <div><label htmlFor={`${id}-method`}>Método</label><select id={`${id}-method`} className={field} value={method} onChange={event => { setMethod(event.target.value as CentralSignatureMethod); setIntegrationId(""); }}><option value="INTERNAL">Assinatura interna</option><option value="A1_ECPF">A1 e-CPF</option><option value="A1_ECNPJ">A1 e-CNPJ</option></select></div>
        {method !== "INTERNAL" && <div><label htmlFor={`${id}-integration`}>Integração A1</label><select id={`${id}-integration`} className={field} value={integrationId} onChange={event => setIntegrationId(event.target.value)} required><option value="">Selecione…</option>{integrations.filter(value => value.kind === method).map(value => <option key={value.id} value={value.id}>{value.alias} · {value.ownerName} · {value.active ? `até ${date(value.validTo)}` : "inativa"}</option>)}</select></div>}
      </fieldset>
      {signer && <p>Assinador: <strong>{signer.name}</strong> · {signer.role} · {signer.active ? "Ativo" : "Inativo"} · validade {date(signer.validUntil)}. Use a senha pessoal deste assinador.</p>}
      {integration && method !== "INTERNAL" && <p>Certificado: {integration.ownerName} · {date(integration.validFrom)} a {date(integration.validTo)} · {integration.active ? "Ativo" : "Inativo"}. O servidor confirma o vínculo CPF/CNPJ.</p>}
      {locked && <p>Identificação bloqueada para preservar a idempotência dos retries. Para alterar, inicie um novo lote após resolver as tentativas pendentes.</p>}
      <label className="block">Arquivos (até 20, máximo 3 MiB cada)<input className={field} type="file" multiple accept={FILE_ACCEPT} disabled={busy || locked} onChange={event => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (items.length + files.length > MAX_BATCH_FILES) { setMessage("O lote aceita no máximo 20 arquivos. Nenhum arquivo desta seleção foi adicionado."); return; }
        setItems(current => [...current, ...files.map(file => ({ requestId: crypto.randomUUID(), file, status: "pending" as const, error: fileError(file) }))]);
        setMessage("");
      }} /></label>
      <p>PDF, JPEG, PNG, TXT, DOC, DOCX e ODT. O servidor verifica os bytes e calcula o hash real. Processamento sequencial; somente pendentes e falhas são enviados novamente.</p>
      <label className="block">Senha pessoal do assinador<input className={field} type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} disabled={busy || !canCreate} required /></label>
      {problem && <p role="status">{problem}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || !!problem || !pending || !password}>{busy ? "Assinando sequencialmente…" : locked ? "Repetir pendentes/falhas" : "Assinar lote"}</Button>
        <Button type="button" variant="outline" disabled={busy || !items.length} onClick={() => { setItems([]); setLocked(false); lockedOptions.current = null; setPassword(""); setMessage(""); }}>{locked && pending > 0 ? "Descartar pendentes e iniciar novo lote" : "Novo lote"}</Button></div>
    </form>
    {message && <p role="alert">{message}</p>}
    <div className="space-y-3" aria-live="polite" aria-label="Resultados individuais do lote">
      <p>{items.filter(item => item.status === "success").length} concluídos · {pending} pendentes/falhas · {items.length} arquivos</p>
      {items.map(item => <article key={item.requestId} className="rounded-md border p-3">
        <h2 className="break-all font-semibold">{item.file.name}</h2><p>{item.file.size.toLocaleString("pt-BR")} bytes · {({ pending: "Pendente", sending: "Enviando…", success: "Assinado", error: "Falha" })[item.status]}</p>
        {item.error && <p role="alert">{item.error}</p>}
        {!locked && <Button type="button" variant="outline" size="sm" onClick={() => setItems(current => current.filter(value => value.requestId !== item.requestId))}>Remover {item.file.name}</Button>}
        {item.record && <><p>Código: {item.record.code} · Assinado em {date(item.record.signedAt)} · Original expira em {date(item.record.expiresAt)}</p><p className="break-all">SHA-256: {item.record.hashSha256}</p><div className="mt-2 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={downloadBusy || !!item.record.storageDeletedAt || Date.parse(item.record.expiresAt) <= now} onClick={() => void download(item, "documentos")}>Baixar original preservado</Button><Button type="button" size="sm" disabled={downloadBusy} onClick={() => void download(item, "comprovantes")}>Baixar comprovante JSON destacado</Button><a className="underline" href={`/validar-assinatura/${encodeURIComponent(item.record.code)}`} target="_blank" rel="noopener noreferrer">Validação pública</a></div></>}
      </article>)}
    </div>
  </section>;
}
