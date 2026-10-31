"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import CentralValidationForm from "@/components/signatures/CentralValidationForm";

export function GedValidationSelector({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [source, setSource] = useState(initialCode.startsWith("CFV-") ? "ged" : "central"), [code, setCode] = useState(initialCode), [message, setMessage] = useState("");
  return <section className="space-y-4"><label className="block text-sm font-medium">Origem da evidência<select className="ml-2 rounded border p-2" value={source} onChange={event => { setSource(event.target.value); setMessage(""); }}><option value="central">Central — interna / A1 e documentos do acervo assinados na Central</option><option value="ged">Versão GED — código CFV</option></select></label>
    {source === "central" ? <CentralValidationForm initialCode={initialCode.startsWith("CFV-") ? "" : initialCode} /> : <form className="grid gap-3" onSubmit={event => { event.preventDefault(); const normalized = code.trim().toUpperCase(); if (!/^CFV-[A-Z0-9]{20}$/.test(normalized)) { setMessage("Informe o código CFV completo apresentado na versão documental."); return; } router.push(`/validar-documento/${normalized}`); }}><label>Código público da versão<input required maxLength={24} className="block w-full rounded border p-2" value={code} onChange={event => setCode(event.target.value)} placeholder="CFV-…" /></label><p className="text-sm">A consulta utiliza o verificador original da versão e sua lista pública de metadados.</p><button className="w-fit rounded bg-slate-900 px-3 py-2 text-white">Consultar versão GED</button>{message && <p role="alert">{message}</p>}</form>}
  </section>;
}
