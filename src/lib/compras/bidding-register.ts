import { exportSimpleTable } from "@/lib/reports/simple-tabular-export";
import type { BiddingRegisterSummaryItem } from "@/db/repositories/procurement/bidding-register";
import { formatBrasiliaDate, formatBrasiliaDateTime } from "@/lib/brasilia-datetime";

export function biddingRegisterSummaryCsv(items: BiddingRegisterSummaryItem[]): string {
  const escapeCell = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const lines: string[] = [];
  lines.push(`${escapeCell("RELATÓRIO CONSOLIDADO DE PROCESSOS LICITATÓRIOS")}`);
  lines.push(`${escapeCell("Gerado em (Brasília)")};${escapeCell(formatBrasiliaDateTime(new Date()))}`);
  lines.push("");

  const columns = [
    "Certame",
    "Processo",
    "Modalidade",
    "Situação",
    "Secretaria",
    "Objeto",
    "Publicação",
    "Sessão de Lances",
    "Valor Estimado (R$)",
    "Qtd. Lotes",
    "Qtd. Itens",
    "Qtd. Participantes",
  ];

  lines.push(columns.map(escapeCell).join(";"));

  for (const item of items) {
    const row = [
      item.number,
      item.processNumber,
      item.modality,
      item.status,
      item.secretariatName,
      item.object,
      item.publicationDate ? formatBrasiliaDate(item.publicationDate) : "-",
      item.sessionDate ? formatBrasiliaDateTime(item.sessionDate) : "-",
      item.estimatedValue.toFixed(2).replace(".", ","),
      item.lotCount,
      item.itemCount,
      item.participantCount,
    ];
    lines.push(row.map(escapeCell).join(";"));
  }

  return lines.join("\r\n");
}
