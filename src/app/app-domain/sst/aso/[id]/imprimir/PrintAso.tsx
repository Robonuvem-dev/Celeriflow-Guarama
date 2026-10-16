"use client";

export function PrintAso() {
  return <><style>{`@media print { body * { visibility: hidden; } [data-sst-aso], [data-sst-aso] * { visibility: visible; } [data-sst-aso] { position: absolute; left: 0; top: 0; width: 100%; max-width: none; height: auto; overflow: visible; } }`}</style><button type="button" className="rounded border px-4 py-2" onClick={() => window.print()}>Imprimir ASO</button></>;
}
