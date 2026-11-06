import type { BiddingReportData, BiddingReportLot } from "@/db/repositories/procurement/bidding-reports";
import { formatBrasiliaDate, formatBrasiliaDateTime, parseBrasiliaDate } from "@/lib/brasilia-datetime";

export const BIDDING_REPORT_TYPES = {
  // 11.1 a 11.8 (Requisitos CF11)
  CLASSIFICACAO: "classificacao", // 11.1: Classificação inicial dos processos de lote
  LANCES_VERBAIS: "lances-verbais", // 11.2: Lances verbais / abertos dos processos de lote
  VENCEDORES: "vencedores", // 11.3: Relação dos lances vencedores dos processos de lote
  APURACAO: "apuracao", // 11.4: Mapa de apuração dos processos de lote
  ITENS_PREGAO: "itens-pregao", // 11.5: Valores dos itens dos processos de lote de pregão
  ITENS_OUTRAS_MODALIDADES: "itens-outras-modalidades", // 11.6: Valores dos itens dos processos de lote de outras modalidades
  ETIQUETA: "etiqueta", // 11.7: Etiqueta dos processos licitatórios
  SALDO_RESTANTE: "saldo-restante", // 11.8: Saldo restante dos processos licitatórios em geral
  // Outros relatórios do certame
  RESUMO: "resumo",
  LANCES: "lances",
  HABILITACAO: "habilitacao",
  DESCLASSIFICADOS: "desclassificados",
  FASES: "fases",
  ATOS: "atos",
} as const;

export type BiddingReportType = (typeof BIDDING_REPORT_TYPES)[keyof typeof BIDDING_REPORT_TYPES];

export const BIDDING_REPORT_LABELS: Record<BiddingReportType, string> = {
  [BIDDING_REPORT_TYPES.CLASSIFICACAO]: "11.1 - Classificação inicial dos processos de lote",
  [BIDDING_REPORT_TYPES.LANCES_VERBAIS]: "11.2 - Lances verbais / abertos dos processos de lote",
  [BIDDING_REPORT_TYPES.VENCEDORES]: "11.3 - Relação dos lances vencedores dos processos de lote",
  [BIDDING_REPORT_TYPES.APURACAO]: "11.4 - Mapa de apuração dos processos de lote",
  [BIDDING_REPORT_TYPES.ITENS_PREGAO]: "11.5 - Valores dos itens dos processos de lote de pregão",
  [BIDDING_REPORT_TYPES.ITENS_OUTRAS_MODALIDADES]: "11.6 - Valores dos itens dos processos de lote de outras modalidades",
  [BIDDING_REPORT_TYPES.ETIQUETA]: "11.7 - Etiqueta dos processos licitatórios",
  [BIDDING_REPORT_TYPES.SALDO_RESTANTE]: "11.8 - Saldo restante dos processos licitatórios em geral",
  [BIDDING_REPORT_TYPES.RESUMO]: "Resumo consolidado do certame",
  [BIDDING_REPORT_TYPES.LANCES]: "Histórico completo de lances",
  [BIDDING_REPORT_TYPES.HABILITACAO]: "Habilitação e julgamento documental",
  [BIDDING_REPORT_TYPES.DESCLASSIFICADOS]: "Participantes e propostas desclassificadas",
  [BIDDING_REPORT_TYPES.FASES]: "Evolução e histórico das fases",
  [BIDDING_REPORT_TYPES.ATOS]: "Atos administrativos registrados",
};

export type BiddingReportFilters = {
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  fornecedor?: string;
  material?: string;
  ordem?: "asc" | "desc";
};

export type ReportTable = {
  title: string;
  description?: string;
  columns: string[];
  rows: (string | number)[][];
};

export type GeneratedBiddingReport = {
  type: BiddingReportType;
  title: string;
  biddingNumber: string;
  processNumber: string;
  modality: string;
  secretariat: string;
  object: string;
  generatedAt: string;
  tables: ReportTable[];
  metadata?: Record<string, string | number>;
};

function money(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === "") return "R$ 0,00";
  const num = typeof val === "string" ? Number(val) : val;
  if (Number.isNaN(num)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

function supplierDisplayName(supplier: {
  company: { corporateName: string; tradeName: string | null } | null;
  person: { fullName: string } | null;
}): string {
  return supplier.company?.tradeName || supplier.company?.corporateName || supplier.person?.fullName || "Não informado";
}

function isDateInRange(
  dateValue: Date | string | null | undefined,
  startDateStr?: string,
  endDateStr?: string,
): boolean {
  if (!dateValue) return true;
  const d = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  if (Number.isNaN(d.getTime())) return true;

  if (startDateStr) {
    const start = parseBrasiliaDate(startDateStr);
    if (start && d.getTime() < start.getTime()) return false;
  }
  if (endDateStr) {
    const end = parseBrasiliaDate(endDateStr, true);
    if (end && d.getTime() > end.getTime()) return false;
  }
  return true;
}

// 11.1: Classificação inicial dos processos de lote
export function generateClassificacaoReport(data: BiddingReportData, filters?: BiddingReportFilters): ReportTable[] {
  const tables: ReportTable[] = [];

  for (const lot of data.biddingLots) {
    // Propostas iniciais / primeiros lances de cada participante no lote
    const initialBidsByParticipant = new Map<string, typeof lot.bids[0]>();
    // Sort bids asc by sequence or date to get initial proposal
    const sortedBids = [...lot.bids].sort((a, b) => a.sequence - b.sequence);
    for (const bid of sortedBids) {
      if (!initialBidsByParticipant.has(bid.participantId)) {
        initialBidsByParticipant.set(bid.participantId, bid);
      }
    }

    let rows: (string | number)[][] = [];

    // Filter participants
    for (const participant of data.biddingParticipants) {
      const sName = supplierDisplayName(participant.supplier);
      if (filters?.fornecedor && !sName.toLowerCase().includes(filters.fornecedor.toLowerCase())) {
        continue;
      }

      const initialBid = initialBidsByParticipant.get(participant.id);
      if (initialBid && !isDateInRange(initialBid.submittedAt, filters?.startDate, filters?.endDate)) {
        continue;
      }

      const val = initialBid ? Number(initialBid.totalValueDecimal) : null;
      rows.push([
        participant.displayCode || "-",
        sName,
        participant.status,
        val !== null ? money(val) : "Sem proposta inicial",
        initialBid?.submittedAt ? formatBrasiliaDateTime(initialBid.submittedAt) : "-",
        initialBid?.status || "-",
      ]);
    }

    // Ordenar por valor da proposta
    rows.sort((a, b) => {
      const valA = parseFloat(String(a[3]).replace(/[^0-9,-]/g, "").replace(",", ".")) || 999999999;
      const valB = parseFloat(String(b[3]).replace(/[^0-9,-]/g, "").replace(",", ".")) || 999999999;
      return filters?.ordem === "desc" ? valB - valA : valA - valB;
    });

    // Add rank
    rows = rows.map((row, idx) => [`${idx + 1}º`, ...row]);

    tables.push({
      title: `Lote ${lot.number}: ${lot.description || "Sem descrição"} (${lot.status})`,
      description: `Valor estimado: ${money(lot.estimatedValueDecimal?.toString())}`,
      columns: ["Classificação", "Código", "Fornecedor", "Situação Participante", "Valor Proposta Inicial", "Data Envio", "Status Proposta"],
      rows,
    });
  }

  return tables;
}

// 11.2: Lances verbais / lances presenciais e abertos dos processos de lote
export function generateLancesVerbaisReport(data: BiddingReportData, filters?: BiddingReportFilters): ReportTable[] {
  const tables: ReportTable[] = [];

  for (const lot of data.biddingLots) {
    let bids = [...lot.bids].filter((bid) => {
      const sName = supplierDisplayName(bid.participant.supplier);
      if (filters?.fornecedor && !sName.toLowerCase().includes(filters.fornecedor.toLowerCase())) {
        return false;
      }
      if (!isDateInRange(bid.submittedAt, filters?.startDate, filters?.endDate)) {
        return false;
      }
      return true;
    });

    bids.sort((a, b) => (filters?.ordem === "asc" ? a.sequence - b.sequence : b.sequence - a.sequence));

    const rows = bids.map((b) => [
      b.sequence,
      b.participant.displayCode || "-",
      supplierDisplayName(b.participant.supplier),
      b.kind || "Lance",
      money(b.totalValueDecimal.toString()),
      b.unitValueDecimal ? money(b.unitValueDecimal.toString()) : "-",
      formatBrasiliaDateTime(b.submittedAt),
      b.status,
    ]);

    tables.push({
      title: `Lote ${lot.number}: ${lot.description || "Sem descrição"}`,
      description: `Total de lances registrados no lote: ${bids.length}`,
      columns: ["Seq", "Código", "Fornecedor", "Tipo", "Valor Total", "Valor Unitário", "Data/Hora Envio (Brasília)", "Situação"],
      rows,
    });
  }

  return tables;
}

// 11.3: Relação dos lances vencedores dos processos de lote
export function generateVencedoresReport(data: BiddingReportData, filters?: BiddingReportFilters): ReportTable[] {
  const rows: (string | number)[][] = [];

  for (const lot of data.biddingLots) {
    const result = lot.results[0];
    if (!result) continue;

    const sName = supplierDisplayName(result.participant.supplier);
    if (filters?.fornecedor && !sName.toLowerCase().includes(filters.fornecedor.toLowerCase())) {
      continue;
    }
    if (!isDateInRange(result.decidedAt, filters?.startDate, filters?.endDate)) {
      continue;
    }

    const estimated = Number(lot.estimatedValueDecimal ?? 0);
    const winning = Number(result.totalValueDecimal);
    const economy = estimated > 0 ? estimated - winning : 0;
    const economyPct = estimated > 0 ? (economy / estimated) * 100 : 0;

    rows.push([
      lot.number,
      lot.description || "Sem descrição",
      result.participant.displayCode || "-",
      sName,
      money(estimated),
      money(winning),
      `${money(economy)} (${economyPct.toFixed(2)}%)`,
      result.status,
      formatBrasiliaDateTime(result.decidedAt),
    ]);
  }

  rows.sort((a, b) => {
    return filters?.ordem === "desc" ? Number(b[0]) - Number(a[0]) : Number(a[0]) - Number(b[0]);
  });

  return [
    {
      title: "Relação de Lotes Arrematados / Homologados e Vencedores",
      columns: [
        "Lote",
        "Descrição",
        "Código",
        "Fornecedor Vencedor",
        "Valor Estimado",
        "Valor Arrematado",
        "Economia Gerada",
        "Situação do Resultado",
        "Data de Adjudicação (Brasília)",
      ],
      rows,
    },
  ];
}

// 11.4: Mapa de apuração dos processos de lote
export function generateApuracaoReport(data: BiddingReportData, filters?: BiddingReportFilters): ReportTable[] {
  const tables: ReportTable[] = [];

  for (const lot of data.biddingLots) {
    // Mapa: para cada participante do lote, trazer sua menor proposta aceita, status de habilitação e resultado final
    const rows: (string | number)[][] = [];

    const latestEligibility = new Map<string, typeof lot.eligibilityDecisions[0]>();
    for (const ed of lot.eligibilityDecisions) {
      if (!latestEligibility.has(ed.participantId)) {
        latestEligibility.set(ed.participantId, ed);
      }
    }

    for (const participant of data.biddingParticipants) {
      const sName = supplierDisplayName(participant.supplier);
      if (filters?.fornecedor && !sName.toLowerCase().includes(filters.fornecedor.toLowerCase())) {
        continue;
      }

      // menor lance
      const participantBids = lot.bids.filter((b) => b.participantId === participant.id && b.status === "Aceito");
      const bestBid = participantBids.sort((a, b) => Number(a.totalValueDecimal) - Number(b.totalValueDecimal))[0];
      const initialBid = lot.bids
        .filter((b) => b.participantId === participant.id)
        .sort((a, b) => a.sequence - b.sequence)[0];

      if (filters?.startDate || filters?.endDate) {
        const refDate = bestBid?.submittedAt || participant.registeredAt;
        if (!isDateInRange(refDate, filters?.startDate, filters?.endDate)) {
          continue;
        }
      }

      const eligibility = latestEligibility.get(participant.id);
      const isWinner = lot.results.some((r) => r.participantId === participant.id);

      rows.push([
        participant.displayCode || "-",
        sName,
        initialBid ? money(initialBid.totalValueDecimal.toString()) : "Sem proposta",
        bestBid ? money(bestBid.totalValueDecimal.toString()) : "Sem lance",
        eligibility?.status || "Pendente",
        isWinner ? "VENCEDOR" : "Classificado",
        eligibility?.reason || "-",
      ]);
    }

    // Ordenar pelo melhor lance
    rows.sort((a, b) => {
      const valA = parseFloat(String(a[3]).replace(/[^0-9,-]/g, "").replace(",", ".")) || 999999999;
      const valB = parseFloat(String(b[3]).replace(/[^0-9,-]/g, "").replace(",", ".")) || 999999999;
      return filters?.ordem === "desc" ? valB - valA : valA - valB;
    });

    tables.push({
      title: `Apuração do Lote ${lot.number}: ${lot.description || "Sem descrição"}`,
      description: `Situação do Lote: ${lot.status} · Estimativa: ${money(lot.estimatedValueDecimal?.toString())}`,
      columns: [
        "Código",
        "Fornecedor",
        "Proposta Inicial",
        "Melhor Lance",
        "Habilitação",
        "Resultado Apurado",
        "Justificativa / Motivo",
      ],
      rows,
    });
  }

  return tables;
}

// 11.5: Valores dos itens dos processos de lote de pregão
export function generateItensPregaoReport(data: BiddingReportData, filters?: BiddingReportFilters): ReportTable[] {
  const rows: (string | number)[][] = [];

  for (const lot of data.biddingLots) {
    const winnerResult = lot.results[0];
    const winnerName = winnerResult ? supplierDisplayName(winnerResult.participant.supplier) : "Em disputa";

    for (const lotItem of lot.items) {
      const pi = lotItem.purchaseProcessItem;
      const itemName = pi.catalogItem?.name || pi.material?.name || pi.customName || "Item";
      const itemCode = pi.catalogItem?.code || "-";
      const unit = pi.catalogItem?.unit || pi.material?.unitOfMeasure || "UN";

      if (filters?.material && !itemName.toLowerCase().includes(filters.material.toLowerCase())) {
        continue;
      }
      if (filters?.fornecedor && winnerResult && !winnerName.toLowerCase().includes(filters.fornecedor.toLowerCase())) {
        continue;
      }

      const qty = lotItem.quantity;
      const estUnit = pi.estimatedUnitValue ?? 0;
      const estTotal = qty * estUnit;
      const arrematadoTotal = winnerResult ? Number(winnerResult.totalValueDecimal) : 0;
      const arrematadoUnit = winnerResult && qty > 0 ? (arrematadoTotal / qty) : 0;

      rows.push([
        lot.number,
        itemCode,
        itemName,
        unit,
        qty,
        money(estUnit),
        money(estTotal),
        winnerResult ? money(arrematadoUnit) : "-",
        winnerResult ? money(arrematadoTotal) : "-",
        winnerName,
      ]);
    }
  }

  return [
    {
      title: `Demonstrativo de Itens por Lote - Pregão (${data.modality})`,
      description: `Certame: ${data.number} · Processo: ${data.process.number}`,
      columns: [
        "Lote",
        "Código Item",
        "Especificação / Material",
        "Unidade",
        "Quantidade",
        "Vl. Unit. Estimado",
        "Vl. Total Estimado",
        "Vl. Unit. Final",
        "Vl. Total Final",
        "Fornecedor Homologado",
      ],
      rows,
    },
  ];
}

// 11.6: Valores dos itens dos processos de lote de outras modalidades
export function generateItensOutrasModalidadesReport(data: BiddingReportData, filters?: BiddingReportFilters): ReportTable[] {
  const rows: (string | number)[][] = [];

  for (const lot of data.biddingLots) {
    const winnerResult = lot.results[0];
    const winnerName = winnerResult ? supplierDisplayName(winnerResult.participant.supplier) : "Pendente";

    for (const lotItem of lot.items) {
      const pi = lotItem.purchaseProcessItem;
      const itemName = pi.catalogItem?.name || pi.material?.name || pi.customName || "Item";
      const unit = pi.catalogItem?.unit || pi.material?.unitOfMeasure || "UN";

      if (filters?.material && !itemName.toLowerCase().includes(filters.material.toLowerCase())) {
        continue;
      }
      if (filters?.fornecedor && winnerResult && !winnerName.toLowerCase().includes(filters.fornecedor.toLowerCase())) {
        continue;
      }

      const qty = lotItem.quantity;
      const estUnit = pi.estimatedUnitValue ?? 0;
      const estTotal = qty * estUnit;
      const arrematadoTotal = winnerResult ? Number(winnerResult.totalValueDecimal) : 0;

      rows.push([
        data.modality,
        lot.number,
        itemName,
        unit,
        qty,
        money(estUnit),
        money(estTotal),
        winnerResult ? money(arrematadoTotal) : "-",
        winnerName,
        lot.status,
      ]);
    }
  }

  return [
    {
      title: `Demonstrativo de Itens - Modalidades Gerais (${data.modality})`,
      columns: [
        "Modalidade",
        "Lote",
        "Descrição do Item",
        "Unidade",
        "Quantidade",
        "Preço de Referência Unitário",
        "Preço de Referência Total",
        "Valor Homologado",
        "Adjudicatário",
        "Situação do Lote",
      ],
      rows,
    },
  ];
}

// 11.7: Etiqueta dos processos licitatórios
export function generateEtiquetaReport(data: BiddingReportData): ReportTable[] {
  return [
    {
      title: "Etiqueta e Identificação Cadastral do Processo Licitatório",
      description: "Documento oficial de autuação e identificação de capa dos autos da licitação",
      columns: ["Campo", "Valor"],
      rows: [
        ["Número da Licitação", data.number],
        ["Número do Processo de Compra", data.process.number],
        ["Modalidade da Licitação", data.modality],
        ["Situação Atual", data.status],
        ["Secretaria Requisitante", data.process.secretariat.name],
        ["Objeto da Licitação", data.process.object],
        ["Data de Publicação", data.publicationDate ? formatBrasiliaDate(data.publicationDate) : "Não publicada"],
        ["Data e Hora da Sessão de Abertura", data.sessionDate ? formatBrasiliaDateTime(data.sessionDate) : "Não informada"],
        ["Total de Lotes Cadastrados", data.biddingLots.length],
        ["Total de Participantes Inscritos", data.biddingParticipants.length],
        ["Valor Total Estimado do Processo", money(data.process.estimatedValue ?? 0)],
        [
          "Comissão / Agente de Contratação",
          data.biddingAppointmentAssignments
            .map((a) => `${a.appointment.name} (${a.appointment.kind})`)
            .join("; ") || "Não atribuído",
        ],
      ],
    },
  ];
}

// 11.8: Saldo restante dos processos licitatórios em geral
export function generateSaldoRestanteReport(data: BiddingReportData, filters?: BiddingReportFilters): ReportTable[] {
  const rows: (string | number)[][] = [];

  for (const item of data.process.items) {
    const itemName = item.catalogItem?.name || item.material?.name || item.customName || "Item";
    const itemCode = item.catalogItem?.code || "-";
    const unit = item.catalogItem?.unit || item.material?.unitOfMeasure || "UN";

    if (filters?.material && !itemName.toLowerCase().includes(filters.material.toLowerCase())) {
      continue;
    }

    const licitadoQty = item.quantity;
    const consumidoQty = item.consumedQuantity ?? 0;
    const saldoQty = Math.max(0, licitadoQty - consumidoQty);
    const unitVal = item.estimatedUnitValue ?? 0;
    const saldoVal = saldoQty * unitVal;
    const pctSaldo = licitadoQty > 0 ? (saldoQty / licitadoQty) * 100 : 0;

    rows.push([
      itemCode,
      itemName,
      unit,
      licitadoQty,
      consumidoQty,
      saldoQty,
      `${pctSaldo.toFixed(1)}%`,
      money(unitVal),
      money(saldoVal),
    ]);
  }

  return [
    {
      title: "Demonstrativo de Saldos Restantes dos Itens do Processo Licitatório",
      description: `Certame: ${data.number} · Processo: ${data.process.number} · Consumos baseados em Recebimentos Fiscais (AF/Recebimento)`,
      columns: [
        "Código",
        "Especificação do Item",
        "Unidade",
        "Qtd. Homologada",
        "Qtd. Consumida",
        "Saldo Restante (Qtd)",
        "% Saldo",
        "Valor Unitário Base",
        "Valor Total do Saldo",
      ],
      rows,
    },
  ];
}

// Relatórios auxiliares adicionais
export function generateResumoReport(data: BiddingReportData): ReportTable[] {
  const lotRows = data.biddingLots.map((lot) => {
    const result = lot.results[0];
    return [
      lot.number,
      lot.description || "-",
      lot.status,
      money(lot.estimatedValueDecimal?.toString()),
      result ? money(result.totalValueDecimal.toString()) : "-",
      result ? supplierDisplayName(result.participant.supplier) : "Sem vencedor",
      lot.bids.length,
    ];
  });

  return [
    {
      title: "Quadro Geral de Lotes e Resultados",
      columns: ["Lote", "Descrição", "Situação", "Valor Estimado", "Valor Arrematado", "Fornecedor Vencedor", "Qtd Lances"],
      rows: lotRows,
    },
  ];
}

export function generateLancesReport(data: BiddingReportData, filters?: BiddingReportFilters): ReportTable[] {
  return generateLancesVerbaisReport(data, filters);
}

export function generateHabilitacaoReport(data: BiddingReportData, filters?: BiddingReportFilters): ReportTable[] {
  const rows: (string | number)[][] = [];

  for (const lot of data.biddingLots) {
    for (const ed of lot.eligibilityDecisions) {
      const participant = data.biddingParticipants.find((p) => p.id === ed.participantId);
      if (!participant) continue;
      const sName = supplierDisplayName(participant.supplier);

      if (filters?.fornecedor && !sName.toLowerCase().includes(filters.fornecedor.toLowerCase())) {
        continue;
      }
      if (!isDateInRange(ed.decidedAt, filters?.startDate, filters?.endDate)) {
        continue;
      }

      rows.push([
        lot.number,
        participant.displayCode || "-",
        sName,
        ed.status,
        ed.reason || "-",
        formatBrasiliaDateTime(ed.decidedAt),
      ]);
    }
  }

  return [
    {
      title: "Julgamento da Habilitação Documental por Lote",
      columns: ["Lote", "Código", "Fornecedor", "Situação Documental", "Motivo / Fundamentação", "Data Decisão (Brasília)"],
      rows,
    },
  ];
}

export function generateDesclassificadosReport(data: BiddingReportData, filters?: BiddingReportFilters): ReportTable[] {
  const rows: (string | number)[][] = [];

  for (const lot of data.biddingLots) {
    // Inabilitados
    for (const ed of lot.eligibilityDecisions) {
      if (ed.status === "Inabilitado") {
        const p = data.biddingParticipants.find((x) => x.id === ed.participantId);
        if (!p) continue;
        const sName = supplierDisplayName(p.supplier);
        if (filters?.fornecedor && !sName.toLowerCase().includes(filters.fornecedor.toLowerCase())) continue;

        rows.push([
          lot.number,
          p.displayCode || "-",
          sName,
          "Inabilitação Documental",
          ed.reason || "Não atendeu às exigências do edital",
          formatBrasiliaDateTime(ed.decidedAt),
        ]);
      }
    }
    // Lances cancelados ou recusados
    for (const bid of lot.bids) {
      if (bid.status !== "Aceito") {
        const sName = supplierDisplayName(bid.participant.supplier);
        if (filters?.fornecedor && !sName.toLowerCase().includes(filters.fornecedor.toLowerCase())) continue;

        rows.push([
          lot.number,
          bid.participant.displayCode || "-",
          sName,
          `Lance Recusado (${bid.sequence}º)`,
          money(bid.totalValueDecimal.toString()),
          formatBrasiliaDateTime(bid.submittedAt),
        ]);
      }
    }
  }

  return [
    {
      title: "Relação de Propostas e Fornecedores Desclassificados / Inabilitados",
      columns: ["Lote", "Código", "Fornecedor", "Tipo de Desclassificação", "Fundamentação / Valor", "Data (Brasília)"],
      rows,
    },
  ];
}

export function generateFasesReport(data: BiddingReportData): ReportTable[] {
  const rows = data.biddingPhases.map((phase) => [
    phase.sequence,
    phase.name,
    phase.status,
    phase.isCurrent ? "Sim" : "Não",
    phase.startedAt ? formatBrasiliaDateTime(phase.startedAt) : "-",
    phase.completedAt ? formatBrasiliaDateTime(phase.completedAt) : "-",
  ]);

  return [
    {
      title: "Histórico e Cronograma de Fases do Certame",
      columns: ["Seq", "Fase", "Situação", "Fase Atual", "Início (Brasília)", "Conclusão (Brasília)"],
      rows,
    },
  ];
}

export function generateAtosReport(data: BiddingReportData): ReportTable[] {
  const rows = data.biddingActs.map((act) => [
    formatBrasiliaDateTime(act.occurredAt),
    act.type,
    act.biddingLot?.number ? `Lote ${act.biddingLot.number}` : "Processo Geral",
    act.phase?.name || "-",
    act.actorUsuario.nome,
    act.description || "-",
  ]);

  return [
    {
      title: "Livro de Atos Administrativos Registrados (Integral)",
      columns: ["Data/Hora (Brasília)", "Tipo de Ato", "Lote Vinculado", "Fase", "Usuário Responsável", "Descrição"],
      rows,
    },
  ];
}

export function generateBiddingReport(
  type: BiddingReportType,
  data: BiddingReportData,
  filters?: BiddingReportFilters,
): GeneratedBiddingReport {
  let tables: ReportTable[] = [];

  switch (type) {
    case BIDDING_REPORT_TYPES.CLASSIFICACAO:
      tables = generateClassificacaoReport(data, filters);
      break;
    case BIDDING_REPORT_TYPES.LANCES_VERBAIS:
      tables = generateLancesVerbaisReport(data, filters);
      break;
    case BIDDING_REPORT_TYPES.VENCEDORES:
      tables = generateVencedoresReport(data, filters);
      break;
    case BIDDING_REPORT_TYPES.APURACAO:
      tables = generateApuracaoReport(data, filters);
      break;
    case BIDDING_REPORT_TYPES.ITENS_PREGAO:
      tables = generateItensPregaoReport(data, filters);
      break;
    case BIDDING_REPORT_TYPES.ITENS_OUTRAS_MODALIDADES:
      tables = generateItensOutrasModalidadesReport(data, filters);
      break;
    case BIDDING_REPORT_TYPES.ETIQUETA:
      tables = generateEtiquetaReport(data);
      break;
    case BIDDING_REPORT_TYPES.SALDO_RESTANTE:
      tables = generateSaldoRestanteReport(data, filters);
      break;
    case BIDDING_REPORT_TYPES.RESUMO:
      tables = generateResumoReport(data);
      break;
    case BIDDING_REPORT_TYPES.LANCES:
      tables = generateLancesReport(data, filters);
      break;
    case BIDDING_REPORT_TYPES.HABILITACAO:
      tables = generateHabilitacaoReport(data, filters);
      break;
    case BIDDING_REPORT_TYPES.DESCLASSIFICADOS:
      tables = generateDesclassificadosReport(data, filters);
      break;
    case BIDDING_REPORT_TYPES.FASES:
      tables = generateFasesReport(data);
      break;
    case BIDDING_REPORT_TYPES.ATOS:
      tables = generateAtosReport(data);
      break;
    default:
      tables = generateResumoReport(data);
  }

  return {
    type,
    title: BIDDING_REPORT_LABELS[type] || "Relatório de Licitação",
    biddingNumber: data.number,
    processNumber: data.process.number,
    modality: data.modality,
    secretariat: data.process.secretariat.name,
    object: data.process.object,
    generatedAt: formatBrasiliaDateTime(new Date()),
    tables,
  };
}

export function biddingReportCsv(report: GeneratedBiddingReport): string {
  const lines: string[] = [];
  const escapeCell = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  // Header metadata
  lines.push(`${escapeCell("RELATÓRIO DE LICITAÇÃO - CELERIFLOW")}`);
  lines.push(`${escapeCell(report.title)}`);
  lines.push(`${escapeCell("Certame")};${escapeCell(report.biddingNumber)};${escapeCell("Processo")};${escapeCell(report.processNumber)}`);
  lines.push(`${escapeCell("Modalidade")};${escapeCell(report.modality)};${escapeCell("Secretaria")};${escapeCell(report.secretariat)}`);
  lines.push(`${escapeCell("Objeto")};${escapeCell(report.object)}`);
  lines.push(`${escapeCell("Gerado em (Brasília)")};${escapeCell(report.generatedAt)}`);
  lines.push("");

  for (const table of report.tables) {
    if (table.title) lines.push(escapeCell(table.title));
    if (table.description) lines.push(escapeCell(table.description));
    lines.push(table.columns.map(escapeCell).join(";"));
    for (const row of table.rows) {
      lines.push(row.map(escapeCell).join(";"));
    }
    lines.push("");
  }

  return lines.join("\r\n");
}
