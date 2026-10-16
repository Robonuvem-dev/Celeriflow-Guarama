"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

export function PublicationUpload({ years, userId, documentPrefix,collections }: { years: number[]; userId: string; documentPrefix: string;collections:{slug:string;title:string}[] }) {
  const [busy, setBusy] = useState(false), [messages, setMessages] = useState<string[]>([]);
  const router = useRouter();
  return <form className="space-y-3 rounded border bg-white p-4" onSubmit={async event => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const files = data.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    setBusy(true); setMessages([]);
    try {
      for (const file of files) {
        const metadata = Object.fromEntries(["collectionSlug", "entity", "year", "group", "referencePeriod","version","documentKind","legalStage"].map(key => [key, String(data.get(key) || "")]));
        metadata.title = files.length === 1 && data.get("title") ? String(data.get("title")) : file.name.replace(/\.[^.]+$/, "");
        const uploadId = crypto.randomUUID();
        try {
          const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
          const extension=file.name.split(".").pop()?.toLowerCase()||"",contentType=({pdf:"application/pdf",csv:"text/csv",txt:"text/plain",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",zip:"application/zip"} as Record<string,string>)[extension];
          if(!contentType||file.size>100*1024*1024)throw new Error("Formato não permitido ou arquivo acima de 100 MB.");
          const blob = await upload(`${documentPrefix}transparencia/${userId}/${uploadId}/${safeName}`, file, { access: "private",contentType, handleUploadUrl: "/api/transparencia/gestao/upload", clientPayload: JSON.stringify({ uploadId, filename: file.name, metadata }) });
          const response = await fetch("/api/transparencia/gestao/confirmar-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId, filename: file.name, metadata, url: blob.url, pathname: blob.pathname }) });
          const result = await response.json();
          setMessages(previous => [...previous, `${file.name}: ${response.ok ? "enviado como rascunho" : result.error || "falha no upload"}`]);
        } catch(error) { setMessages(previous => [...previous, `${file.name}: ${error instanceof Error?error.message:"conexão interrompida"}`]); }
      }
      router.refresh();
    } finally { setBusy(false); }
  }}>
    <h2 className="font-bold">Upload de documentos para acesso externo</h2>
    <p className="text-sm text-slate-600">Envio direto ao Vercel Blob privado (até 100 MB por arquivo). Em lote, o nome do arquivo será o título; agrupe por assunto e exercício. Depois, confira e publique os rascunhos.</p>
    <fieldset disabled={busy} className="grid gap-3 md:grid-cols-3">
      <label>Título (arquivo único)<input name="title" className="block w-full rounded border p-2" maxLength={250} /></label>
      <label>Entidade<select name="entity" className="block w-full rounded border p-2"><option value="prefeitura">Prefeitura</option><option value="camara">Câmara</option></select></label>
      <label>Exercício<select name="year" className="block w-full rounded border p-2">{years.map(year => <option key={year}>{year}</option>)}</select></label>
      <label>Consulta<select name="collectionSlug" defaultValue="publicacoes" className="block w-full rounded border p-2">{collections.map(collection => <option key={collection.slug} value={collection.slug}>{collection.title}</option>)}</select></label>
      <label>Assunto<input required name="group" placeholder="Ex.: RREO, Saúde, LDO, Obras" className="block w-full rounded border p-2" maxLength={200} /></label>
      <label>Competência/período<input required name="referencePeriod" placeholder="Ex.: 2º quadrimestre/2026" className="block w-full rounded border p-2" maxLength={200} /></label>
      <label>Versão do documento<input required name="version" type="number" min={1} max={10000} defaultValue={1} className="block w-full rounded border p-2"/></label>
      <label>Categoria documental<select name="documentKind" className="block w-full rounded border p-2">{["OUTRO","PCA_CONTRATACOES","PCA_CONTAS","PPA","LDO","LOA","RGF","RREO","DCASP","PMS","PAS","RAG","RDQA","ATA","SIGILO","DESCLASSIFICACAO"].map(kind=><option key={kind}>{kind}</option>)}</select></label><label>Estágio jurídico/contábil<select name="legalStage" className="block w-full rounded border p-2">{["REFERENCIA","APRESENTADO","EM_TRAMITACAO","ANALISE_TECNICA","JULGADO","VIGENTE","NAO_APLICAVEL"].map(stage=><option key={stage}>{stage}</option>)}</select></label>
      <label className="md:col-span-3">PDF, CSV, TXT, PNG, JPEG ou ZIP<input required multiple type="file" accept=".pdf,.csv,.txt,.png,.jpg,.jpeg,.zip" name="files" className="block w-full rounded border p-2" /></label>
      <button className="rounded bg-sky-900 px-4 py-2 text-white">{busy ? "Enviando…" : "Enviar documentos"}</button>
    </fieldset>
    <ul aria-live="polite" className="text-sm">{messages.map((message, index) => <li key={index}>{message}</li>)}</ul>
  </form>;
}
