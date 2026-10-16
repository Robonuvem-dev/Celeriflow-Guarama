"use client";

export function EnforcementPrintButton() {
  return <button type="button" onClick={() => window.print()} className="rounded bg-blue-600 px-3 py-2 text-xs text-white print:hidden">Imprimir / salvar PDF demonstrativo</button>;
}
