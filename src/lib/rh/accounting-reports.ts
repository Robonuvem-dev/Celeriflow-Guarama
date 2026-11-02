import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { payrolls } from "@/db/schema/personnel-workforce";
import { z } from "zod";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";

export const accountingReportKinds = ["CONTABIL_LOTACAO_SINTETICO", "CONTABIL_DOTACAO_ANALITICO", "CONTABIL_DOTACAO_FONTE", "CONTABIL_DOTACAO_FONTE_DESPESA", "CONTABIL_FONTE", "CONTABIL_LOTACAO_ANALITICO", "CONTABIL_DOTACAO_LOCAL", "CONTABIL_LOTACAO_DOTACAO"] as const;
const stateSchema = z.object({ contract: z.object({ id: z.string(), employeeId: z.string(), registration: z.string(), departmentId: z.string().nullable(), workLocation: z.string(), employee: z.object({ name: z.string() }) }), items: z.array(z.object({ code: z.string(), name: z.string(), type: z.string(), value: z.string() })) });
type Allocation = { id: string; percentage: string };

/** Exact cent allocation with stable largest remainders; the parts always sum to the origin. */
export function allocateAccountingCents(amount: string, allocations: readonly Allocation[]): Map<string, Decimal> {
  if (!allocations.length || new Set(allocations.map(part => part.id)).size !== allocations.length || allocations.some(part => !new Decimal(part.percentage).isFinite() || new Decimal(part.percentage).lte(0)) || !allocations.reduce((sum, part) => sum.plus(part.percentage), new Decimal(0)).eq(100)) throw new Error("O rateio deve conter percentuais positivos distintos que totalizem exatamente 100%.");
  const origin = new Decimal(amount);
  if (!origin.isFinite() || !origin.eq(origin.toDecimalPlaces(2))) throw new Error("Origem contábil exige valor monetário finito com até duas casas.");
  const cents = origin.abs().mul(100);
  const parts = allocations.map(part => { const exact = cents.mul(part.percentage).div(100); return { id: part.id, cents: exact.floor(), remainder: exact.minus(exact.floor()) }; });
  const remaining = cents.minus(parts.reduce((sum, part) => sum.plus(part.cents), new Decimal(0))).toNumber();
  const ordered = [...parts].sort((a, b) => b.remainder.comparedTo(a.remainder) || a.id.localeCompare(b.id));
  for (let i = 0; i < remaining; i++) ordered[i].cents = ordered[i].cents.plus(1);
  return new Map(parts.map(part => [part.id, part.cents.div(100).mul(origin.isNegative() ? -1 : 1)]));
}

export async function buildAccountingHrReport(db: DatabaseExecutor, input: OperationalReportInput, payrollScope?: SQL, budgetUnitIds?: readonly string[]): Promise<PersonnelReport> {
  const from = input.from ?? (input.competence ? `${input.competence.slice(3)}-${input.competence.slice(0, 2)}-01` : `${input.year ?? new Date().getUTCFullYear()}-01-01`);
  const until = input.until ?? (input.competence ? new Date(Date.UTC(Number(input.competence.slice(3)), Number(input.competence.slice(0, 2)), 0)).toISOString().slice(0, 10) : `${input.year ?? new Date().getUTCFullYear()}-12-31`);
  if (from > until) throw new Error("Fim anterior ao início.");
  const selected = await db.select({ id: sql<string>`s.id`, competence: payrolls.competence, type: payrolls.type, scope: sql<string>`r.scope`, snapshot: sql<unknown>`s.snapshot`, gross: sql<string>`s.gross::text`, deductions: sql<string>`s.deductions::text`, net: sql<string>`s.net::text`, employer: sql<string>`s.employer::text` }).from(payrolls)
    .innerJoin(sql`"HrPayrollRun" r`, sql`r."payrollId"=${payrolls.id}`).innerJoin(sql`"HrPayrollStatement" s`, sql`s."runId"=r.id`)
    .where(sql`r.status='FECHADA' AND r.mode='OFICIAL' AND ${payrollScope ?? sql`true`} AND to_date(${payrolls.competence},'MM/YYYY') BETWEEN date_trunc('month',${from}::date) AND ${until}::date ${input.payrollId ? sql`AND ${payrolls.id}=${input.payrollId}` : sql``}`).orderBy(sql`to_date(${payrolls.competence},'MM/YYYY')`, sql`s.id`);
  const config = await db.execute<{ id: string; details: Record<string, string>; appropriation: string; budgetUnitId: string; source: string; nature: string }>(sql`
    SELECT r.id,r.details,a.code appropriation,a."budgetUnitId",s.code source,n.code nature FROM "HrReferenceRecord" r
    JOIN "BudgetAppropriation" a ON a.id=r.details->>'appropriationId' JOIN "ResourceSource" s ON s.id=a."resourceSourceId" JOIN "ExpenseNature" n ON n.id=a."expenseNatureId"
    WHERE r.kind='RATEIO_FOLHA' ORDER BY r.id`);
  const configHash = createHash("sha256").update(JSON.stringify(config.rows)).digest("hex");
  const analytical = ["CONTABIL_DOTACAO_ANALITICO", "CONTABIL_LOTACAO_ANALITICO"].includes(input.kind);
  const dimensions: Record<string, Array<[string, string]>> = {
    CONTABIL_LOTACAO_SINTETICO: [["department", "Lotação histórica ID"]],
    CONTABIL_DOTACAO_ANALITICO: [["appropriation", "Dotação"]],
    CONTABIL_DOTACAO_FONTE: [["appropriation", "Dotação"], ["source", "Fonte"]],
    CONTABIL_DOTACAO_FONTE_DESPESA: [["appropriation", "Dotação"], ["source", "Fonte"], ["nature", "Natureza da despesa"]],
    CONTABIL_FONTE: [["source", "Fonte"]], CONTABIL_LOTACAO_ANALITICO: [["department", "Lotação histórica ID"]],
    CONTABIL_DOTACAO_LOCAL: [["appropriation", "Dotação"], ["location", "Local histórico"]],
    CONTABIL_LOTACAO_DOTACAO: [["department", "Lotação histórica ID"], ["appropriation", "Dotação"]],
  };
  const chosen = dimensions[input.kind];
  if (!chosen) throw new Error("Visão contábil desconhecida.");
  const totals = (input.totalizers ?? "BRUTO,DESCONTOS,LIQUIDO,ENCARGOS").split(",");
  if (totals.some(total => !["BRUTO", "DESCONTOS", "LIQUIDO", "ENCARGOS"].includes(total)) || new Set(totals).size !== totals.length) throw new Error("Totalizadores inválidos ou repetidos.");
  const grouped = new Map<string, { labels: string[]; value: Decimal }>();
  for (const statement of selected) {
    if (statement.scope !== "DEMONSTRACAO") throw new Error("Rateio de demonstração não é classificação contábil oficial; use somente folhas demonstrativas.");
    const snapshot = stateSchema.parse(statement.snapshot), c = snapshot.contract;
    if (input.employeeId && c.employeeId !== input.employeeId || input.departmentId && c.departmentId !== input.departmentId || input.q && !`${c.employee.name} ${c.registration}`.toLocaleLowerCase("pt-BR").includes(input.q.toLocaleLowerCase("pt-BR"))) continue;
    const monthStart = `${statement.competence.slice(3)}-${statement.competence.slice(0, 2)}-01`, monthEnd = new Date(Date.UTC(Number(statement.competence.slice(3)), Number(statement.competence.slice(0, 2)), 0)).toISOString().slice(0, 10);
    const remuneration = snapshot.items.filter(item => ["PROVENTO", "DESCONTO"].includes(item.type));
    const sum = (type: string) => remuneration.filter(item => item.type === type).reduce((total, item) => total.plus(item.value), new Decimal(0));
    if (!sum("PROVENTO").eq(statement.gross) || !sum("DESCONTO").eq(statement.deductions) || !new Decimal(statement.gross).minus(statement.deductions).eq(statement.net)) throw new Error("Demonstrativo não concilia com suas rubricas; apropriação interrompida.");
    for (const component of ["REMUNERACAO", "ENCARGO"]) {
      const rates = config.rows.filter(row => row.details.contractId === c.id && row.details.component === component && row.details.from <= monthStart && row.details.until >= monthEnd);
      if (!rates.length) throw new Error(`Configure rateio de 100% para ${c.registration}, ${component}, ${statement.competence}.`);
      const allocations = rates.map(row => ({ id: row.id, percentage: row.details.percentage }));
      const origins = component === "REMUNERACAO" ? remuneration.map(item => ({ code: item.code, type: item.type, amount: item.value, line: "RUBRICA" })) : [{ code: "ENCARGOS_PATRONAIS", type: "ENCARGO", amount: statement.employer, line: "ENCARGO" }];
      const items = origins.map(item => ({ ...item, parts: allocateAccountingCents(item.amount, allocations) }));
      // Derive subtotals from the allocated rubrics. Independently allocating gross/net
      // would give cent differences whenever several rubrics leave rounding residues.
      for (const code of totals.filter(code => component === "ENCARGO" ? code === "ENCARGOS" : code !== "ENCARGOS")) {
        const parts = new Map(rates.map(rate => [rate.id, items.reduce((sum, item) => {
          const included = item.line !== "TOTAL_NAO_ADITIVO" && (code === "ENCARGOS" || code === "LIQUIDO" || code === "BRUTO" && item.type === "PROVENTO" || code === "DESCONTOS" && item.type === "DESCONTO");
          return included ? sum.plus(item.parts.get(rate.id)!.mul(code === "LIQUIDO" && item.type === "DESCONTO" ? -1 : 1)) : sum;
        }, new Decimal(0))]));
        items.push({ code, type: "TOTAL", amount: "0", line: "TOTAL_NAO_ADITIVO", parts });
      }
      for (const item of items) {
        for (const rate of rates) {
          if (budgetUnitIds !== undefined && !budgetUnitIds.includes(rate.budgetUnitId)) continue;
          const labelsByKey: Record<string, string> = { department: c.departmentId ?? "SEM_LOTACAO", location: c.workLocation, appropriation: rate.appropriation, source: rate.source, nature: rate.nature };
          const labels = [statement.competence, statement.type, statement.scope, rate.budgetUnitId, ...chosen.map(([key]) => labelsByKey[key]), ...(analytical ? [c.registration, c.employee.name] : []), component, item.line, item.code, item.type];
          const key = JSON.stringify(labels), group = grouped.get(key) ?? { labels, value: new Decimal(0) };
          group.value = group.value.plus(item.parts.get(rate.id)!); grouped.set(key, group);
        }
      }
    }
  }
  return { title: `Apropriação demonstrativa — ${input.kind} — configuração ${configHash.slice(0, 16)}; totais não aditivos, sem lançamento contábil`, headers: ["Competência", "Tipo de folha", "Escopo", "Unidade gestora ID", ...chosen.map(([, label]) => label), ...(analytical ? ["Matrícula", "Servidor"] : []), "Componente", "Tipo da linha", "Rubrica / totalizador", "Natureza da linha", "Valor rateado BRL"], rows: [...grouped.values()].sort((a, b) => JSON.stringify(a.labels).localeCompare(JSON.stringify(b.labels))).map(row => [...row.labels, row.value.toFixed(2)]) };
}
