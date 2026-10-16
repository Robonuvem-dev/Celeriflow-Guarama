"use client";

export default function PrintSocialDocumentButton() {
  return <button onClick={() => window.print()} className="rounded bg-blue-600 px-3 py-2 text-xs text-white print:hidden">Imprimir / salvar PDF</button>;
}
