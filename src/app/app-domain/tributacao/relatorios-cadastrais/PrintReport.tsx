"use client";
export default function PrintReport(){return <button type="button" className="rounded border p-2 print:hidden" onClick={()=>window.print()}>Imprimir relatório</button>;}
