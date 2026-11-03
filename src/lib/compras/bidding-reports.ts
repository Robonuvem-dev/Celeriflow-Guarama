import type { BiddingDetail } from "@/db/repositories/procurement/bidding";
import { BIDDING_BID_STATUS, BIDDING_ELIGIBILITY_STATUS } from "./bidding-workflow";

export const BIDDING_REPORTS = {
  resumo: "Quadro resumo / capa do processo",
  etiqueta: "Etiqueta do processo",
  classificacao: "Classificação inicial por lote",
  lances: "Lances por lote e fornecedor",
  "lances-resumidos": "Último lance por lote e fornecedor",
  apuracao: "Mapa de apuração / vencedores",
  habilitacao: "Situação dos fornecedores por lote",
  desclassificados: "Fornecedores inabilitados por lote",
  itens: "Itens dos lotes e valores estimados",
  fases: "Fases e datas do processo",
  atos: "Atos e pareceres do processo",
} as const;
export type BiddingReportKind = keyof typeof BIDDING_REPORTS;
export type BiddingReportTable = { columns: string[]; rows: string[][] };
export function isBiddingReportKind(value: string): value is BiddingReportKind {
  return Object.hasOwn(BIDDING_REPORTS, value);
}
export type BiddingReportFilters = { supplierId?: string; material?: string; start?: string; end?: string; order?: string };

// Dates in the database are instants; a reporting day is a civil day in Brazil.
const civilDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
export function biddingDateInPeriod(date: Date | null, start = "", end = "") {
  if (!start && !end) return true;
  if (!date) return false;
  const day = civilDate.format(date);
  return (!start || day >= start) && (!end || day <= end);
}
export function validateBiddingReportPeriod(start: string, end: string) {
  for (const day of [start, end]) {
    if (day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day)) return "Informe datas válidas.";
  }
  return start && end && start > end ? "A data inicial deve ser anterior ou igual à final." : null;
}
const dateFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
function date(value: Date | null) { return value ? dateFormat.format(value) : "Não informada"; }
function supplier(value: BiddingDetail["biddingParticipants"][number]) {
  return value.supplier.company?.corporateName || value.supplier.company?.tradeName || value.supplier.person?.fullName || value.displayCode || "Fornecedor sem identificação";
}
export function buildBiddingReport(bidding: BiddingDetail, kind: BiddingReportKind, filters: BiddingReportFilters = {}): BiddingReportTable {
  const acceptsSupplier = (participant: BiddingDetail["biddingParticipants"][number]) => !filters.supplierId || participant.supplierId === filters.supplierId;
  const lots = bidding.biddingLots.filter(lot => !filters.material || lot.items.some(item => [item.purchaseProcessItem.customName, item.purchaseProcessItem.catalogItem?.name, item.purchaseProcessItem.material?.name].join(" ").toLocaleLowerCase("pt-BR").includes(filters.material!.toLocaleLowerCase("pt-BR"))));
  const sort = (rows: string[][]) => filters.order === "fornecedor" ? rows.sort((a, b) => a[1].localeCompare(b[1], "pt-BR") || Number(a[0]) - Number(b[0])) : rows;
  switch (kind) {
    case "etiqueta":
    case "resumo": return { columns: ["Campo", "Informação"], rows: [
      ["Licitação", bidding.number], ["Processo", bidding.process.number], ["Modalidade", bidding.modality], ["Situação", bidding.status], ["Objeto", bidding.process.object],
      ["Secretaria", bidding.process.secretariat.name], ["Publicação", date(bidding.publicationDate)], ["Sessão / limite de lances", date(bidding.sessionDate)],
      ["Solicitação de despesa principal", bidding.process.purchaseRequest?.number ?? "Não vinculada"],
      ["Participantes", bidding.biddingParticipants.filter(acceptsSupplier).map(supplier).join("; ") || "Nenhum"],
    ] };
    case "classificacao":
    case "lances":
    case "lances-resumidos": {
      const rows = lots.flatMap(lot => {
        let bids = [...lot.bids].filter(bid => acceptsSupplier(bid.participant));
        if (kind !== "lances") {
          // Initial means the first accepted offer; summary means the latest accepted offer.
          bids = bids.filter(bid => bid.status === BIDDING_BID_STATUS.ACCEPTED).sort((a, b) => kind === "classificacao" ? a.sequence - b.sequence : b.sequence - a.sequence);
          const seen = new Set<string>();
          bids = bids.filter(bid => { if (seen.has(bid.participantId)) return false; seen.add(bid.participantId); return true; });
          if (kind === "classificacao") bids.sort((a, b) => a.totalValueDecimal.comparedTo(b.totalValueDecimal) || a.sequence - b.sequence);
        } else bids.sort((a, b) => a.sequence - b.sequence);
        return bids.filter(bid => biddingDateInPeriod(bid.submittedAt, filters.start, filters.end)).map(bid => [String(lot.number), supplier(bid.participant), String(bid.sequence), date(bid.submittedAt), bid.unitValueDecimal?.toFixed(2) ?? "Não informado", bid.totalValueDecimal.toFixed(2), bid.status]);
      });
      return { columns: ["Lote", "Fornecedor", "Sequência", "Data do lance", "Valor unitário (R$)", "Valor total (R$)", "Situação"], rows: sort(rows) };
    }
    case "apuracao": return { columns: ["Lote", "Fornecedor vencedor", "Situação", "Valor unitário (R$)", "Valor total (R$)", "Data da decisão"], rows: sort(lots.flatMap(lot => lot.results.filter(result => result.isCurrent && acceptsSupplier(result.participant) && biddingDateInPeriod(result.decidedAt, filters.start, filters.end)).map(result => [String(lot.number), supplier(result.participant), result.status, result.unitValueDecimal?.toFixed(2) ?? "Não informado", result.totalValueDecimal.toFixed(2), date(result.decidedAt)]))) };
    case "habilitacao":
    case "desclassificados": return { columns: ["Lote", "Fornecedor", "Situação", "Motivo", "Data da decisão"], rows: sort(lots.flatMap(lot => bidding.biddingParticipants.filter(acceptsSupplier).flatMap(participant => {
      const latest = lot.eligibilityDecisions.filter(decision => decision.participantId === participant.id).sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))[0];
      if (kind === "desclassificados" && latest?.status !== BIDDING_ELIGIBILITY_STATUS.INELIGIBLE) return [];
      if ((filters.start || filters.end) && !biddingDateInPeriod(latest?.decidedAt ?? null, filters.start, filters.end)) return [];
      return [[String(lot.number), supplier(participant), latest?.status ?? "Não decidida", latest?.reason ?? "", date(latest?.decidedAt ?? null)]];
    }))) };
    case "itens": return { columns: ["Lote", "Item", "Unidade", "Quantidade", "Valor estimado unitário (R$)"], rows: lots.flatMap(lot => lot.items.map(item => [String(lot.number), item.purchaseProcessItem.catalogItem?.name || item.purchaseProcessItem.material?.name || item.purchaseProcessItem.customName || item.purchaseProcessItemId, item.purchaseProcessItem.catalogItem?.unit || item.purchaseProcessItem.material?.unitOfMeasure || "Não informada", String(item.quantity), item.purchaseProcessItem.estimatedUnitValue?.toFixed(2) ?? "Não informado"])) };
    case "fases": return { columns: ["Ordem", "Fase", "Situação", "Início", "Conclusão"], rows: [...bidding.biddingPhases].sort((a, b) => a.sequence - b.sequence).filter(phase => biddingDateInPeriod(phase.startedAt, filters.start, filters.end)).map(phase => [String(phase.sequence), phase.name, phase.status, date(phase.startedAt), date(phase.completedAt)]) };
    case "atos": return { columns: ["Data", "Tipo", "Descrição / parecer", "Responsável", "Fase", "Lote"], rows: bidding.biddingActs.filter(act => biddingDateInPeriod(act.occurredAt, filters.start, filters.end)).map(act => [date(act.occurredAt), act.type, act.description ?? "", act.actorUsuario.nome, act.phase?.name ?? "", act.biddingLot ? String(act.biddingLot.number) : ""]) };
  }
}

export function biddingReportCsv(table: BiddingReportTable) {
  // Prevent spreadsheet formulas, including those preceded by whitespace.
  const cell = (value: string) => `"${(/^[\s]*[=+\-@]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
  return "\uFEFF" + [table.columns, ...table.rows].map(row => row.map(cell).join(";")).join("\r\n");
}
