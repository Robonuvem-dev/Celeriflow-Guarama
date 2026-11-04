"use client";
export function PrintButton() {
  return <button type="button" className="rounded border px-3 py-2 print:hidden" onClick={() => {
    const collapsed = [...document.querySelectorAll("main details")].filter((item): item is HTMLDetailsElement => item instanceof HTMLDetailsElement && !item.open);
    collapsed.forEach(item => { item.open = true; });
    try { window.print(); } finally { collapsed.forEach(item => { item.open = false; }); }
  }}>Imprimir / salvar PDF</button>;
}
