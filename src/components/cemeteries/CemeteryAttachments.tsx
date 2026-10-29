"use client";
import { useEffect, useState } from "react";
import CemeteryLookup from "./CemeteryLookup";
import { attachDocumentAction } from "@/app/app-domain/cemiterios/actions";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import styles from "@/components/app-ui/operational/operational.module.css";

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
    <OperationalTablePanel title="Anexos GED" triggerLabel={`Consultar anexos (${data.total})`}><OperationalListFrame label="Anexos GED" pagination={<OperationalPagination page={page} total={data.total} onPageChange={setPage} />}>
      <OperationalTable preferenceId="cemeteries:attachments" caption="Anexos GED" columns={[{ key: "title", label: "Título", type: "text", minWidth: 180, initialWidth: 420, resizable: true, sortable: false, details: "overflow" }, { key: "date", label: "Registrado em", type: "text", minWidth: 150, initialWidth: 200, resizable: true, sortable: false, details: "overflow" }, { key: "author", label: "Autor", type: "identifier", minWidth: 120, initialWidth: 220, resizable: true, sortable: false, details: "overflow" }, { key: "actions", label: "Ações", type: "actions", minWidth: 70, initialWidth: 80, resizable: false, sortable: false, details: "none" }]}
        rows={data.items.map(item => ({ id: item.id, label: item.title, values: { title: item.title, date: new Date(item.createdAt).toLocaleString("pt-BR"), author: item.authorId }, actions: <a href={`/api/cemiterios/anexos/${item.id}`} target="_blank" rel="noreferrer" className={styles.dialogButton}>Abrir</a> }))} emptyMessage="Nenhum anexo." />
    </OperationalListFrame></OperationalTablePanel>
  </section>;
}
export default CemeteryAttachments;
