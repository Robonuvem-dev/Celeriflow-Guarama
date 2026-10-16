import { z } from "zod";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { definitionSchema, evaluateConstructionViability, zoneSchema } from "./construction-rules";

export const automaticViabilityInputSchema = z.object({ caseId: z.string().min(1), requestKey: z.uuid() }).strict();
export const automaticViabilityCoverage = ["finalidade", "categoria", "área mínima territorial", "coeficiente de aproveitamento"] as const;
export const automaticViabilityDisclaimer = "DEMONSTRATIVO: consulta dos indicadores publicados e cadastrados; não constitui aprovação integral do Plano Diretor, alvará ou certidão oficial. Não verifica recuos, altura, ocupação, permeabilidade, restrições ambientais ou demais condicionantes não modelados.";

export type AutomaticViabilityProperty = {
  realEstateId: string;
  cadastralSnapshot: unknown;
  landArea: string;
  rule: z.infer<typeof zoneSchema> | null;
};

/** Only authoritative case/property data is accepted by the service; clients cannot supply areas or rules. */
export function evaluateAutomaticConstructionViability(input: {
  category: string; locationType: string; purposeId: string | null; purposeActive: boolean;
  catalogSnapshot: unknown; proposedArea: string; today: string; properties: AutomaticViabilityProperty[];
  viabilityDefinitionSnapshot: { definition: unknown; [key: string]: unknown } | null;
}) {
  const blockers: string[] = [];
  const publishedDefinition = input.viabilityDefinitionSnapshot ? definitionSchema.safeParse(input.viabilityDefinitionSnapshot.definition) : null;
  if (!publishedDefinition?.success) blockers.push("Definição VIABILITY publicada ausente ou inválida; consulta automática bloqueada.");
  const definition = publishedDefinition?.success ? publishedDefinition.data : null;
  for (const field of definition?.fields || []) if (field.required) blockers.push(`Campo obrigatório de viabilidade não computável: ${field.label}; exige avaliação humana.`);
  for (const check of definition?.checks || []) if (check.required && check.key !== "territory") blockers.push(`Critério obrigatório não computável pela regra territorial: ${check.label}; exige avaliação humana.`);
  for (const document of definition?.documents || []) if (document.required) blockers.push(`Documento obrigatório de viabilidade não verificável automaticamente: ${document.label}; exige avaliação humana.`);
  if (!input.purposeId || !input.purposeActive) blockers.push("Finalidade cadastrada ausente ou inativa.");
  if (input.properties.length !== 1) blockers.push("A consulta automática requer um imóvel; a distribuição de áreas entre imóveis não está modelada.");
  const evaluations = input.properties.map((property) => {
    const rule = property.rule ? { ...property.rule, ...zoneSchema.parse(property.rule) } : null;
    const evaluation = !rule ? { outcome: "MANUAL" as const, reasons: ["Imóvel sem regra territorial publicada e vigente."], limit: null }
      : blockers.length ? { outcome: "MANUAL" as const, reasons: blockers, limit: null }
      : evaluateConstructionViability({ category: input.category, purposeId: input.purposeId!, landArea: property.landArea, proposedArea: input.proposedArea, today: input.today }, rule);
    return { ...property, rule, ...evaluation, legalBasis: rule?.legalBasis || null };
  });
  const outcome = blockers.length || evaluations.some((item) => item.outcome === "MANUAL") ? "MANUAL" as const
    : evaluations.some((item) => item.outcome === "DENIED") ? "DENIED" as const : "APPROVED" as const;
  const checklistEvidence = (definition?.checks || []).map((check) => ({ ...check,
    status: check.key === "territory" && evaluations.length === 1 && evaluations[0].outcome !== "MANUAL" ? "COMPUTED" : "NOT_COMPUTABLE",
    evidence: check.key === "territory" ? "Regra territorial publicada e vigente, finalidade, área mínima e coeficiente conferidos no escopo modelado. Não constitui verificação integral do Plano Diretor." : "Não há regra automatizada para este critério." }));
  return { engineVersion: "construction-online-indicators-v1", demonstration: true, disclaimer: automaticViabilityDisclaimer,
    viabilityDefinitionSnapshot: input.viabilityDefinitionSnapshot, checklistEvidence,
    coverage: automaticViabilityCoverage, evaluatedAtDate: input.today, category: input.category, locationType: input.locationType,
    catalogSnapshot: input.catalogSnapshot, purposeId: input.purposeId, proposedArea: input.proposedArea,
    outcome, reasons: [...new Set([...blockers, ...evaluations.flatMap((item) => item.reasons)])], evaluations };
}

/** This is a GED draft, without an official F5 issuance number or a fabricated signature. */
export async function generateAutomaticViabilityDraft(input: { protocol: string; validationCode: string; snapshot: ReturnType<typeof evaluateAutomaticConstructionViability> }) {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([595, 842]); let y = 790;
  const line = (text: string) => {
    if (y < 70) { page = pdf.addPage([595, 842]); y = 790; }
    page.drawText(text, { x: 45, y, font, size: 10 }); y -= 16;
  };
  const body = `CONSULTA AUTOMÁTICA DE VIABILIDADE - DEMONSTRATIVO\nRASCUNHO - sem valor de certidão oficial.\nProtocolo: ${input.protocol}\nResultado dos indicadores: ${input.snapshot.outcome}\n${input.snapshot.disclaimer}\nGerado automaticamente; sem assinatura institucional automática configurada.\nExige assinatura real GED para download. Não é PAdES.\nValidação GED após assinatura: /validar-documento/${input.validationCode}\nMemória integral da consulta:\n${JSON.stringify(input.snapshot, null, 2)}`;
  for (const paragraph of body.replace(/[^\x20-\x7e\xa0-\xff\n]/g, "?").split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      // Split long IDs/JSON strings as well as ordinary words without losing content.
      for (let rest = word; rest.length;) {
        const part = rest.slice(0, 70); rest = rest.slice(70);
        const candidate = `${current}${current ? " " : ""}${part}`;
        if (current && font.widthOfTextAtSize(candidate, 10) > 500) { line(current); current = part; } else current = candidate;
        if (rest) { line(current); current = ""; }
      }
    }
    line(current);
  }
  for (const [index, sheet] of pdf.getPages().entries()) sheet.drawText(`DEMONSTRATIVO | ${index + 1}/${pdf.getPageCount()}`, { x: 45, y: 35, font, size: 8 });
  return pdf.save();
}
