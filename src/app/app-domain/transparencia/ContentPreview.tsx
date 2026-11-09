"use client";
/* eslint-disable @next/next/no-img-element -- Prévia de URLs municipais externas, como nas telas editoriais de origem. */

import { useRef, useState } from "react";
import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import styles from "@/components/app-ui/operational/operational.module.css";

function PreviewText({ text }: { text: string }) {
  const [copyStatus, setCopyStatus] = useState("");
  return <>
    <div style={{ maxHeight: "min(40dvh, 320px)", overflowY: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: ".8125rem", lineHeight: "1.4" }}>{text || "Sem conteúdo."}</div>
    <div className={styles.dialogFooter}><span role="status">{copyStatus}</span><button type="button" className={styles.dialogButton} onClick={async () => { try { await navigator.clipboard.writeText(text); setCopyStatus("Conteúdo integral copiado."); } catch { setCopyStatus("Cópia indisponível; o conteúdo permanece acessível para leitura."); } }}>Copiar tudo</button></div>
  </>;
}

/** Prévia composta de conteúdo editorial com rolagem vertical padrão. */
export function ContentPreview({ title, description, text, imageUrl }: { title: string; description: string; text: string; imageUrl?: string | null }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  return <><button ref={trigger} type="button" className={styles.iconButton} aria-label={`Ver conteúdo de ${title}`} onClick={() => setOpen(true)}><Eye /></button><Dialog open={open} onOpenChange={setOpen}><DialogContent showCloseButton={false} initialFocus={close} finalFocus={trigger} className={styles.dialog}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{imageUrl && <div className="flex h-28 justify-center"><img src={imageUrl} alt={title} className="h-full max-w-full object-contain" /></div>}<PreviewText text={text} /><button ref={close} type="button" className={styles.dialogButton} onClick={() => setOpen(false)}>Fechar</button></DialogContent></Dialog></>;
}
