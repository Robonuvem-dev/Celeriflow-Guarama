import { createHash } from "node:crypto";
import { PDFDocument, PDFTextField, StandardFonts, rgb } from "pdf-lib";
import { catLayoutFields, catLayoutProvenance, catLayoutCodeOptions } from "./accident-layout-policy";

let templatePromise: Promise<Uint8Array> | undefined;
export async function loadOfficialCatTemplate(fetcher: typeof fetch = fetch) {
  const response = await fetcher(catLayoutProvenance.sourceUrl, { signal: AbortSignal.timeout(20000), redirect: "error" });
  if (!response.ok) throw new Error("Formulário oficial INSS indisponível.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 2000000 || createHash("sha256").update(bytes).digest("hex") !== catLayoutProvenance.sha256) throw new Error("Formulário INSS mudou: revisar proveniência e mapeamento antes de emitir.");
  const pdf = await PDFDocument.load(bytes);
  const names = pdf.getForm().getFields().map(f => f.getName()).sort();
  if (pdf.getPageCount() !== 1 || JSON.stringify(names) !== JSON.stringify(catLayoutFields.map(f => f.pdf).sort())) throw new Error("Campos do layout INSS não correspondem à versão verificada.");
  return bytes;
}
async function cachedTemplate() {
  templatePromise ??= loadOfficialCatTemplate().catch(error => { templatePromise = undefined; throw error; });
  return templatePromise;
}
const labels: Record<string,string> = { INITIAL: "Inicial", REOPENING: "Reabertura", DEATH: "Comunicação de óbito", TYPICAL: "Típico", COMMUTE: "Trajeto", DISEASE: "Doença ocupacional", S: "Sim", N: "Não", EMPREGADOR: "Empregador", SINDICATO: "Sindicato", MEDICO: "Médico", SEGURADO: "Segurado", DEPENDENTE: "Dependente", AUTORIDADE_PUBLICA: "Autoridade pública", EMPREGADO: "Empregado", AVULSO: "Trabalhador avulso", SEGURADO_ESPECIAL: "Segurado especial", MEDICO_RESIDENTE: "Médico residente", URBANA: "Urbana", RURAL: "Rural", M: "Masculino", F: "Feminino" };
export async function renderOfficialCatPdf(input: { fields: Record<string,string>; medicalFields: Record<string,string>; internalId: string; revision: number; requestHash: string; registration: { receipt: string; processedAt: Date } | null }, template?: Uint8Array) {
  const pdf = await PDFDocument.load(template || await cachedTemplate());
  const font = await pdf.embedFont(StandardFonts.Helvetica), form = pdf.getForm(), overflows: { label: string; value: string }[] = [];
  for (const definition of catLayoutFields) {
    const field = form.getField(definition.pdf);
    if (!(field instanceof PDFTextField)) throw new Error("Tipo de campo INSS inesperado.");
    if (definition.kind === "signature") { field.setText(""); continue; }
    const raw = (definition.clinical ? input.medicalFields : input.fields)[definition.key] || "";
    let value = ((catLayoutCodeOptions[definition.key] || definition.kind === "yn") ? labels[raw] : undefined) || (definition.kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.split("-").reverse().join("/") : raw);
    value = value.replace(/[\r\n]+/g, " ");
    // Official fields are narrow: mark overflow and retain the full original in a supplement.
    const rect = field.acroField.getWidgets()[0].getRectangle();
    let size = 8;
    while (size > 5 && font.widthOfTextAtSize(value, size) > rect.width - 5) size -= 0.5;
    if (font.widthOfTextAtSize(value, size) > rect.width - 5) {
      overflows.push({ label: definition.pdf, value: raw });
      while (value.length && font.widthOfTextAtSize(`${value} (*)`, size) > rect.width - 5) value = value.slice(0,-1);
      value += " (*)";
    }
    field.setText(value); field.setFontSize(size);
  }
  form.updateFieldAppearances(font); form.flatten();
  const page = pdf.getPage(0);
  const state = input.registration ? "CAT REGISTRADA — recibo eSocial de produção vinculado" : "MINUTA FORMATADA INSS — NÃO REGISTRADA / NÃO TRANSMITIDA";
  page.drawText(state, { x: 30, y: 821, size: 8, font, color: rgb(0.5,0,0) });
  if (input.registration) {
    page.drawText(input.registration.receipt, { x: 280, y: 781.08, size: 9, font });
    page.drawText(input.registration.processedAt.toISOString(), { x: 95, y: 98.05, size: 7, font });
  }
  page.drawText(`Controle interno ${input.internalId} / revisão ${input.revision}. Assinaturas: colher no original.`, { x: 30, y: 20, size: 7, font });
  page.drawText(`Fonte INSS / SHA256 ${catLayoutProvenance.sha256.slice(0,16)} / ${catLayoutProvenance.version}`, { x: 30, y: 10, size: 6, font });
  pdf.setTitle(`CAT - ${input.registration ? "registrada" : "minuta"} - ${input.internalId}`);
  pdf.setSubject(`Fonte: ${catLayoutProvenance.sourceUrl}; SHA256: ${catLayoutProvenance.sha256}; snapshot: ${input.requestHash}`);
  pdf.setProducer("Celeriflow SST — preenchimento do formulário original INSS");
  if (overflows.length) {
    let supplement = pdf.addPage([595,842]), y = 795;
    const line = (text: string, bold = false) => {
      if (y < 45) { supplement = pdf.addPage([595,842]); y = 795; }
      supplement.drawText(text, { x: 35, y, size: bold ? 10 : 9, font }); y -= 14;
    };
    line("Complemento (*) — valores integrais dos campos da CAT", true);
    line(`Controle ${input.internalId} / revisão ${input.revision}`);
    for (const overflow of overflows) {
      line(overflow.label, true);
      let current = "";
      for (const character of overflow.value.replace(/[\r\n]+/g," ")) {
        if (font.widthOfTextAtSize(current + character,9) > 520) { line(current); current = ""; }
        current += character;
      }
      if (current) line(current);
    }
  }
  return pdf.save();
}
