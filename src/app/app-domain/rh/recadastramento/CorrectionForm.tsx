"use client";
import { useState, useTransition } from "react";
import { requestRecertificationCorrectionAction, reconcileRecertificationDependent } from "./actions";

export function RecertificationCorrectionForm({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition(), [error, setError] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setError("");
    startTransition(async () => { try { const result = await requestRecertificationCorrectionAction({ requestId, instructions: String(data.get("instructions")) }); setError(result.error); } catch { setError("Não foi possível solicitar correção."); } });
  }
  return <form onSubmit={submit} className="mt-3 space-y-2"><label className="flex flex-col gap-1">Pendência para correção<textarea name="instructions" required minLength={10} maxLength={4000} disabled={pending} className="rounded border p-2" /></label><button disabled={pending} className="rounded border px-3 py-2 font-semibold">{pending ? "Registrando…" : "Devolver para correção"}</button>{error && <p role="alert" className="text-red-700">{error}</p>}</form>;
}

export function RecertificationDependentReconciliation({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition(), [message, setMessage] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    startTransition(async () => { try { const result = await reconcileRecertificationDependent({ requestId, cpf: String(data.get("cpf")) }); setMessage(result.error || `Pessoa canônica conferida: ${result.id}. O relacionamento depende do deferimento da proposta.`); } catch { setMessage("Não foi possível sanear o dependente."); } });
  }
  return <form onSubmit={submit} className="mt-3 space-y-2 rounded border p-3"><label className="flex flex-col gap-1">CPF do dependente proposto, com documento conferido<input name="cpf" required disabled={pending} className="h-8 rounded border px-2" /></label><button disabled={pending} className="rounded border px-3 py-2 font-semibold">{pending ? "Conferindo…" : "Sanear pessoa física com autorização de Cadastro Único"}</button>{message && <p role="status">{message}</p>}</form>;
}
