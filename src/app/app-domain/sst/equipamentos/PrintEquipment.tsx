"use client";
export function PrintEquipment() { return <button className="rounded border p-2 print:hidden" onClick={()=>window.print()}>Imprimir</button>; }
