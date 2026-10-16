"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { runMasterDataConsistencyCheck } from "../master-data-actions";

export function RunConsistencyButton() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return <div className="flex items-center gap-2">{error && <span role="alert" className="text-xs text-red-700">{error}</span>}<button type="button" disabled={pending} onClick={() => startTransition(async () => { setError(""); const result = await runMasterDataConsistencyCheck(); if (result.error) setError(result.error); else router.refresh(); })} className="inline-flex h-7 items-center gap-1.5 rounded bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-60"><RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />{pending ? "Verificando..." : "Executar verificação"}</button></div>;
}
