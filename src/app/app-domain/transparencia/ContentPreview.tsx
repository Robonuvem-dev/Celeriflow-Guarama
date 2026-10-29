"use client";
/* eslint-disable @next/next/no-img-element -- Prévia de URLs municipais externas, como nas telas editoriais de origem. */

import { useEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { paginateFullValue } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

// Montado dentro do portal: a medição começa quando o corpo do diálogo existe.
function PreviewText({ text }: { text: string }) {
  const body = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState<string[]>([]);
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => {
    const element = body.current;
    if (!element) return;
    const measure = () => {
      const probe = document.createElement("div");
      const computed = getComputedStyle(element);
      Object.assign(probe.style, { position: "fixed", visibility: "hidden", width: `${element.clientWidth}px`, font: computed.font, lineHeight: computed.lineHeight, whiteSpace: "pre-wrap", overflowWrap: "anywhere" });
      document.body.appendChild(probe);
      try { setPages(paginateFullValue(text || "Sem conteúdo.", value => { probe.textContent = value; return probe.scrollHeight <= element.clientHeight && probe.scrollWidth <= element.clientWidth + 1; })); setPage(0); }
      finally { probe.remove(); }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    document.fonts.addEventListener("loadingdone", measure);
    return () => { observer.disconnect(); document.fonts.removeEventListener("loadingdone", measure); };
  }, [text]);
  return <>
    <div ref={body} style={{ height: "min(30dvh, 240px)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: ".8125rem", lineHeight: "1.4" }}>{pages[page] || "Preparando leitura…"}</div>
    <div className={styles.dialogFooter}><div className={styles.dialogButtons}><button type="button" className={styles.dialogButton} disabled={page === 0} onClick={() => setPage(current => current - 1)}>Anterior</button><span aria-live="polite">{page + 1} de {Math.max(1, pages.length)}</span><button type="button" className={styles.dialogButton} disabled={page >= pages.length - 1} onClick={() => setPage(current => current + 1)}>Próximo</button></div><button type="button" className={styles.dialogButton} onClick={async () => { try { await navigator.clipboard.writeText(text); setCopyStatus("Conteúdo integral copiado."); } catch { setCopyStatus("Cópia indisponível; todos os trechos permanecem acessíveis."); } }}>Copiar tudo</button></div>
    <span role="status">{copyStatus}</span>
  </>;
}

/** Prévia composta de conteúdo editorial; texto integral paginado por espaço real. */
export function ContentPreview({ title, description, text, imageUrl }: { title: string; description: string; text: string; imageUrl?: string | null }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  return <><button ref={trigger} type="button" className={styles.iconButton} aria-label={`Ver conteúdo de ${title}`} onClick={() => setOpen(true)}><Eye /></button><Dialog open={open} onOpenChange={setOpen}><DialogContent showCloseButton={false} initialFocus={close} finalFocus={trigger} className={styles.dialog}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{imageUrl && <div className="flex h-28 justify-center"><img src={imageUrl} alt={title} className="h-full max-w-full object-contain" /></div>}<PreviewText text={text} /><button ref={close} type="button" className={styles.dialogButton} onClick={() => setOpen(false)}>Fechar</button></DialogContent></Dialog></>;
}
