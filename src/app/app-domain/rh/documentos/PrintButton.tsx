"use client";
export function PrintButton() { return <button className="rounded border p-2 print:hidden" onClick={()=>window.print()}>Imprimir documento</button>; }
