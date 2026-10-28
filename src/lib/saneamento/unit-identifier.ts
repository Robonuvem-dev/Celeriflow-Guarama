import type { Prisma } from "@prisma/client";

export function consumerUnitPeriod(date: Date) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")!.value}${parts.find((part) => part.type === "month")!.value}`;
}

export function formatConsumerUnitIdentifier(period: string, sequence: number) {
  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(period) || !Number.isInteger(sequence) || sequence < 1 || sequence > 99_999) {
    throw new Error("Sequência mensal de unidades consumidoras inválida ou esgotada.");
  }
  return `${period}${String(sequence).padStart(5, "0")}`;
}

// The advisory lock lives until commit, so simultaneous registrations cannot
// reserve the same number. Call only within the transaction that inserts rows.
export async function reserveConsumerUnitIdentifiers(tx: Prisma.TransactionClient, date: Date, count = 1) {
  const period = consumerUnitPeriod(date);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`san-consumer-unit:${period}`}))`;
  const last = await tx.sanConsumerUnit.findFirst({ where: { code: { startsWith: period } }, orderBy: { code: "desc" }, select: { code: true } });
  const start = last ? Number(last.code.slice(6)) + 1 : 1;
  formatConsumerUnitIdentifier(period, start + count - 1);
  return { period, start };
}
