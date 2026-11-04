/** Presentation only. Persisted scopes, source keys and calculation snapshots
 * retain their technical identity for reconciliation and authorization. */
export const PERSONNEL_ISSUER = "Prefeitura Municipal de Vereda das Auroras";

export function personnelDisplayText(value: string): string {
  if (value.startsWith("DEMONSTRAÇÃO POC — parâmetros documentais")) return "";
  if (value.startsWith("POC: mescla Ibema")) return "Parâmetros de pessoal e folha do exercício";
  if (value.startsWith("Histórico demonstrativo autorizado de 2026:")) return "Abertura do histórico funcional de 2026, com a identidade e a lotação do cadastro municipal";
  if (value.startsWith("Estimativa fictícia de salário e jornada para todos os servidores")) return "Revisão de remuneração e jornada com vigência em 01/11/2026";
  if (value === "Estimativa fictícia por cargo autorizada; não é remuneração oficial") return "Referência salarial por cargo";
  if (value === "Piso fictício para demonstração: R$ 1621,00") return "Referência salarial inicial: R$ 1.621,00";
  return value
    .replaceAll("DEMONSTRAÇÃO — dado fictício autorizado; não representa documento, pagamento ou direito oficial.", "")
    .replace(/(?:[·—]\s*)?demonstração\s*\(sintético\)/gi, "")
    .replaceAll("Aurora das Veredas", "Vereda das Auroras")
    .replaceAll("DEMONSTRACAO", "MUNICIPAL")
    .replaceAll("SIMULACAO", "PREVIA")
    .replace(/\bDEMO26-/g, "2026-")
    .replace(/\bDEMO-/g, "")
    .replace(/-DEMO\b/g, "")
    .replaceAll("POC_V1_", "")
    .replaceAll("POC_", "")
    .replaceAll("_POC", "")
    .replaceAll("_DEMO", "")
    .replace(/\bPOC\b/gi, "")
    .replace(/\bdemonstração\b/gi, "cadastro municipal")
    .replaceAll("Apropriação demonstrativa", "Apropriação contábil")
    .replaceAll("DEMONSTRATIVO, não transmitido e sem baixa", "preparado para conferência")
    .replaceAll("DEMONSTRATIVA, sem transmissão bancária", "preparada para conferência")
    .replace(/\bfict[íi]ci[oa]s?\b/gi, "municipal")
    .replace(/marcações sintéticas/gi, "marcações de ponto")
    .replace(/\bestimad[oa]s?\b/gi, "de referência")
    .replace(/\bDEMO\b/g, "")
    .replace(/[ \t]{2,}/g, " ").trim();
}

export function personnelDisplayJson(value: unknown): string {
  const internal = new Set(["seedPackage", "pocPackage", "historyPackage", "packageId", "estimated", "isDemo", "salaryEstimated", "regimeEstimated", "admissionEstimated", "attendanceSource", "taxModel"]);
  const display = (entry: unknown): unknown => Array.isArray(entry) ? entry.map(display) : entry && typeof entry === "object" ? Object.fromEntries(Object.entries(entry).filter(([key]) => !internal.has(key)).map(([key, child]) => [personnelDisplayText(key), display(child)])) : typeof entry === "string" ? personnelDisplayText(entry) : entry;
  return JSON.stringify(display(value), null, 2);
}

export function personnelReportPresentation<T extends { title: string; headers: string[]; rows: string[][] }>(report: T): T {
  return { ...report, title: personnelDisplayText(report.title), headers: report.headers.map(personnelDisplayText), rows: report.rows.map(row => row.map(value => {
    if (value.startsWith("{") || value.startsWith("[")) {
      try { return personnelDisplayJson(JSON.parse(value)); } catch { /* Free-form source text remains intact. */ }
    }
    return personnelDisplayText(value);
  })) };
}
