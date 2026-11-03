import { z } from "zod";

const civil = z.iso.date();
export function certifiedServicePeriods(input: { from: string; until: string; recognizedDays: number | string; recognizedPeriods?: string }) {
  const text = input.recognizedPeriods?.trim();
  if (!text || text === "TOTAL") return null;
  const periods = text.split(";").map(value => {
    const parts = value.trim().split("/");
    if (parts.length !== 2) throw new Error("Informe cada intervalo certificado como AAAA-MM-DD/AAAA-MM-DD, separado por ponto e vírgula.");
    const start = civil.parse(parts[0].trim()), end = civil.parse(parts[1].trim());
    if (start < input.from || end > input.until || end < start) throw new Error("Intervalo certificado fora do período declarado.");
    return { start, end };
  }).sort((a, b) => a.start.localeCompare(b.start));
  let days = 0;
  for (const [index, period] of periods.entries()) {
    if (index && periods[index - 1].end >= period.start) throw new Error("Intervalos reconhecidos da mesma certidão não podem se sobrepor.");
    days += Math.round((new Date(`${period.end}T00:00:00Z`).getTime() - new Date(`${period.start}T00:00:00Z`).getTime()) / 86400000) + 1;
  }
  if (days !== Number(input.recognizedDays)) throw new Error("Os intervalos certificados não conciliam com o total de dias reconhecidos.");
  return periods;
}
