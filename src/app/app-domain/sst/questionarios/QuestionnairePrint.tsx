"use client";
export function QuestionnairePrint() {
  return <><style>{`@media print { body * { visibility: hidden; } [data-sst-questionnaire], [data-sst-questionnaire] * { visibility: visible; } [data-sst-questionnaire] { position: absolute; left: 0; top: 0; width: 100%; max-width: none; height: auto; overflow: visible; } }`}</style><button type="button" className="rounded border px-4 py-2" onClick={() => window.print()}>Imprimir questionário</button></>;
}
