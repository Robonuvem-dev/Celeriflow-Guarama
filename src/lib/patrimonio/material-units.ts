export const materialUnits = [
  { value: "UN", label: "UN — Unidade" },
  { value: "KG", label: "KG — Quilograma" },
  { value: "m", label: "m — Metro" },
  { value: "KT", label: "KT — Kit / pacote" },
] as const;

export const materialUnitValues = ["UN", "KG", "m", "KT"] as const;

// Normaliza a apresentação da unidade comercial, sem converter quantidades.
export function normalizeMaterialUnit(value: string) {
  const unit = value.trim().toUpperCase();
  // Combustíveis integrados a Frotas exigem litros, sem conversão implícita.
  if (unit === "L") return "L";
  if (["KG", "KILO", "QUILOGRAMA"].includes(unit)) return "KG";
  if (["M", "MT", "METRO"].includes(unit)) return "m";
  if (["KT", "KIT", "PCT", "PAQ", "PACOTE", "RESMA", "SC", "SACO", "CX", "CAIXA"].includes(unit)) return "KT";
  return "UN";
}
