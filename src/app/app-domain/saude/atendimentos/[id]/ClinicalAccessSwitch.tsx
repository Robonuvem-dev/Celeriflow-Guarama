"use client";
import { useState } from "react";
export function ClinicalAccessSwitch({ biometryEnabled }: { biometryEnabled: boolean }) {
  const [message, setMessage] = useState("");
  async function switchLogin() { setMessage(""); try { const response = await fetch("/api/auth/session/logout", { method: "POST" }); if (!response.ok) throw new Error(); window.location.assign(`/login?${new URLSearchParams({ returnTo: window.location.pathname + window.location.search })}`); } catch { setMessage("Não foi possível encerrar a sessão para trocar o profissional."); } }
  return <div className="flex flex-wrap items-center gap-2 rounded border bg-white p-2 text-xs"><span>{biometryEnabled ? "Biometria habilitada" : "Biometria desabilitada"} · leitor a configurar na implantação</span><button type="button" onClick={switchLogin} className="rounded border px-3 py-2">Trocar profissional</button><button type="button" onClick={switchLogin} className="rounded border px-3 py-2">Alterar login</button>{message && <span role="status">{message}</span>}</div>;
}
