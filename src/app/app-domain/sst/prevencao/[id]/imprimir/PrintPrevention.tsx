"use client";
export function PrintPrevention() { return <button className="rounded border px-4 py-2 print:hidden" onClick={() => window.print()}>Imprimir / salvar PDF</button>; }
