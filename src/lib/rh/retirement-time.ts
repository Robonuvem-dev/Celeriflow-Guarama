import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DatabaseExecutor } from "@/db/transaction";
import { hrEmploymentContracts } from "@/db/schema/personnel-workforce";
import { serviceTimeAssessment } from "./automatic-service-rights";
import { certifiedServicePeriods } from "./certified-service-periods";

const day = 86400000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const priorSchema = z.object({ from: z.iso.date(), until: z.iso.date(), recognizedDays: z.coerce.number().int().nonnegative(), regime: z.string(), employer: z.string(), source: z.string(), serviceNature: z.enum(["PUBLICO", "PRIVADO", "NAO_INFORMADO"]).default("NAO_INFORMADO"), recognizedPeriods: z.string().default("TOTAL") });

/** A civil day is one day of service even with concurrent municipal appointments. */
export async function assessRetirementTime(db: DatabaseExecutor, employeeId: string, through: Date) {
  const contracts = await db.select().from(hrEmploymentContracts).where(eq(hrEmploymentContracts.employeeId, employeeId));
  const municipal = new Set<string>();
  const evidence: Array<{ contractId: string; regimeId: string; from: string; until: string; days: number; excluded: string[] }> = [];
  for (const contract of contracts) {
    if (contract.admittedAt > through) continue;
    const counted = await serviceTimeAssessment(db, contract, through, "retirement"), excluded = new Set(counted.exclusions);
    let days = 0;
    for (let at = new Date(`${counted.start}T00:00:00Z`).getTime(); at <= through.getTime(); at += day) {
      const value = iso(new Date(at));
      if (!excluded.has(value)) { municipal.add(value); days++; }
    }
    evidence.push({ contractId: contract.id, regimeId: contract.regimeId, from: counted.start, until: counted.through, days, excluded: counted.exclusions });
  }
  const prior = await db.execute<{ id: string; details: unknown }>(sql`SELECT id,details FROM "HrReferenceRecord" WHERE kind='TEMPO_CONTRIBUICAO' AND details->>'employeeId'=${employeeId} AND details->>'status'='Reconhecido' ORDER BY details->>'from',id`);
  const contribution = new Set(municipal), publicService = new Set(municipal), partial: Array<{ start: string; end: string; days: number; public: boolean }> = [];
  const certificates: Array<{ id: string } & z.infer<typeof priorSchema>> = [];
  for (const entry of prior.rows) {
    const value = priorSchema.parse(entry.details), start = new Date(`${value.from}T00:00:00Z`), end = new Date(`${value.until}T00:00:00Z`);
    if (end < start || value.recognizedDays > Math.round((end.getTime() - start.getTime()) / day) + 1) throw new Error("Certidão contém período ou dias reconhecidos inconsistentes.");
    if (start > through) continue;
    const calendar = Math.round((end.getTime() - start.getTime()) / day) + 1;
    const intervals = certifiedServicePeriods(value);
    if (intervals) {
      for (const interval of intervals) {
        if (partial.some(row => row.start <= interval.end && row.end >= interval.start)) throw new Error(`A certidão ${entry.id} sobrepõe total parcial sem discriminação diária.`);
        for (let at = new Date(`${interval.start}T00:00:00Z`).getTime(); at <= Math.min(new Date(`${interval.end}T00:00:00Z`).getTime(), through.getTime()); at += day) {
          const date = iso(new Date(at)); contribution.add(date);
          if (value.serviceNature === "PUBLICO") publicService.add(date);
        }
      }
      certificates.push({ id: entry.id, ...value });
      continue;
    }
    // A total-only partial certificate does not identify which days were accepted.
    // Never spread that total arbitrarily over a concurrent or cutoff period.
    if (value.recognizedDays < calendar) {
      if (end > through || [...contribution].some(date => date >= value.from && date <= value.until) || partial.some(row => row.start <= value.until && row.end >= value.from)) throw new Error(`A certidão parcial ${entry.id} exige discriminar os intervalos reconhecidos para conciliar a sobreposição ou a data de corte.`);
      partial.push({ start: value.from, end: value.until, days: value.recognizedDays, public: value.serviceNature === "PUBLICO" });
    } else {
      if (partial.some(row => row.start <= value.until && row.end >= value.from)) throw new Error(`A certidão ${entry.id} sobrepõe certidão parcial sem discriminação diária.`);
      for (let at = start.getTime(); at <= Math.min(end.getTime(), through.getTime()); at += day) {
        const date = iso(new Date(at)); contribution.add(date);
        if (value.serviceNature === "PUBLICO") publicService.add(date);
      }
    }
    certificates.push({ id: entry.id, ...value });
  }
  const firstPublicService = [...publicService].sort()[0] ?? null;
  const publicAdmissionUnresolved = partial.some(row => row.public && (!firstPublicService || row.start < firstPublicService));
  return { municipalDays: municipal.size, publicDays: publicService.size + partial.filter(row => row.public).reduce((sum, row) => sum + row.days, 0), firstPublicService, publicAdmissionUnresolved, contributionDays: contribution.size + partial.reduce((sum, value) => sum + value.days, 0), priorDays: contribution.size - municipal.size + partial.reduce((sum, value) => sum + value.days, 0), contracts: evidence, certificates };
}
