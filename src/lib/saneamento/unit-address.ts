type UnitAddress = { address: string; streetAddress?: string | null; neighborhood?: string | null; postalCode?: string | null };

export function getUnitAddress(unit: UnitAddress) {
  const parts = unit.address.split(",").map((part) => part.trim());
  return {
    streetAddress: unit.streetAddress ?? (parts.length >= 3 ? parts.slice(0, 2).join(", ") : unit.address),
    neighborhood: unit.neighborhood ?? (parts.length >= 3 ? parts[2] : ""),
    postalCode: unit.postalCode ?? "",
  };
}
