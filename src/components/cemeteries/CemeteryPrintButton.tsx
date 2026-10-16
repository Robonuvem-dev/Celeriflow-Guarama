"use client";
export default function CemeteryPrintButton() { return <button type="button" className="rounded border p-2 print:hidden" onClick={() => window.print()}>Imprimir / salvar PDF</button>; }
