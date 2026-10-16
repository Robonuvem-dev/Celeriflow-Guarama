import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { allocateProratedStatementLocations } from "@/lib/rh/prorated-statement-locations";
import { allocatePayrollAmount } from "@/lib/rh/calculation-engine";
import { MunicipalCostError } from "./cost-ledger";

const item = z.object({ code: z.string().min(1), type: z.string(), value: z.string() });
const schema = z.object({ contract: z.object({ id: z.string().min(1), employeeId: z.string().min(1), costCenterId: z.string().nullable(), workLocation: z.string() }), items: z.array(item), proration: z.unknown().optional() });
export type PayrollCostSlice = { key: string; amount: Prisma.Decimal; dimensions: Record<string, string>; evidence: Record<string, unknown> };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Provision totals are already rounded by RH. Split those totals, never
 * recalculate the rate separately per location/rubric and lose cents. */
export function splitPayrollProvisionCosts(statement: { id: string; contractId: string; snapshot: Prisma.JsonValue }, details: Prisma.JsonValue, kind: string) {
  const frozen = schema.parse(statement.snapshot);
  const memory = z.object({ statementId: z.string(), memory: z.object({ base: z.string(), remuneration: z.string(), employer: z.string(), total: z.string(), items: z.array(item).min(1) }) }).parse(details);
  if (memory.statementId !== statement.id || frozen.contract.id !== statement.contractId) throw new MunicipalCostError("Provisão não corresponde ao demonstrativo histórico informado.");
  const codes = memory.memory.items.map(row => row.code);
  if (new Set(codes).size !== codes.length || memory.memory.items.some(row => row.type !== "PROVENTO")) throw new MunicipalCostError("Base da provisão contém verbas repetidas ou não remuneratórias.");
  for (const row of memory.memory.items) {
    const matches = frozen.items.filter(candidate => candidate.code === row.code && candidate.type === "PROVENTO");
    if (matches.length !== 1 || !new Prisma.Decimal(matches[0].value).equals(row.value)) throw new MunicipalCostError("Verba provisionada diverge da memória fechada.");
  }
  const parts = frozen.proration ? allocateProratedStatementLocations(statement.snapshot, "0.00") : [{ costCenterId: frozen.contract.costCenterId, workLocation: frozen.contract.workLocation, items: frozen.items }];
  const bases = parts.flatMap((part, segment) => part.items.filter(row => row.type === "PROVENTO" && codes.includes(row.code)).map(row => ({ segment, code: row.code, weight: new Prisma.Decimal(row.value), costCenterId: part.costCenterId, workLocation: part.workLocation })));
  for (const row of memory.memory.items) {
    if (parts.some(part => part.items.filter(candidate => candidate.code === row.code).length !== 1) || !bases.filter(candidate => candidate.code === row.code).reduce((sum, candidate) => sum.plus(candidate.weight), new Prisma.Decimal(0)).equals(row.value)) throw new MunicipalCostError("Segmentos da verba provisionada estão incompletos ou divergentes.");
  }
  const base = new Prisma.Decimal(memory.memory.base), remuneration = new Prisma.Decimal(memory.memory.remuneration), employer = new Prisma.Decimal(memory.memory.employer), total = new Prisma.Decimal(memory.memory.total);
  if ([base, remuneration, employer, total, ...bases.map(row => row.weight)].some(value => !value.isFinite() || value.lt(0) || value.decimalPlaces() > 2) || !remuneration.plus(employer).equals(total) || !bases.reduce((sum, row) => sum.plus(row.weight), new Prisma.Decimal(0)).equals(base)) throw new MunicipalCostError("Segmentos/verbas da provisão não reconciliam os totais Decimal.");
  const grossShares = allocatePayrollAmount(remuneration, bases.map(row => row.weight));
  const slices: PayrollCostSlice[] = [];
  const dimensions = (part: { costCenterId: string | null; workLocation: string }, component: string): Record<string, string> => ({ employeeId: frozen.contract.employeeId, contractId: statement.contractId, workLocation: part.workLocation, provisionKind: kind, payrollComponent: component, ...(part.costCenterId ? { costCenterId: part.costCenterId } : {}) });
  const evidence = { statementId: statement.id, statementHash: digest(statement.snapshot), provisionBase: base.toFixed(2), provisionTotal: total.toFixed(2), allocationMethod: "PROVISION_BASE_LARGEST_REMAINDER" };
  bases.forEach((row, at) => {
    if (grossShares[at].gt(0)) slices.push({ key: digest([statement.id, kind, row.segment, "GROSS", row.code]), amount: grossShares[at], dimensions: { ...dimensions(row, "GROSS"), payrollCode: row.code }, evidence: { ...evidence, segment: row.segment, rubricCode: row.code, weight: row.weight.toFixed(2) } });
  });
  const segmentWeights = parts.map((_, index) => bases.filter(row => row.segment === index).reduce((sum, row) => sum.plus(row.weight), new Prisma.Decimal(0)));
  const employerShares = allocatePayrollAmount(employer, segmentWeights);
  parts.forEach((part, segment) => {
    if (employerShares[segment].gt(0)) slices.push({ key: digest([statement.id, kind, segment, "EMPLOYER"]), amount: employerShares[segment], dimensions: dimensions(part, "EMPLOYER"), evidence: { ...evidence, segment, weight: segmentWeights[segment].toFixed(2) } });
  });
  if (!slices.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)).equals(total)) throw new MunicipalCostError("Detalhamento da provisão não conserva o valor reconhecido.");
  return slices;
}

/** Closed snapshots supply identity/location. Live personnel changes never rewrite costs. */
export function splitPayrollCostStatements(statements: Array<{ id: string; contractId: string; gross: Prisma.Decimal; employer: Prisma.Decimal; snapshot: Prisma.JsonValue }>, selection: { component: "GROSS" | "EMPLOYER"; costCenterId: string | null }) {
  const slices: PayrollCostSlice[] = [];
  for (const statement of [...statements].sort((a, b) => a.id.localeCompare(b.id))) {
    const frozen = schema.parse(statement.snapshot);
    if (frozen.contract.id !== statement.contractId) throw new MunicipalCostError("Identidade contratual diverge da memória fechada da folha.");
    const parts = frozen.proration ? allocateProratedStatementLocations(statement.snapshot, statement.employer) : [{ costCenterId: frozen.contract.costCenterId, workLocation: frozen.contract.workLocation, items: frozen.items, gross: statement.gross, employer: statement.employer }];
    if (!parts.reduce((sum, part) => sum.plus(part.gross), new Prisma.Decimal(0)).equals(statement.gross) || !parts.reduce((sum, part) => sum.plus(part.employer), new Prisma.Decimal(0)).equals(statement.employer)) throw new MunicipalCostError("Localizações históricas não reconciliam os totais da folha.");
    for (const [index, part] of parts.entries()) {
      const earnings = part.items.filter(row => row.type === "PROVENTO");
      if (new Set(earnings.map(row => row.code)).size !== earnings.length) throw new MunicipalCostError("Rubrica repetida na memória individual da folha.");
      const values = earnings.map(row => new Prisma.Decimal(row.value));
      if (values.some(value => !value.isFinite() || value.lt(0) || value.decimalPlaces() > 2) || !values.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0)).equals(part.gross)) throw new MunicipalCostError("Rubricas individuais não reconciliam o bruto Decimal da folha.");
      if (!part.employer.isFinite() || part.employer.lt(0) || part.employer.decimalPlaces() > 2) throw new MunicipalCostError("Encargos individuais sem valor Decimal conciliado.");
      if (part.costCenterId !== selection.costCenterId) continue;
      const rows = selection.component === "GROSS" ? earnings.map((row, at) => ({ code: row.code, amount: values[at] })) : [{ code: null, amount: part.employer }];
      for (const row of rows.filter(row => row.amount.gt(0))) {
        const key = digest([statement.id, index, selection.component, row.code]);
        slices.push({ key, amount: row.amount, dimensions: { employeeId: frozen.contract.employeeId, contractId: statement.contractId, workLocation: part.workLocation, payrollComponent: selection.component, ...(part.costCenterId ? { costCenterId: part.costCenterId } : {}), ...(row.code ? { payrollCode: row.code } : {}) }, evidence: { statementId: statement.id, statementHash: digest(statement.snapshot), segment: index, component: selection.component, rubricCode: row.code, gross: part.gross.toFixed(2), employer: part.employer.toFixed(2) } });
      }
    }
  }
  return slices;
}

/** Provision releases reduce only the same contractual component, retaining all cents. */
export function deductPayrollCostReleases(slices: PayrollCostSlice[], releases: Array<{ contractId: string; component: "GROSS" | "EMPLOYER"; amount: Prisma.Decimal; payrollCodes?: string[] }>) {
  const result = slices.map(slice => ({ ...slice, dimensions: { ...slice.dimensions }, evidence: { ...slice.evidence }, amount: new Prisma.Decimal(slice.amount) }));
  for (const release of releases) {
    const selected = result.filter(slice => slice.dimensions.contractId === release.contractId && slice.dimensions.payrollComponent === release.component && (!release.payrollCodes || release.payrollCodes.includes(slice.dimensions.payrollCode)));
    const available = selected.reduce((sum, slice) => sum.plus(slice.amount), new Prisma.Decimal(0));
    if (!release.amount.isFinite() || release.amount.lte(0) || release.amount.decimalPlaces() > 2 || release.amount.gt(available)) throw new MunicipalCostError("Baixa de provisão excede o componente individual conciliado da liquidação.");
    const amounts = allocatePayrollAmount(release.amount, selected.map(slice => slice.amount));
    selected.forEach((slice, at) => { slice.amount = slice.amount.minus(amounts[at]); slice.evidence.provisionReleased = new Prisma.Decimal(String(slice.evidence.provisionReleased ?? "0")).plus(amounts[at]).toFixed(2); });
  }
  return result.filter(slice => slice.amount.gt(0));
}
