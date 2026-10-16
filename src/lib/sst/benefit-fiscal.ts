import { z } from "zod";

// Official sources checked 2026-10-10. The index establishes an exercise-specific
// layout, not the taxpayer's obligation or eligibility of each ledger amount.
export const benefitFiscalSources = {
  layouts: "https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/dirf/leiaute",
  dirf2025: "https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=141589",
  obligation: "https://www.gov.br/pt-br/servicos/declarar-imposto-de-renda-retido-na-fonte",
  replacementFrom2025: "https://www.gov.br/esocial/pt-br/noticias/substituicao-da-dirf-pgd-por-eventos-do-esocial-comeca-no-periodo-de-apuracao-01-2025",
} as const;
export function benefitFiscalReadiness(calendarYear: number) {
  const year = z.number().int().min(2000).max(9998).parse(calendarYear);
  return {
    calendarYear: year, exercise: year + 1, checkedAt: "2026-10-10",
    reportingRegime: year >= 2025 ? "ESOCIAL_EFD_REINF" as const : "DIRF_LEGACY_YEAR_SPECIFIC" as const,
    layoutReference: year === 2024 ? benefitFiscalSources.dirf2025 : null,
    status: "BLOCKED" as const, officialOutputAvailable: false as const,
    blockers: [
      "PAYMENT_CASH_BASIS_UNCONFIRMED",
      "SOURCE_PAYER_YEAR_SPECIFIC_APPLICABILITY_REQUIRES_VERIFICATION",
      ...(year >= 2025 ? ["DIRF_PGD_REPLACED_FROM_CALENDAR_2025", "ESOCIAL_S1210_PAYMENT_ADAPTER_NOT_IMPLEMENTED"] : []),
      ...(year === 2024 ? ["DIRF_2025_SERIALIZER_NOT_IMPLEMENTED"] : ["YEAR_SPECIFIC_LAYOUT_NOT_VERIFIED_DO_NOT_REUSE_DIRF_2025"]),
    ],
    sources: benefitFiscalSources,
    explanation: "Valores por competência são preparação contratual. Sem pagamento datado e conciliação individual não compõem automaticamente declaração nem comprovante oficial de rendimentos. A fonte oficial do eSocial confirma substituição da DIRF PGD por eSocial, complementado por EFD-Reinf, a partir do ano-calendário 2025; exige S-1.3 para os eventos S-1210/S-2501 desde 01/2025. O leiaute vigente e a aplicabilidade à fonte pagadora ainda exigem validação.",
  };
}
