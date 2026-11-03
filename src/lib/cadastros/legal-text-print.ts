const html = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type RelatedAct = { direction: "incoming" | "outgoing"; relationType: string; effectiveFrom?: Date | null; notes?: string | null; relatedText: { id: string; type: string; number: string; summary: string } };

export function renderLegalTextPrint(record: { type: string; number: string; governmentLevel: string; issuingBody: string; summary: string | null; content: string; versionNumber: number; publicationDate: Date | null }, relations?: RelatedAct[]) {
  const title = html(`${record.type} nº ${record.number}`);
  const publication = record.publicationDate?.toISOString().slice(0, 10).split("-").reverse().join("/") ?? "Não informada";
  const links = relations?.map(({ direction, relationType, effectiveFrom, notes, relatedText }) => {
    const query = new URLSearchParams({ legalTextId: relatedText.id, modo: "consulta" });
    const date = effectiveFrom?.toISOString().slice(0, 10).split("-").reverse().join("/");
    return `<li>${html(relationType)} (${direction === "outgoing" ? "deste ato" : "de outro ato"}): <a href="?${html(query.toString())}">${html(relatedText.type)} ${html(relatedText.number)}</a> - ${html(relatedText.summary)}${date ? ` · ${date}` : ""}${notes ? `<p class="text">${html(notes)}</p>` : ""}</li>`;
  }).join("");
  const related = relations ? `<section><h2>Atos relacionados</h2>${links ? `<ul>${links}</ul>` : "<p>Nenhum ato relacionado.</p>"}</section>` : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title><style>@page{size:A4;margin:18mm}body{font:12pt/1.55 Arial,sans-serif;color:#111827;max-width:175mm;margin:24px auto;padding:0 16px}h1{font-size:18pt;margin:0}header{border-bottom:1px solid #9ca3af;margin-bottom:1em}header p{margin:.3em 0}.text{white-space:pre-wrap;overflow-wrap:anywhere}.hint{font-size:10pt;color:#374151}@media print{body{max-width:none;margin:0;padding:0}.hint{display:none}}</style></head><body><p class="hint">Use a opção Imprimir do navegador para imprimir ou salvar em PDF.</p><header><h1>${title}</h1><p>Versão jurídica ${record.versionNumber} · Publicação: ${publication}</p><p>${html(record.governmentLevel)} · ${html(record.issuingBody)}</p>${record.summary ? `<p class="text">${html(record.summary)}</p>` : ""}</header><main class="text">${html(record.content)}</main>${related}</body></html>`;
}
