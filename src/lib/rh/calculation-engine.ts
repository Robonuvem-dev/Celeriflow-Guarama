import { Decimal } from "@/db/decimal";
import type { Decimal as DecimalJs } from "decimal.js";

type Money = Decimal;
const D = (value: DecimalJs.Value) => new Decimal(value);
const round = (value: Money) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export const HR_PAYROLL_TYPES = ["Mensal", "Complementar", "Rescisão", "RRA", "Férias", "1ª parcela 13º", "13º", "Diferença 13º", "Adiantamento salarial"] as const;

/** Small recursive-descent interpreter: no executable JavaScript or dynamic evaluation. */
export function evaluatePayrollFormula(expression: string, resolve: (code: string) => Money): Money {
  if (!expression.trim() || expression.length > 500) throw new Error("Fórmula vazia ou extensa demais.");
  const tokens = expression.match(/\d+(?:\.\d+)?|[A-Z_][A-Z_0-9]*|[()+\-*/]/g) ?? [];
  if (tokens.join("") !== expression.replace(/\s/g, "") || tokens.length > 200) throw new Error("Fórmula contém símbolo não permitido.");
  let cursor = 0;
  let depth = 0;
  function atom(): Money {
    if (++depth > 40) throw new Error("Fórmula excede profundidade permitida.");
    try {
      const token = tokens[cursor++];
      if (token === "+") return atom();
      if (token === "-") return atom().negated();
      if (token === "(") {
        const result = sum();
        if (tokens[cursor++] !== ")") throw new Error("Parênteses inválidos.");
        return result;
      }
      if (!token) throw new Error("Fórmula incompleta.");
      if (/^\d/.test(token)) return D(token);
      if (/^[A-Z_]/.test(token)) return resolve(token);
      throw new Error("Operando inválido.");
    } finally { depth--; }
  }
  function product(): Money {
    let result = atom();
    while (tokens[cursor] === "*" || tokens[cursor] === "/") {
      const operator = tokens[cursor++];
      const right = atom();
      if (operator === "/" && right.isZero()) throw new Error("Divisão por zero.");
      result = operator === "*" ? result.mul(right) : result.div(right);
      if (!result.isFinite() || result.abs().gt("9999999999999999")) throw new Error("Resultado fora do limite monetário.");
    }
    return result;
  }
  function sum(): Money {
    let result = product();
    while (tokens[cursor] === "+" || tokens[cursor] === "-") {
      const operator = tokens[cursor++];
      result = operator === "+" ? result.add(product()) : result.sub(product());
    }
    return result;
  }
  const result = sum();
  if (cursor !== tokens.length || !result.isFinite()) throw new Error("Fórmula inválida.");
  return result;
}

export type PayrollRubricInput = {
  code: string; name: string; type: string; calculationMethod: string;
  formulaExpression: string | null; calculationBaseCode: string | null;
  fixedValue: DecimalJs.Value | null; percentageRate: DecimalJs.Value | null;
  incidences: { incidenceType: string; isIncluded: boolean }[];
};
export type PayrollBand = { lowerLimit: DecimalJs.Value; upperLimit: DecimalJs.Value | null; employeeRate: DecimalJs.Value };

export function calculateContribution(base: Money, bands: PayrollBand[], method: string, ceiling: DecimalJs.Value | null) {
  if (base.isNegative()) throw new Error("Base previdenciária negativa.");
  const taxable = ceiling === null ? base : Decimal.min(base, D(ceiling));
  const ordered = [...bands].sort((a, b) => D(a.lowerLimit).cmp(D(b.lowerLimit)));
  let previous = D(0);
  for (const [index, band] of ordered.entries()) {
    const lower = D(band.lowerLimit);
    const upper = band.upperLimit === null ? null : D(band.upperLimit);
    const rate = D(band.employeeRate);
    if (!lower.eq(previous) || rate.lt(0) || rate.gt(100) || (upper && upper.lte(lower)) || (!upper && index !== ordered.length - 1)) throw new Error("Faixas previdenciárias incompletas ou sobrepostas.");
    if (upper) previous = upper;
  }
  if (!ordered.length || (ordered.at(-1)!.upperLimit !== null && taxable.gt(D(ordered.at(-1)!.upperLimit!)))) throw new Error("Faixas não cobrem a base previdenciária.");
  if (method === "LINEAR") {
    const band = ordered.find(b => taxable.gte(D(b.lowerLimit)) && (b.upperLimit === null || taxable.lte(D(b.upperLimit))));
    if (!band) throw new Error("Faixa linear não encontrada.");
    return round(taxable.mul(D(band.employeeRate)).div(100));
  }
  if (method !== "PROGRESSIVA") throw new Error("Método previdenciário inválido.");
  return round(ordered.reduce((total, band) => {
    const limit = band.upperLimit === null ? taxable : Decimal.min(taxable, D(band.upperLimit));
    const width = Decimal.max(D(0), limit.sub(D(band.lowerLimit)));
    return total.add(width.mul(D(band.employeeRate)).div(100));
  }, D(0)));
}

/** Largest remainders distribute cents without creating negative residual shares. */
export function allocatePayrollAmount(total: Money, bases: Money[]): Money[] {
  const sum = bases.reduce((a, b) => a.add(b), D(0));
  if (!total.isFinite() || total.isNegative() || !total.eq(round(total)) || bases.some(b => !b.isFinite() || b.isNegative()) || (sum.isZero() && !total.isZero())) throw new Error("Rateio sem base válida.");
  if (sum.isZero()) return bases.map(() => D(0));
  const cents = total.mul(100);
  const shares = bases.map((base, index) => {
    const exact = cents.mul(base).div(sum);
    const whole = exact.floor();
    return { index, whole, remainder: exact.sub(whole) };
  });
  const residual = cents.sub(shares.reduce((value, share) => value.add(share.whole), D(0))).toNumber();
  const ordered = [...shares].sort((a, b) => b.remainder.cmp(a.remainder) || a.index - b.index);
  for (let index = 0; index < residual; index++) ordered[index].whole = ordered[index].whole.add(1);
  return shares.map(share => share.whole.div(100));
}

export function calculateContractRubrics(input: { salary: DecimalJs.Value; days: number; monthlyHours: number; rubrics: PayrollRubricInput[]; movements: Record<string, DecimalJs.Value>; parameters?: Record<string, DecimalJs.Value> }) {
  const values = new Map<string, Money>();
  const visiting = new Set<string>();
  const builtins: Record<string, Money> = { SALARIO_BASE: D(input.salary), DIAS: D(input.days), JORNADA: D(input.monthlyHours) };
  for (const [name, value] of Object.entries(input.parameters || {})) {
    if (!/^[A-Z_][A-Z_0-9]*$/.test(name) || Object.hasOwn(builtins, name)) throw new Error("Parâmetro de fórmula inválido ou reservado.");
    const decimal = D(value);
    if (!decimal.isFinite()) throw new Error("Parâmetro de fórmula não finito.");
    builtins[name] = decimal;
  }
  const byCode = new Map(input.rubrics.map(r => [r.code, r]));
  if (byCode.size !== input.rubrics.length || input.rubrics.some(r => builtins[r.code])) throw new Error("Código duplicado ou reservado de rubrica.");
  for (const code of Object.keys(input.movements)) if (!byCode.has(code)) throw new Error(`Movimento sem rubrica ativa: ${code}.`);
  function resolve(code: string): Money {
    if (builtins[code]) return builtins[code];
    if (values.has(code)) return values.get(code)!;
    if (visiting.has(code)) throw new Error(`Dependência cíclica na rubrica ${code}.`);
    if (visiting.size > 100) throw new Error("Excesso de dependências entre rubricas.");
    const rubric = byCode.get(code);
    if (!rubric) throw new Error(`Base não encontrada: ${code}.`);
    visiting.add(code);
    let value: Money;
    switch (rubric.calculationMethod) {
      case "MANUAL": value = D(input.movements[code] ?? 0); break;
      case "VALOR_FIXO":
        if (rubric.fixedValue === null) throw new Error(`Valor fixo ausente: ${code}.`);
        value = D(rubric.fixedValue); break;
      case "PERCENTUAL":
        if (!rubric.calculationBaseCode || rubric.percentageRate === null) throw new Error(`Base/percentual ausente: ${code}.`);
        value = resolve(rubric.calculationBaseCode).mul(D(rubric.percentageRate)).div(100); break;
      case "FORMULA_CONTROLADA": value = evaluatePayrollFormula(rubric.formulaExpression ?? "", resolve); break;
      default: throw new Error(`Método não suportado: ${rubric.calculationMethod}.`);
    }
    if (rubric.calculationMethod !== "MANUAL") value = value.add(D(input.movements[code] ?? 0));
    if (!value.isFinite() || value.abs().gt("9999999999999999")) throw new Error("Valor excede limite monetário.");
    value = round(value);
    values.set(code, value); visiting.delete(code);
    return value;
  }
  const bases: Record<string, Money> = {};
  let gross = D(0); let deductions = D(0);
  const items = input.rubrics.map(rubric => {
    const value = resolve(rubric.code);
    if (rubric.type === "PROVENTO") gross = gross.add(value);
    else if (rubric.type === "DESCONTO") deductions = deductions.add(value);
    else if (!["BASE", "INFORMATIVA"].includes(rubric.type)) throw new Error("Tipo de rubrica inválido.");
    for (const incidence of rubric.incidences.filter(i => i.isIncluded)) bases[incidence.incidenceType] = (bases[incidence.incidenceType] ?? D(0)).add(rubric.type === "DESCONTO" ? value.negated() : value);
    return { code: rubric.code, name: rubric.name, type: rubric.type, value: value.toFixed(2), method: rubric.calculationMethod, formula: rubric.formulaExpression, base: rubric.calculationBaseCode, rate: rubric.percentageRate?.toString() ?? null, fixed: rubric.fixedValue?.toString() ?? null, movement: D(input.movements[rubric.code] ?? 0).toFixed(2) };
  });
  return { items, bases, gross, deductions, net: gross.sub(deductions), employer: D(0) };
}

export function payrollPeriod(competence: string) {
  const match = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(competence);
  if (!match || Number(match[2]) < 1900 || Number(match[2]) > 2200) throw new Error("Competência deve ser MM/AAAA entre 1900 e 2200.");
  return { start: new Date(Date.UTC(Number(match[2]), Number(match[1]) - 1, 1)), end: new Date(Date.UTC(Number(match[2]), Number(match[1]), 0, 23, 59, 59, 999)) };
}
