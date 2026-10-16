"use client";
import { useEffect } from "react";
export function PrintReceipt({ automatic }: { automatic: boolean }) {
  useEffect(() => { if (automatic) window.print(); }, [automatic]);
  return <><style>{`@media print { body * { visibility: hidden; } [data-sst-receipt], [data-sst-receipt] * { visibility: visible; } [data-sst-receipt] { position: absolute; left: 0; top: 0; width: 100%; max-width: none; height: auto; overflow: visible; } [data-sst-receipt] button { display: none; } }`}</style><button className="rounded border px-4 py-2 print:hidden" onClick={() => window.print()}>Imprimir comprovante</button></>;
}
