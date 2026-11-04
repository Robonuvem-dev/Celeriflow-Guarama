"use client";
import { useState } from "react";

export function GedProviderEditor({ configured, save }: { configured: Record<string, unknown>; save: (command: string, id: string, data: Record<string, unknown>) => Promise<void> }) {
  const [values, setValues] = useState(configured);
  return <form className="space-y-3 rounded border p-4" onSubmit={e => { e.preventDefault(); void save("save-providers", "", values); }}><h3 className="font-semibold">Provedores e executáveis</h3><p className="text-sm">Campos vazios usam o ambiente do servidor. Credenciais permanecem exclusivamente nas variáveis GED_*_API_KEY. Salvar a configuração não instala nem testa os serviços.</p><div className="grid gap-3 sm:grid-cols-2">{[["ocrEndpoint", "URL do OCR"], ["semanticEndpoint", "URL dos embeddings"], ["conversionEndpoint", "URL do conversor"], ["pdfaEndpoint", "URL do validador PDF/A"], ["libreOfficePath", "Executável local do LibreOffice"], ["veraPdfPath", "Executável local do veraPDF"]].map(([key, label]) => <label key={key} className="text-sm">{label}<input className="block w-full rounded border p-2" type={key.endsWith("Endpoint") ? "url" : "text"} value={String(values[key] ?? "")} onChange={e => setValues(previous => ({ ...previous, [key]: e.target.value }))} /></label>)}</div><button className="rounded border px-3 py-2">Salvar provedores</button></form>;
}
