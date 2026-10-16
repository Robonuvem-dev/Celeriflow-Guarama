"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { prepareRhEsocialConnection } from "./actions";

export function EsocialConfigurationForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(data: FormData) {
    setPending(true);
    try {
      const result = await prepareRhEsocialConnection(Object.fromEntries([...data].map(([key, value]) => [key, String(value)])));
      setMessage(result.error || result.message || "");
      if (!result.error) router.refresh();
    } catch { setMessage("Não foi possível concluir a configuração."); }
    finally { setPending(false); }
  }
  return <details className="rounded border bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">Preparar parâmetros oficiais (administrador)</summary>
    <form action={submit} className="mt-3 grid gap-2 sm:grid-cols-3">
      <label className="text-xs">Ambiente<select name="environment" className="mt-1 block h-8 w-full rounded border"><option>PRODUCAO_RESTRITA</option><option>PRODUCAO</option></select></label>
      {[["employerCnpj", "CNPJ do empregador (14 dígitos)"], ["layoutVersion", "Versão do leiaute"], ["xsdPackageReference", "Referência do pacote XSD"], ["xsdSha256", "SHA-256 do pacote XSD"], ["sendEndpoint", "Endpoint HTTPS de envio"], ["queryEndpoint", "Endpoint HTTPS de consulta"], ["credentialReference", "Referência protegida de credencial (env:/vault:/secret://)"], ["effectiveFrom", "Início de vigência AAAA-MM-DD"]].map(([name, label]) => <label key={name} className="text-xs">{label}<input name={name} required className="mt-1 block h-8 w-full rounded border px-2" /></label>)}
      <button disabled={pending} className="rounded bg-blue-700 px-3 py-2 text-xs text-white">{pending ? "Salvando…" : "Salvar configuração pendente"}</button>
      {message && <p role="status" className="text-xs sm:col-span-3">{message}</p>}
    </form>
  </details>;
}
