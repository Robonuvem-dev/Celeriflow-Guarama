export function consumerUnitPeriod(date: Date) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${parts.find(part => part.type === "year")!.value}${parts.find(part => part.type === "month")!.value}`;
}

export function formatConsumerUnitIdentifier(period: string, sequence: number) {
  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(period) || !Number.isInteger(sequence) || sequence < 1 || sequence > 99_999) {
    throw new Error("Sequência mensal de unidades consumidoras inválida ou esgotada.");
  }
  return `${period}${String(sequence).padStart(5, "0")}`;
}
