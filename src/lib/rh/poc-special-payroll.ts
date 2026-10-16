import { Prisma } from "@prisma/client";
import { z } from "zod";
import { HR_PAYROLL_TYPES, payrollPeriod, type PayrollRubricInput } from "./calculation-engine";

const money = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/);
export const pocSpecialParametersSchema = z.object({
  days: z.coerce.number().int().min(0).max(30).default(30),
  avos: z.coerce.number().int().min(0).max(12).optional(), vacationDays: z.coerce.number().int().min(0).max(90).default(30),
  average: money.default("0.00"), variableAmount: money.default("0.00"), previousAdvance: money.default("0.00"),
  advanceRate: z.coerce.number().min(0).max(100).default(40), rraMonths: z.coerce.number().int().min(1).max(600).default(6),
  rraAmount: money.default("18000.00"), reason: z.string().trim().min(10).max(2000),
  sourceRunId: z.string().min(1).optional(),
  vacationEntryIds: z.record(z.string(), z.array(z.string().min(1)).min(1)).optional(),
}).strict();
export const pocSpecialPolicySchema = z.object({ origin: z.literal("FOLHAS_ESPECIAIS_POC"), legalReference: z.string().min(3), estimated: z.literal(true), version: z.literal(1) }).strict();

export function countThirteenthAvos(admittedAt: Date, through: Date, endsAt: Date | null) {
  let avos = 0;
  const year = through.getUTCFullYear();
  const last = Math.min(through.getTime(), endsAt?.getTime() ?? Infinity);
  for (let month = 0; month <= through.getUTCMonth(); month++) {
    const from = Math.max(Date.UTC(year, month, 1), admittedAt.getTime());
    const until = Math.min(Date.UTC(year, month + 1, 0), last);
    if (until >= from && Math.floor((until - from) / 86400000) + 1 >= 15) avos++;
  }
  return avos;
}

export function preparePocSpecialRubrics(input: {
  payrollType: string; competence: string; salary: Prisma.Decimal.Value; admittedAt: Date; endsAt: Date | null;
  parameters: z.infer<typeof pocSpecialParametersSchema>; rubrics: PayrollRubricInput[];
  history?: { gross: string; advance: string };
}) {
  if (!(HR_PAYROLL_TYPES as readonly string[]).includes(input.payrollType) || input.payrollType === "Mensal") throw new Error("Tipo especial inválido.");
  const p = input.parameters, D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
  const base = D(input.salary).add(p.average), amounts: Record<string, Prisma.Decimal> = {};
  const formulas: Record<string, string> = {};
  const avos = p.avos ?? countThirteenthAvos(input.admittedAt, new Date(payrollPeriod(input.competence).end.toISOString().slice(0, 10)), input.endsAt);
  const add = (code: string, value: Prisma.Decimal, formula: string) => { amounts[code] = value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP); formulas[code] = formula; };
  switch (input.payrollType) {
    case "Complementar": add("POC_COMPLEMENTO", D(p.variableAmount), "VALOR_COMPLEMENTAR_INFORMADO"); break;
    case "Adiantamento salarial": add("POC_ADIANTAMENTO", base.mul(p.advanceRate).div(100), "(SALARIO_BASE + MEDIA) * PERCENTUAL / 100"); break;
    case "1ª parcela 13º": add("POC_ADIANTAMENTO_13", base.mul(avos).div(12).div(2), "(SALARIO_BASE + MEDIA) * AVOS / 12 / 2"); break;
    case "13º":
      add("POC_DECIMO_13", base.mul(avos).div(12), "(SALARIO_BASE + MEDIA) * AVOS / 12");
      add("POC_ABATIMENTO", D(input.history?.advance ?? p.previousAdvance), input.history ? "ADIANTAMENTO_DA_EXECUCAO_VINCULADA" : "PARCELA_ANTERIOR_INFORMADA"); break;
    case "Diferença 13º":
      if (input.history) {
        const difference = base.mul(avos).div(12).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).sub(input.history.gross);
        if (difference.lt(0)) throw new Error("Diferença negativa exige restituição/compensação própria.");
        add("POC_DECIMO_13", difference, "TOTAL_13_RECALCULADO - BRUTO_DA_EXECUCAO_VINCULADA");
      } else {
        add("POC_DECIMO_13", base.mul(avos).div(12), "(SALARIO_BASE + MEDIA) * AVOS / 12");
        add("POC_ABATIMENTO", D(p.previousAdvance), "PARCELA_ANTERIOR_INFORMADA");
      }
      break;
    case "Férias":
      add("POC_FERIAS", base.mul(p.vacationDays).div(30), "(SALARIO_BASE + MEDIA) * DIAS_FERIAS / 30");
      add("POC_TERCO", amounts.POC_FERIAS.div(3), "REMUNERACAO_FERIAS / 3"); break;
    case "Rescisão":
      add("POC_SALDO", D(input.salary).mul(p.days).div(30), "SALARIO_BASE * DIAS_SALDO / 30");
      add("POC_DECIMO_13", base.mul(avos).div(12), "(SALARIO_BASE + MEDIA) * AVOS / 12");
      add("POC_FERIAS_IND", base.mul(p.vacationDays).div(30), "(SALARIO_BASE + MEDIA) * DIAS_INDENIZADOS / 30");
      add("POC_TERCO_IND", amounts.POC_FERIAS_IND.div(3), "FERIAS_INDENIZADAS / 3");
      add("POC_ABATIMENTO", D(p.previousAdvance), "ADIANTAMENTOS_INFORMADOS"); break;
    case "RRA": add("POC_RRA", D(p.rraAmount), "RENDIMENTOS_ACUMULADOS_INFORMADOS"); break;
  }
  const rubrics = Object.keys(amounts).map(code => {
    const rubric = input.rubrics.find(rubric => rubric.code === code);
    if (!rubric || rubric.calculationMethod !== "MANUAL") throw new Error(`Configure rubrica MANUAL ${code} para a folha especial POC.`);
    return rubric;
  });
  return { rubrics, movements: amounts, memory: { ...p, avos, referenceSalary: D(input.salary).toFixed(2), remunerationWithAverage: base.toFixed(2), formulas, estimated: true, rightsConsumed: false, employmentTerminated: false, taxModel: input.payrollType === "Rescisão" ? "POC_AGREGADO_RESCISAO" : input.payrollType === "RRA" ? "RRA_TABELA_MULTIPLICADA" : "POC_POR_TIPO" } };
}
