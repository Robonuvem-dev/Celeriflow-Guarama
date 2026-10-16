"use client";
import { useEffect, useState } from "react";
import CemeteryLookup from "./CemeteryLookup";
import { attachDocumentAction } from "@/app/app-domain/cemiterios/actions";

type TargetType = "LOTE" | "SEPULTURA" | "SEPULTAMENTO" | "VELORIO" | "CREMACAO";
export function CemeteryAttachments({ targetType, targetId }: { targetType: TargetType; targetId: string }) {
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<{ total: number; items: { id: string; title: string; createdAt: string; authorId: string }[] }>({ total: 0, items: [] });
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/cemiterios/anexos?${new URLSearchParams({ targetType, targetId, page: String(page) })}`, { signal: controller.signal }).then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error); setData(value); }).catch(e => { if (!controller.signal.aborted) setMessage(e.message); });
    return () => controller.abort();
  }, [targetType, targetId, page, version]);
  return <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Anexos GED · {data.total}</h2>{message && <p role="status">{message}</p>}
    <form className="grid gap-2" onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; setPending(true); setMessage(""); try { const body = new FormData(form); body.set("targetType", targetType); body.set("targetId", targetId); body.set("requestKey", crypto.randomUUID()); const response = await fetch("/api/cemiterios/anexos", { method: "POST", body }); const result = await response.json(); if (!response.ok) throw new Error(result.error); form.reset(); setVersion(v => v + 1); setMessage("Anexo gravado no GED."); } catch (error) { setMessage(error instanceof Error ? error.message : "Upload indisponível."); } finally { setPending(false); } }}>
      <label className="grid gap-1">Título<input name="title" maxLength={180} required className="rounded border p-2" /></label><label className="grid gap-1">PDF, JPG ou PNG<input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required /></label><button disabled={pending} className="rounded border p-2">Enviar arquivo</button>
    </form>
    <details><summary>Vincular documento GED existente</summary><form className="grid gap-2 py-2" onSubmit={async e => { e.preventDefault(); setPending(true); try { const form = new FormData(e.currentTarget); const result = await attachDocumentAction({ targetType, targetId, documentId: String(form.get("documentId")) }); if (result.error) throw new Error(result.error); setVersion(v => v + 1); setMessage("Documento vinculado."); } catch (error) { setMessage(error instanceof Error ? error.message : "Vínculo indisponível."); } finally { setPending(false); } }}><CemeteryLookup name="documentId" kind="document" label="Documento GED (permissão GED necessária)" required /><button className="rounded border p-2" disabled={pending}>Vincular</button></form></details>
    <ul>{data.items.map(i => <li key={i.id} className="border-t py-2"><a href={`/api/cemiterios/anexos/${i.id}`} target="_blank" rel="noreferrer" className="underline">{i.title}</a> · {new Date(i.createdAt).toLocaleString("pt-BR")} · autor {i.authorId}</li>)}</ul>{!data.items.length && <p>Nenhum anexo.</p>}
    <div className="flex gap-3"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page}</span><button disabled={page * 20 >= data.total} onClick={() => setPage(p => p + 1)}>Próxima</button></div>
  </section>;
}
export default CemeteryAttachments;
