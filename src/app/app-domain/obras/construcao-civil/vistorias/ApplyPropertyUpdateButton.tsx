"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { executeConstructionLifecycle } from "../lifecycle-actions";

export default function ApplyPropertyUpdateButton({ updateId }: { updateId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  return <div><button className="rounded bg-blue-700 px-3 py-2 text-white" disabled={busy} onClick={async () => { setBusy(true); try { const result = await executeConstructionLifecycle("APPLY", { updateId }); setMessage(result.error || "Atualização aplicada com histórico antes/depois."); if (!result.error) router.refresh(); } finally { setBusy(false); } }}>{busy ? "Aplicando…" : "Aplicar atualização cadastral"}</button><p role="status">{message}</p></div>;
}
