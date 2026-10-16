"use client";
export function PrintCat() { return <button className="rounded border px-3 py-2 print:hidden" onClick={() => window.print()}>Imprimir / salvar PDF</button>; }
