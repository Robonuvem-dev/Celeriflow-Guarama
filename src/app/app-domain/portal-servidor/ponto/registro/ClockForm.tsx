"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { registerMyClock } from "./actions";

export function OwnClockForm() {
  const router = useRouter(); const [pending, setPending] = useState(false), [error, setError] = useState(""), [receipt, setReceipt] = useState("");
  const [keys, setKeys] = useState<Partial<Record<"ENTRY" | "EXIT", string>>>({});
  async function record(kind: "ENTRY" | "EXIT") {
    const requestKey = keys[kind] || crypto.randomUUID(); setKeys(current => ({ ...current, [kind]: requestKey })); setPending(true); setError("");
    try { const result = await registerMyClock({ kind, requestKey }); if (result.error) setError(result.error); else if ("recordedAt" in result) { setReceipt(`${kind === "ENTRY" ? "Entrada" : "Saída"} registrada em ${new Date(result.recordedAt).toLocaleString("pt-BR")}. Identificador: ${result.id}`); router.refresh(); } }
    catch { setError("Não foi possível confirmar a marcação. Tente novamente."); }
    finally { setPending(false); }
  }
  return <section className="space-y-3 rounded border border-slate-300 bg-white p-4 text-sm"><p>O horário da marcação é obtido no servidor. Marcação ou abono anterior deve ser solicitado ao RH.</p><div className="flex gap-2"><Button disabled={pending} onClick={() => record("ENTRY")}>Registrar entrada</Button><Button disabled={pending} variant="outline" onClick={() => record("EXIT")}>Registrar saída</Button></div>{error && <p role="alert" className="text-red-700">{error}</p>}{receipt && <p role="status" className="text-emerald-800">{receipt}</p>}</section>;
}
