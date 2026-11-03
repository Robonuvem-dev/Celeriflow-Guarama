/** Preserve legacy/custom scopes; canonicalize the three public-government scopes. */
export function normalizeLegalGovernmentLevel(value: string) {
  const trimmed = value.trim(), canonical = trimmed.toLocaleUpperCase("pt-BR");
  return ["MUNICIPAL", "ESTADUAL", "FEDERAL"].includes(canonical) ? canonical : trimmed;
}
export const legalGovernmentLevels = [
  { value: "MUNICIPAL", label: "Municipal" },
  { value: "ESTADUAL", label: "Estadual" },
  { value: "FEDERAL", label: "Federal" },
];
