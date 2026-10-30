"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import type { CentralValidation } from "@/lib/contracts/signature-central";
import { validationCode } from "@/app/validar-assinatura/validation-input";
import { Button } from "@/components/ui/button";

function isValidation(value: unknown): value is CentralValidation {
  if (!value || typeof value !== "object") return false;
  const result = value as CentralValidation;
  return typeof result.valid === "boolean" && typeof result.message === "string" && typeof result.fileCompared === "boolean" && Array.isArray(result.records) && result.records.every(record => record && typeof record.code === "string" && typeof record.signerDocumentMasked === "string" && typeof record.valid === "boolean");
}

export default function CentralValidationForm({ initialCode = "" }: { initialCode?: string }) {
  const id = useId();
  const [code, setCode] = useState(initialCode);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CentralValidation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const clearResult = () => { setResult(null); setError(""); };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current) return;
    setResult(null); setError("");
    let normalized: string;
    try {
      normalized = validationCode(code);
      if (!normalized && !file) throw new Error("Informe um código, um arquivo ou ambos.");
      if (file && (!file.size || file.size > 3 * 1024 * 1024)) throw new Error("O arquivo deve ter conteúdo e no máximo 3 MiB.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Confira os dados informados."); return; }
    running.current = true; setBusy(true);
    try {
      const body = new FormData();
      if (normalized) body.set("code", normalized);
      if (file) body.set("file", file);
      const response = await fetch("/api/assinatura-digital/validar", { method: "POST", body, cache: "no-store", credentials: "omit" });
      const value: unknown = await response.json();
      if (response.status >= 400 && response.status < 500 && !isValidation(value)) {
        const message = value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : "Confira o código/arquivo e tente novamente.";
        setError(`A consulta não pôde ser concluída: ${message}`);
        return;
      }
      // 5xx/rede nunca são apresentados como prova inválida.
      if (response.status >= 500 || !isValidation(value)) throw new Error("O serviço de validação está indisponível. Tente novamente; esta falha não indica adulteração do documento.");
      setResult(value);
    } catch (failure) { setError(failure instanceof Error && failure.message.startsWith("O serviço") ? failure.message : "Validação indisponível por falha de comunicação. Tente novamente; não é possível concluir a validade agora."); }
    finally { running.current = false; setBusy(false); }
  }

  return <section className="space-y-4" aria-label="Validação de assinatura">
    <p>Envie o arquivo original, informe o código/URL do comprovante ou use ambos. Com código e arquivo, a validação deve confirmar a correspondência entre eles. Sem arquivo, os bytes do seu documento não são comparados.</p>
    <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
      <div><label htmlFor={`${id}-code`} className="block font-medium">Código ou URL de validação</label><input id={`${id}-code`} name="code" type="text" maxLength={2048} value={code} onChange={event => { setCode(event.target.value); clearResult(); }} disabled={busy} className="w-full rounded-md border bg-background px-3 py-2" aria-describedby={`${id}-privacy`} /></div>
      <div><label htmlFor={`${id}-file`} className="block font-medium">Arquivo original (máximo 3 MiB)</label><input id={`${id}-file`} name="file" type="file" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); clearResult(); }} className="block w-full rounded-md border p-2" />{file && <div className="mt-1 flex flex-wrap gap-2"><span className="break-all">Selecionado: {file.name}</span><button type="button" className="underline" disabled={busy} onClick={() => { setFile(null); const input = document.getElementById(`${id}-file`) as HTMLInputElement | null; if (input) input.value = ""; clearResult(); }}>Remover arquivo</button></div>}</div>
      <p id={`${id}-privacy`} className="text-sm">Ao selecionar Validar, o arquivo será enviado ao serviço público para calcular e comparar seu hash. A consulta exibe somente dados públicos permitidos, com CPF/CNPJ mascarado. URLs informadas são usadas apenas para extrair o código.</p>
      <Button type="submit" disabled={busy || (!code.trim() && !file)}>{busy ? "Validando…" : "Validar assinatura"}</Button>
    </form>
    {error && <div role="alert" className="rounded-md border border-amber-500 p-3"><h2 className="font-semibold">Validação indisponível</h2><p>{error}</p></div>}
    {result && <section role="status" className={`space-y-3 rounded-md border p-4 ${result.valid ? "border-emerald-600" : "border-red-600"}`}>
      <h2 className="text-lg font-semibold">{result.valid ? "Assinatura válida" : "Assinatura inválida"}</h2><p>{result.message}</p>
      <p><strong>{result.fileCompared ? "Arquivo comparado" : "Arquivo não comparado"}</strong>{result.fileCompared ? ": o serviço comparou os bytes enviados." : ": consulta por código não comprova os bytes de um arquivo local."}</p>
      <p>O fim da retenção do original após 90 dias não invalida a prova da assinatura.</p>
      {result.records.map((record, index) => <dl key={`${record.code}-${index}`} className="space-y-1 border-t pt-3">
        <div><dt className="font-semibold">Resultado da assinatura</dt><dd>{record.valid ? "Válida" : "Inválida"}</dd></div>
        <div><dt className="font-semibold">Código</dt><dd className="break-all">{record.code}</dd></div>
        <div><dt className="font-semibold">Documento</dt><dd className="break-all">{record.filename} · {record.documentTypeName}</dd></div>
        <div><dt className="font-semibold">Assinador</dt><dd>{record.signerName} · {record.signerRole} · {record.signerDocumentMasked}</dd></div>
        <div><dt className="font-semibold">Método</dt><dd>{record.method === "INTERNAL" ? "Assinatura interna" : record.method === "A1_ECPF" ? "A1 e-CPF" : "A1 e-CNPJ"}</dd></div>
        <div><dt className="font-semibold">Assinado em</dt><dd>{new Date(record.signedAt).toLocaleString("pt-BR")}</dd></div>
        <div><dt className="font-semibold">Retenção do original até</dt><dd>{new Date(record.expiresAt).toLocaleString("pt-BR")}</dd></div>
        <div><dt className="font-semibold">SHA-256</dt><dd className="break-all font-mono text-xs">{record.hashSha256}</dd></div>
      </dl>)}
    </section>}
  </section>;
}
