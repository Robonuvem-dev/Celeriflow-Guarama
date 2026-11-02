import { sql } from "drizzle-orm";
import { z } from "zod";
import type { DatabaseExecutor } from "@/db/transaction";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";

export const retirementProjectionPolicySchema = z.object({
  origin: z.literal("PROJECAO_APOSENTADORIA"), isDemo: z.literal(true),
  regimeIds: z.array(z.string().min(1)).min(1), gender: z.enum(["Todos", "Feminino", "Masculino"]),
  effectiveFrom: z.iso.date(), effectiveUntil: z.iso.date(),
  minimumAgeYears: z.number().int().min(0).max(100), minimumContributionDays: z.number().int().min(0).max(40000),
  minimumPublicDays: z.number().int().min(0).max(40000), minimumRoleDays: z.number().int().min(0).max(40000),
  legalReference: z.string().trim().min(5), assumptions: z.string().trim().min(5),
}).strict().refine(policy => policy.effectiveFrom <= policy.effectiveUntil, "Vigência previdenciária inválida.");
const dayMs = 86400000;
type Interval = { start: string; end: string };
const contractStateSchema = z.object({ admittedAt: z.string(), endsAt: z.string().nullable(), regimeId: z.string(), roleId: z.string(), status: z.string() });
export function unionCivilDays(intervals: readonly Interval[]): number {
  const ordered = intervals.map(interval => ({ start: new Date(`${z.iso.date().parse(interval.start)}T00:00:00Z`).getTime(), end: new Date(`${z.iso.date().parse(interval.end)}T00:00:00Z`).getTime() })).sort((a, b) => a.start - b.start);
  let total = 0, start: number | null = null, end = 0;
  for (const interval of ordered) {
    if (!Number.isFinite(interval.start) || !Number.isFinite(interval.end) || interval.end < interval.start) throw new Error("Intervalo civil inválido.");
    if (start === null) { start = interval.start; end = interval.end; }
    else if (interval.start <= end + dayMs) end = Math.max(end, interval.end);
    else { total += (end - start) / dayMs + 1; start = interval.start; end = interval.end; }
  }
  return start === null ? 0 : total + (end - start) / dayMs + 1;
}
function addDays(date: string, days: number) { return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * dayMs).toISOString().slice(0, 10); }
function birthdayAtAge(birth: string, years: number) {
  const year = Number(birth.slice(0, 4)) + years, month = Number(birth.slice(5, 7));
  const day = Math.min(Number(birth.slice(8, 10)), new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function buildRetirementHrReport(db: DatabaseExecutor, input: OperationalReportInput): Promise<PersonnelReport> {
  const reference = input.referenceDate ?? new Date().toISOString().slice(0, 10);
  const result = await db.execute<{ id: string; name: string; registration: string | null; birth: string | null; gender: string | null; contractId: string; state: unknown }>(sql`
    SELECT e.id,e.name,e.registration,to_char(p."birthDate",'YYYY-MM-DD') birth,p.gender,c.id "contractId",v.snapshot state FROM "Employee" e
    JOIN "Person" p ON p.id=e."personId" JOIN "HrEmploymentContract" c ON c."employeeId"=e.id
    JOIN LATERAL (SELECT snapshot FROM "HrEmploymentRevision" WHERE "contractId"=c.id AND "effectiveFrom"<=${reference}::date ORDER BY "effectiveFrom" DESC,version DESC LIMIT 1) v ON true
    WHERE (${input.q}='' OR strpos(lower(e.name),lower(${input.q}))>0 OR strpos(coalesce(e.registration,''),${input.q})>0)
    ${input.employeeId ? sql`AND e.id=${input.employeeId}` : sql``} ${input.departmentId ? sql`AND v.snapshot->>'departmentId'=${input.departmentId}` : sql``}
    ORDER BY e.name,c.id`);
  const prior = await db.execute<{ employeeId: string; details: Record<string, string> }>(sql`SELECT details->>'employeeId' "employeeId",details FROM "HrReferenceRecord" WHERE kind='TEMPO_CONTRIBUICAO' AND details->>'status'='Reconhecido' AND details->>'until'<=${reference}`);
  const policies = input.kind === "EXPECTATIVA_APOSENTADORIA" ? await db.execute<{ id: string; name: string; value: unknown }>(sql`SELECT r.id,r.name,r.value FROM "HrPayrollRule" r JOIN "HrPayrollRuleSet" s ON s.id=r."ruleSetId" WHERE r."isActive" AND s.status='ATIVA' AND s."isDemo" AND r.value->>'origin'='PROJECAO_APOSENTADORIA' ORDER BY r.id`) : { rows: [] };
  const revisionRows = await db.execute<{ contractId: string; date: string; snapshot: unknown }>(sql`SELECT "contractId",to_char("effectiveFrom",'YYYY-MM-DD') date,snapshot FROM "HrEmploymentRevision" WHERE "effectiveFrom"<=${reference}::date ORDER BY "contractId","effectiveFrom",version`);
  const grouped = new Map<string, typeof result.rows>();
  for (const row of result.rows) { const rows = grouped.get(row.id) ?? []; rows.push(row); grouped.set(row.id, rows); }
  const rows: string[][] = [];
  for (const entries of grouped.values()) {
    const holder = entries[0], states = entries.map(row => ({ row, state: contractStateSchema.parse(row.state) }));
    const segments = states.flatMap(({ row }) => {
      const revisions = revisionRows.rows.filter(revision => revision.contractId === row.contractId);
      return revisions.flatMap((revision, index) => {
        const state = contractStateSchema.parse(revision.snapshot);
        const start = [revision.date, state.admittedAt.slice(0, 10)].sort().at(-1)!;
        const end = [reference, ...(state.endsAt ? [state.endsAt.slice(0, 10)] : []), ...(revisions[index + 1] ? [addDays(revisions[index + 1].date, -1)] : [])].sort()[0];
        return state.status === "ATIVO" && start <= end ? [{ start, end, roleId: state.roleId, contractId: row.contractId }] : [];
      });
    });
    const municipal = segments.map(({ start, end }) => ({ start, end }));
    const publicDays = unionCivilDays(municipal);
    const external = prior.rows.filter(row => row.employeeId === holder.id);
    if (external.some((entry, index) => external.slice(index + 1).some(other => entry.details.from <= other.details.until && entry.details.until >= other.details.from))) throw new Error(`Certidões de ${holder.registration ?? holder.id} têm períodos sobrepostos; concilie antes de contar.`);
    if (external.some(entry => municipal.some(interval => entry.details.from <= interval.end && entry.details.until >= interval.start))) throw new Error(`Tempo anterior de ${holder.registration ?? holder.id} sobrepõe vínculo municipal; concilie antes de projetar.`);
    const recognized = external.reduce((total, entry) => total + Number(entry.details.recognizedDays), 0);
    const contributionDays = publicDays + recognized;
    if (input.kind === "CONTAGEM_TEMPO_RH") {
      rows.push([holder.name, holder.registration ?? "", reference, String(publicDays), String(recognized), String(contributionDays), "Tempo estimado por contratos e certidões reconhecidas; não substitui apuração previdenciária ou ATS", external.map(entry => entry.details.source).join("; ")]);
      continue;
    }
    const applicable = policies.rows.flatMap(rule => {
      const parsed = retirementProjectionPolicySchema.parse(rule.value);
      return parsed.effectiveFrom <= reference && parsed.effectiveUntil >= reference && (parsed.gender === "Todos" || parsed.gender === holder.gender) && states.some(({ state }) => parsed.regimeIds.includes(state.regimeId) && state.status === "ATIVO" && state.admittedAt.slice(0, 10) <= reference && (!state.endsAt || state.endsAt.slice(0, 10) >= reference)) ? [{ rule, policy: parsed }] : [];
    });
    if (!applicable.length) { rows.push([holder.name, holder.registration ?? "", reference, "", String(contributionDays), String(publicDays), "", "", "PENDENTE — sem regra demonstrativa aplicável", ""]); continue; }
    for (const { rule, policy } of applicable) {
      const roleDays = Math.max(0, ...states.filter(({ state }) => policy.regimeIds.includes(state.regimeId) && state.status === "ATIVO").map(({ row, state }) => {
        const consecutive = segments.filter(segment => segment.contractId === row.contractId && segment.roleId === state.roleId).sort((a, b) => b.end.localeCompare(a.end));
        let through = reference, days = 0;
        for (const segment of consecutive) {
          if (segment.end !== through) break;
          days += unionCivilDays([segment]); through = addDays(segment.start, -1);
        }
        return days;
      }));
      const missing = Math.max(0, policy.minimumContributionDays - contributionDays, policy.minimumPublicDays - publicDays, policy.minimumRoleDays - roleDays);
      const ageDate = holder.birth ? birthdayAtAge(holder.birth, policy.minimumAgeYears) : null;
      const continuity = addDays(reference, missing), projected = ageDate && ageDate > continuity ? ageDate : continuity;
      rows.push([holder.name, holder.registration ?? "", reference, holder.birth ?? "", String(contributionDays), String(publicDays), String(roleDays), ageDate ? projected : "", ageDate ? `PROJEÇÃO DEMONSTRATIVA — ${rule.name}` : "PENDENTE — nascimento não informado", `${policy.legalReference}; ${policy.assumptions}; continuidade contributiva e do cargo presumida; regra ${rule.id}`]);
    }
  }
  return { title: input.kind === "CONTAGEM_TEMPO_RH" ? "Contagem de tempo — contratos municipais e períodos reconhecidos, sem concessão de direito" : "Expectativa de aposentadoria — simulação por regras configuradas; sem concessão automática", headers: input.kind === "CONTAGEM_TEMPO_RH" ? ["Servidor", "Matrícula", "Referência", "Dias de vínculos municipais (união)", "Dias externos reconhecidos", "Contribuição estimada em dias", "Critério", "Certidões / atos"] : ["Servidor", "Matrícula", "Referência", "Nascimento", "Dias contributivos estimados", "Dias municipais", "Dias no cargo atual", "Data projetada", "Situação", "Fundamento e premissas"], rows };
}
