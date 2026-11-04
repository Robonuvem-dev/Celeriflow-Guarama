import { sql, type SQL } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";

/** Certified external bases fill gaps; overlapping canonical payroll is reconciled, never added twice. */
export async function retirementContributionHistory(db: DatabaseExecutor, employeeId: string, through: Date, payrollScope?: SQL) {
  const result = await db.execute<{ competence: string; regime: string; base: string; personal: string; employer: string; source: string }>(sql`
    WITH payroll_bases AS (
      SELECT "Payroll".competence,s.snapshot->'regime'->'socialSecurityScheme'->>'regime' regime,
        s.snapshot->'regime'->'socialSecurityScheme'->>'id' scheme,
        sum(coalesce((s.snapshot->'optionalPension'->>'employeeBase')::numeric,(s.snapshot->'bases'->>(s.snapshot->'regime'->'socialSecurityScheme'->>'regime'))::numeric,0)) base,
        max((s.snapshot->'regime'->'socialSecurityScheme'->>'ceilingValue')::numeric) ceiling,
        sum(coalesce((SELECT sum((item->>'value')::numeric) FROM jsonb_array_elements(s.snapshot->'items') item WHERE item->>'code' LIKE 'PREVIDENCIA_%'),0)) personal,
        sum(CASE WHEN s.snapshot ? 'employerComponents' THEN coalesce((s.snapshot->'employerComponents'->>'PREVIDENCIA_PATRONAL')::numeric,0)+coalesce((s.snapshot->'employerComponents'->>'CONTRIBUICAO_ATUARIAL')::numeric,0)
          ELSE s.employer-coalesce((SELECT sum((item->>'value')::numeric) FROM jsonb_array_elements(s.snapshot->'items') item WHERE item->>'code' IN ('FGTS','PIS_PASEP')),0) END) employer,string_agg(s.id,', ' ORDER BY s.id) source
      FROM "HrPayrollStatement" s JOIN "HrEmploymentContract" c ON c.id=s."contractId" JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" ON "Payroll".id=r."payrollId"
      WHERE c."employeeId"=${employeeId} AND r.mode='OFICIAL' AND r.status='FECHADA' AND "Payroll".type='Mensal'
        AND coalesce(s.snapshot->'payrollCategory'->>'category','ATIVO')='ATIVO'
        AND to_date("Payroll".competence,'MM/YYYY')<=${through}::date AND ${payrollScope ?? sql`true`}
      GROUP BY "Payroll".competence,s.snapshot->'regime'->'socialSecurityScheme'->>'regime',s.snapshot->'regime'->'socialSecurityScheme'->>'id'
    ) SELECT competence,regime,sum(CASE WHEN ceiling IS NULL THEN base ELSE least(base,ceiling) END)::text base,
        sum(personal)::text personal,sum(employer)::text employer,string_agg(source,'; ') source FROM payroll_bases GROUP BY competence,regime
    ORDER BY to_date(competence,'MM/YYYY') DESC,regime`);
  const certified = await db.execute<{ id: string; data: Record<string, string> }>(sql`SELECT id,data FROM "HrFunctionalRecord" WHERE kind='HISTORICO_CONTRIBUTIVO' AND "employeeId"=${employeeId} AND status<>'CANCELADO' AND "startsAt"<=${through} AND ("endsAt" IS NULL OR "endsAt">=${through}) AND to_date(data->>'competence','MM/YYYY')<=${through}::date ORDER BY data->>'competence',id`);
  const rows = [...result.rows];
  const seen = new Set<string>();
  for (const record of certified.rows) {
    const key = `${record.data.competence}:${record.data.regime}`;
    if (seen.has(key)) throw new Error(`Mais de uma base certificada vigente para ${key}.`);
    seen.add(key);
    const original = rows.find(row => row.competence === record.data.competence && row.regime === record.data.regime);
    if (original) {
      if (!new Decimal(original.base).eq(record.data.base)) throw new Error(`Base certificada e folha divergem em ${key}; concilie as fontes antes da média.`);
      if (!new Decimal(original.personal).eq(record.data.personalContribution) || !new Decimal(original.employer).eq(record.data.employerContribution)) throw new Error(`Contribuições certificadas e folha divergem em ${key}; concilie os recolhimentos documentados sem duplicar as bases.`);
      original.source += `; conferida por ${record.id}: ${record.data.source}`;
    } else rows.push({ competence: record.data.competence, regime: record.data.regime, base: record.data.base, personal: record.data.personalContribution, employer: record.data.employerContribution, source: `${record.id}: ${record.data.source}` });
  }
  const months = new Map<string, { competence: string; base: Decimal; sources: string[] }>();
  for (const row of rows) {
    const current = months.get(row.competence) ?? { competence: row.competence, base: new Decimal(0), sources: [] };
    current.base = current.base.add(row.base); current.sources.push(`${row.regime}: ${row.source}`); months.set(row.competence, current);
  }
  return [...months.values()].sort((a, b) => `${b.competence.slice(3)}-${b.competence.slice(0, 2)}`.localeCompare(`${a.competence.slice(3)}-${a.competence.slice(0, 2)}`)).map(row => ({ competence: row.competence, base: row.base.toFixed(2), source: row.sources.join("; ") }));
}
