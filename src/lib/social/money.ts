export function socialAmountCents(value: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Valor monetário inválido.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

export function socialCentsDisplay(value: bigint): string {
  const sign = value < BigInt(0) ? "-" : "";
  const absolute = value < BigInt(0) ? -value : value;
  return `${sign}R$ ${(absolute / BigInt(100)).toLocaleString("pt-BR")},${(absolute % BigInt(100)).toString().padStart(2, "0")}`;
}
