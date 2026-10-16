"use client";

export default function PrintMovements() {
  return <button type="button" onClick={() => window.print()} className="rounded border px-3 py-2 text-sm print:hidden">Imprimir página consultada</button>;
}
