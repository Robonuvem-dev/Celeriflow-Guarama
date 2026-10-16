"use client";
import { useRef, useState, useTransition } from "react";
import { requestAutomaticViability } from "./actions";

export default function AutomaticViabilityButton({ caseId }: { caseId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const requestKey = useRef<string | null>(null);
  return <div className="space-y-2"><button className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={pending} onClick={() => startTransition(async () => {
    requestKey.current ||= crypto.randomUUID();
    const result = await requestAutomaticViability({ caseId, requestKey: requestKey.current });
    setMessage(result.error || "Consulta registrada. Confira a memória e a situação da assinatura abaixo.");
    if (result.success) requestKey.current = null;
  })}>{pending ? "Calculando e registrando…" : "Consultar viabilidade online"}</button><p role="status" className="text-sm">{message}</p></div>;
}
