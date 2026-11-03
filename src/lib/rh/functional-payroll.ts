import { Decimal } from "@/db/decimal";
import type { FunctionalRecord } from "./functional-record-service";
import { calculateContractRubrics } from "./calculation-engine";

const day = 86400000;
const civil = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
type Rubrics = Parameters<typeof calculateContractRubrics>[0]["rubrics"];
type Result = ReturnType<typeof calculateContractRubrics>;
export function resolvePayrollCategory(records: FunctionalRecord[], contract: { salary: Decimal; employee: { personId: string | null }; admittedAt?: Date; endsAt?: Date | null }, period: { start: Date; end: Date }) {
  const selected = records.filter(row => row.kind === "CATEGORIA_FOLHA").sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const category = selected.at(-1);
  if (new Set(selected.map(row => row.data.category)).size > 1) throw new Error("Categorias de ativo e beneficiário devem possuir vínculos próprios; concilie o enquadramento da competência.");
  if (!category || category.data.category === "ATIVO") return { category: "ATIVO", salary: contract.salary, recordId: category?.id ?? null, sourceSalary: contract.salary.toFixed(2), legalReference: category?.data.legalReference ?? "Enquadramento contratual" };
  const start = Math.max(civil(period.start), contract.admittedAt ? civil(contract.admittedAt) : -Infinity), end = Math.min(civil(period.end), contract.endsAt ? civil(contract.endsAt) : Infinity);
  for (let at = start; at <= end; at += day) {
    const current = selected.filter(row => civil(row.startsAt) <= at && (!row.endsAt || civil(row.endsAt) >= at));
    if (current.length !== 1 || current[0].data.category !== category.data.category) throw new Error("O vínculo de benefício exige enquadramento único e contínuo em cada dia de vigência; categorias distintas exigem vínculos próprios.");
    if (current[0].data.category === "PENSIONISTA" && current[0].data.beneficiaryPersonId !== contract.employee.personId) throw new Error("A folha de pensionista exige contrato próprio da pessoa beneficiária; preserve o instituidor no cadastro da pensão.");
  }
  return { category: category.data.category, salary: new Decimal(category.data.amount), recordId: category.id, sourceSalary: contract.salary.toFixed(2), legalReference: category.data.legalReference };
}
export function matchingFunctionalRules(records: FunctionalRecord[], kind: string, contract: { regimeId: string; roleId: string }, period: { start: Date; end: Date }) {
  return records.filter(row => row.kind === kind && (!row.data.regimeId || row.data.regimeId === contract.regimeId) && (!row.data.roleId || row.data.roleId === contract.roleId) && row.startsAt <= period.end && (!row.endsAt || row.endsAt >= period.start));
}

/** Re-evaluate dependent formulas and incidence bases after the configured adjustment. */
export function applyRemunerationLimits(input: Parameters<typeof calculateContractRubrics>[0], rules: FunctionalRecord[], period: { start: Date; end: Date }) {
  let result = calculateContractRubrics(input);
  const memory: Array<{ recordId: string; version: number; base: string; floor: string; ceiling: string; floorAdjustment: string; ceilingAdjustment: string; legalReference: string }> = [];
  if (rules.length > 1) throw new Error("Mais de uma regra de piso/teto aplicável; concilie o enquadramento.");
  for (const rule of rules) {
    if (rule.startsAt > period.start || rule.endsAt && civil(rule.endsAt) < civil(period.end)) throw new Error("Mudança intramês de piso/teto exige folha separada por vigência.");
    const codes = rule.data.includedCodes.split(",").map(code => code.trim()).filter(Boolean);
    if (!codes.length || new Set(codes).size !== codes.length || codes.some(code => !result.items.some(item => item.code === code))) throw new Error("Configure rubricas distintas existentes para a base do piso/teto.");
    if ([rule.data.floorRubric, rule.data.ceilingRubric].some(code => codes.includes(code))) throw new Error("As rubricas de ajuste não podem compor sua própria base de limite.");
    const base = result.items.filter(item => codes.includes(item.code)).reduce((sum, item) => sum.add(new Decimal(item.value).mul(item.type === "DESCONTO" ? -1 : 1)), new Decimal(0));
    const floor = new Decimal(rule.data.floor), ceiling = new Decimal(rule.data.ceiling);
    const floorAdjustment = Decimal.max(0, floor.sub(base)), ceilingAdjustment = Decimal.max(0, base.sub(ceiling));
    if (ceilingAdjustment.gt(0) && rule.data.ceilingMode === "BLOQUEAR") throw new Error(`Remuneração acima do teto: base ${base.toFixed(2)}, teto ${ceiling.toFixed(2)}. ${rule.data.legalReference}`);
    const movements = { ...input.movements };
    for (const [code, amount, type] of [[rule.data.floorRubric, floorAdjustment, "PROVENTO"], [rule.data.ceilingRubric, ceilingAdjustment, "DESCONTO"]] as const) {
      const rubric = input.rubrics.find(row => row.code === code);
      if (!rubric || rubric.calculationMethod !== "MANUAL" || rubric.type !== type) throw new Error(`Configure a rubrica ${code} como ${type} manual para o ajuste de limite.`);
      if (movements[code] && !new Decimal(movements[code]).isZero()) throw new Error("Rubrica de limite já possui lançamento; concilie a origem.");
      movements[code] = amount;
    }
    result = calculateContractRubrics({ ...input, movements });
    memory.push({ recordId: rule.id, version: rule.version, base: base.toFixed(2), floor: floor.toFixed(2), ceiling: ceiling.toFixed(2), floorAdjustment: floorAdjustment.toFixed(2), ceilingAdjustment: ceilingAdjustment.toFixed(2), legalReference: rule.data.legalReference });
  }
  return { result, memory };
}

/** Personal RPPS exclusion is independent from the separately configured employer basis. */
export function assessOptionalPensionBase(result: Result, rubrics: Rubrics, options: FunctionalRecord[], period: { start: Date; end: Date }, schemeRegime: string) {
  let employeeExclusion = new Decimal(0), employerExclusion = new Decimal(0);
  const memory: Array<{ recordId: string; rubricCode: string; employeeExclusion: string; employerExclusion: string; fraction: string; legalReference: string }> = [];
  if (options.length && schemeRegime !== "RPPS") throw new Error("Opção previdenciária individual exige enquadramento RPPS.");
  for (const option of options.filter(row => row.data.choice === "SUSPENDER")) {
    const rubric = rubrics.find(row => row.code === option.data.rubricCode), item = result.items.find(row => row.code === option.data.rubricCode);
    if (!rubric || !item || rubric.type !== "PROVENTO" || !rubric.incidences.some(row => row.incidenceType === "RPPS" && row.isIncluded)) throw new Error("A verba optativa deve ser provento integrante da base RPPS.");
    const start = Math.max(civil(period.start), civil(option.startsAt)), end = Math.min(civil(period.end), option.endsAt ? civil(option.endsAt) : civil(period.end));
    const fraction = new Decimal(Math.max(0, (end - start) / day + 1)).div((civil(period.end) - civil(period.start)) / day + 1);
    const amount = new Decimal(item.value).mul(fraction).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    employeeExclusion = employeeExclusion.add(amount);
    const patronal = option.data.employer === "EXCLUIR" ? amount : new Decimal(0);
    employerExclusion = employerExclusion.add(patronal);
    memory.push({ recordId: option.id, rubricCode: rubric.code, employeeExclusion: amount.toFixed(2), employerExclusion: patronal.toFixed(2), fraction: fraction.toString(), legalReference: option.data.legalReference });
  }
  const original = result.bases[schemeRegime] ?? new Decimal(0);
  if (employeeExclusion.gt(original) || employerExclusion.gt(original)) throw new Error("Exclusão optativa excede a base previdenciária.");
  return { employeeBase: original.sub(employeeExclusion), employerBase: original.sub(employerExclusion), memory };
}
