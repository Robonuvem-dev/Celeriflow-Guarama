"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { evaluateConstructionCase } from "../rules-actions";

export default function ConstructionViabilityClient({ caseId, canEvaluate }: { caseId: string; canEvaluate: boolean }) {
  const router = useRouter();
  const key = useRef("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function evaluate() {
    setPending(true); setError("");
    if (!key.current) key.current = crypto.randomUUID();
    try {
      const result = await evaluateConstructionCase({ caseId, requestKey: key.current });
      if (result.error) { setError(result.error); return; }
      key.current = ""; router.refresh();
    } catch { setError("Falha de comunicação. Tente novamente para recuperar a mesma avaliação."); } finally { setPending(false); }
  }
  return <div className="space-y-2"><p className="text-xs text-slate-500">Avalia finalidade, categoria, área mínima e coeficiente de aproveitamento pelo zoneamento vinculado. Não emite licença nem substitui os demais critérios do plano diretor.</p>{canEvaluate && <button disabled={pending} onClick={evaluate} className="rounded bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">{pending ? "Avaliando..." : "Avaliar parâmetros urbanísticos"}</button>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</div>;
}
