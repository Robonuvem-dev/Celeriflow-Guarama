"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ConstructionExtractionClient({ caseId, canExtract }: { caseId: string; canExtract: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (!canExtract) return null;
  return <form className="flex flex-wrap items-center gap-3 rounded border p-3" onSubmit={async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); form.set("caseId", caseId); form.set("requestKey", crypto.randomUUID()); setBusy(true); setError("");
    try { const response = await fetch("/api/construcao-civil/pranchas", { method: "POST", body: form }); const result = await response.json(); if (!response.ok) throw new Error(result.error); router.refresh(); } catch (error) { setError(error instanceof Error ? error.message : "Falha na extração."); } finally { setBusy(false); }
  }}><label className="text-sm">Prancha PDF (até 15 MB)<input name="file" type="file" accept="application/pdf" required disabled={busy} className="block" /></label><button disabled={busy} className="rounded border px-3 py-2 text-sm">{busy ? "Extraindo…" : "Extrair e comparar"}</button>{error && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}</form>;
}
