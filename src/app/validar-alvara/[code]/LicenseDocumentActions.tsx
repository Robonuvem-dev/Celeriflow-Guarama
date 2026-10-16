"use client";

export default function LicenseDocumentActions({ code, signed = false }: { code: string; signed?: boolean }) {
  return <nav className="flex flex-wrap gap-3 text-sm print:hidden"><button type="button" onClick={() => window.print()} className="rounded border p-2">Imprimir</button><a href={`/api/publico/alvaras/${code}/pdf`} className="rounded border p-2 text-emerald-700">Baixar alvará em PDF</a>{signed && <><a href={`/api/publico/alvaras/${code}/assinatura?formato=pdf`} className="rounded border p-2 text-emerald-700">Original com assinatura A1</a><a href={`/api/publico/alvaras/${code}/assinatura`} className="rounded border p-2 text-emerald-700">Assinatura destacada</a></>}</nav>;
}
