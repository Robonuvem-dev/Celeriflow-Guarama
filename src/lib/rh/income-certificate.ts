import { PERSONNEL_ISSUER } from "./personnel-presentation";

type IncomeReport = { title: string; headers: string[]; rows: string[][] };

/** Individual document layout shared by RH and the employee-owned Portal. */
export function annualIncomeCertificate(report: IncomeReport): IncomeReport {
  if (report.rows.length !== 1) throw new Error("Comprovante de rendimentos indisponível para o ano selecionado.");
  const row = report.rows[0], year = Number(row[0]);
  return { title: report.title, headers: ["Campo", "Informação"], rows: [
    ["Fonte pagadora", PERSONNEL_ISSUER], ["Ano-calendário", String(year)], ["Exercício", String(year + 1)],
    ["Beneficiário", row[2]], ["CPF", row[1]], ["Natureza dos rendimentos", "Rendimentos do trabalho assalariado"],
    ["Total dos rendimentos tributáveis (inclusive férias)", row[3]],
    ["Contribuição previdenciária oficial — rendimentos regulares", row[14]],
    ["Imposto de renda retido — rendimentos regulares", row[15]],
    ["Décimo terceiro salário — bruto", row[4]], ["Previdência sobre o décimo terceiro", row[11]],
    ["Imposto de renda exclusivo sobre o décimo terceiro", row[12]], ["Décimo terceiro salário — líquido", row[13]],
    ["Rendimentos recebidos acumuladamente", row[5]], ["Meses abrangidos", row[16]], ["Moeda", "Real (BRL)"],
  ] };
}
