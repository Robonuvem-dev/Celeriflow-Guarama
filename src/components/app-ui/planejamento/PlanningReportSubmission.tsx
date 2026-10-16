"use client";
import { useState } from "react";

export function PlanningReportSubmission({ action, children }: { action: string; children: React.ReactNode }) {
  const [pending, setPending] = useState(false); const [error, setError] = useState("");
  const [publication, setPublication] = useState<{ url?: string; downloadUrl: string; message: string }>();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries([...form].filter(([, value]) => value !== ""));
    input.instrumentIds = [String(form.get("instrumentIds")), ...form.getAll("additionalInstrumentIds").map(String)].join(",");
    try {
      const response = await fetch(action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const result = await response.json() as { id?: string; error?: string; publicationStatus?: string; publicationError?: string; publicUrl?: string };
      if (!response.ok || !result.id) throw new Error(result.error ?? "Não foi possível emitir o documento.");
      const downloadUrl = `${action}?${new URLSearchParams({ snapshotId: result.id, format: String(form.get("format") ?? "PDF") })}`;
      if (result.publicationStatus) { setPublication({ downloadUrl, url: result.publicationStatus === "PUBLISHED" ? result.publicUrl : undefined, message: result.publicationStatus === "PUBLISHED" ? "Publicação confirmada; o arquivo público é o mesmo preservado para download interno." : result.publicationError ?? "Publicação não confirmada. O documento interno foi preservado." }); }
      else window.location.assign(downloadUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível emitir o documento."); }
    finally { setPending(false); }
  }
  return <form action={action} onSubmit={submit}><fieldset disabled={pending} className="grid gap-3 md:grid-cols-2">{children}</fieldset>{pending && <p role="status" className="mt-2 text-sm">Gerando e preservando o documento…</p>}{error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}{publication && <p role="status" className="mt-2 rounded border p-3 text-sm">{publication.message}<a className="ml-2 underline" href={publication.downloadUrl}>Baixar documento interno preservado</a>{publication.url && <a className="ml-2 underline" href={publication.url} target="_blank" rel="noreferrer">Arquivo público</a>}</p>}</form>;
}
