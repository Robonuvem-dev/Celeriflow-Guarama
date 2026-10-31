"use client";

import { useEffect, useRef, useState } from "react";
import type { GedZone } from "@/lib/documents/ged-policy";
import { gedCommand, gedDownloadUrl } from "./ged-client";

export function GedZoneViewer({ documentId, versionId, mimeType, onRecognized }: { documentId: string; versionId: string; mimeType: string; onRecognized: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1), [pages, setPages] = useState(1), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [label, setLabel] = useState("Campo reconhecido"), [zone, setZone] = useState({ x: 0.1, y: 0.1, width: 0.4, height: 0.15 });
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    let cancelled = false; let cleanup: (() => void) | undefined;
    (async () => {
      const response = await fetch(gedDownloadUrl(documentId, versionId, true));
      if (!response.ok) throw new Error("Original indisponível.");
      const element = canvas.current; if (!element) return;
      const context = element.getContext("2d"); if (!context) return;
      if (mimeType === "application/pdf") {
        const [pdfjs, worker] = await Promise.all([import("pdfjs-dist/build/pdf.mjs"), import("pdfjs-dist/build/pdf.worker.min.mjs")]);
        if (cancelled) return;
        (globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker = worker;
        const task = pdfjs.getDocument({ data: new Uint8Array(await response.arrayBuffer()) });
        cleanup = () => { void task.destroy(); };
        const pdf = await task.promise;
        if (cancelled) return;
        setPages(pdf.numPages);
        const sheet = await pdf.getPage(Math.min(page, pdf.numPages));
        const viewport = sheet.getViewport({ scale: 1, rotation: 0 });
        element.width = viewport.width; element.height = viewport.height;
        await sheet.render({ canvas: element, canvasContext: context, viewport }).promise;
      } else if (mimeType.startsWith("image/")) {
        const objectUrl = URL.createObjectURL(await response.blob());
        cleanup = () => URL.revokeObjectURL(objectUrl);
        const image = new Image();
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Imagem inválida.")); image.src = objectUrl; });
        if (cancelled) return;
        element.width = image.naturalWidth; element.height = image.naturalHeight;
        context.drawImage(image, 0, 0); setPages(1);
      } else throw new Error("Seleção de zonas disponível para PDF e imagens.");
      if (!cancelled) setReady(true);
    })().catch(error => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; cleanup?.(); };
  }, [documentId, versionId, mimeType, page]);
  const point = (event: React.PointerEvent<SVGSVGElement>) => { const box = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) }; };
  return <section className="grid gap-3"><p className="text-sm">Arraste sobre a página para delimitar uma zona. As coordenadas são relativas à página, com origem no canto superior esquerdo.</p>
    <div className="flex flex-wrap gap-3"><label>Página <input type="number" min={1} max={pages} className="w-16 rounded border p-1" value={page} onChange={event => { setReady(false); setMessage(""); setPage(Math.max(1, Math.min(pages, Number(event.target.value) || 1))); }} /> / {pages}</label><label>Nome do campo <input className="rounded border p-1" maxLength={100} value={label} onChange={event => setLabel(event.target.value)} /></label></div>
    <div className="relative max-w-lg border bg-white" style={{ touchAction: "none" }}><canvas ref={canvas} className="block h-auto w-full" />
      {ready && <svg role="img" aria-label="Área de seleção OCR" viewBox="0 0 1000 1000" preserveAspectRatio="none" className="absolute inset-0 h-full w-full cursor-crosshair"
        onPointerDown={event => { start.current = point(event); event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => { if (!start.current) return; const end = point(event); setZone({ x: Math.min(start.current.x, end.x), y: Math.min(start.current.y, end.y), width: Math.abs(end.x - start.current.x), height: Math.abs(end.y - start.current.y) }); }}
        onPointerUp={() => { start.current = null; }} onPointerCancel={() => { start.current = null; }}>
        <rect x={zone.x * 1000} y={zone.y * 1000} width={zone.width * 1000} height={zone.height * 1000} fill="rgba(37,99,235,.15)" stroke="#2563eb" strokeWidth="3" /></svg>}
    </div>
    <div className="flex flex-wrap gap-2">{(["x", "y", "width", "height"] as const).map(key => <label key={key} className="text-xs">{key}<input aria-label={`Zona OCR ${key}`} type="number" min={0} max={1} step={0.001} className="ml-1 w-20 rounded border p-1" value={Number(zone[key].toFixed(3))} onChange={event => setZone({ ...zone, [key]: Number(event.target.value) })} /></label>)}</div>
    <button disabled={!ready || busy || !zone.width || !zone.height} className="w-fit rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50" onClick={async () => { setBusy(true); setMessage(""); try { const result = await gedCommand("ocr-zone", documentId, { ...zone, page, label, rotation: 0 } satisfies GedZone); setMessage(`${result.text} — confiança: ${result.confidence == null ? "não informada" : result.confidence}`); onRecognized(); } catch (error) { setMessage(error instanceof Error ? error.message : "Falha no reconhecimento."); } finally { setBusy(false); } }}>{busy ? "Reconhecendo…" : "Reconhecer zona"}</button>
    {message && <p role="status" className="whitespace-pre-wrap text-sm">{message}</p>}
  </section>;
}
