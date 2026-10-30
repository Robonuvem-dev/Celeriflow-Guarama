"use client";
export function PrintCatalogReport() { return <button className="rounded border p-2 print:hidden" onClick={() => window.print()}>Imprimir ou salvar PDF</button>; }
