import type { loadBiddingRegister } from "@/db/repositories/procurement/bidding-register";
import { biddingDateInPeriod } from "./bidding-reports";
import { BIDDING_STATUS, normalizeBiddingStatus } from "./bidding-workflow";

export const BIDDING_REGISTERS = { geral: "Relação de licitações", anuladas: "Licitações anuladas", agendadas: "Licitações agendadas", "sem-contrato": "Processos sem contrato", "sem-homologacao": "Processos sem homologação", homologadas: "Processos homologados", fornecedores: "Licitações por fornecedor", resumo: "Resumo por modalidade" } as const;
export type BiddingRegisterKind = keyof typeof BIDDING_REGISTERS;
export function isBiddingRegisterKind(value: string): value is BiddingRegisterKind { return Object.hasOwn(BIDDING_REGISTERS, value); }
export type BiddingRegisterRow = Awaited<ReturnType<typeof loadBiddingRegister>>[number];
export function filterBiddingRegister(rows: BiddingRegisterRow[], filters: { kind: BiddingRegisterKind; modality?: string; status?: string; start?: string; end?: string; q?: string; supplierId?: string }, now = new Date()) {
  return rows.filter(row => {
    if (filters.modality && row.modality !== filters.modality) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.q && ![row.number, row.process.number, row.process.object].join(" ").toLocaleLowerCase("pt-BR").includes(filters.q.toLocaleLowerCase("pt-BR"))) return false;
    if (filters.supplierId && !row.participants.some(participant => participant.supplierId === filters.supplierId)) return false;
    const status = normalizeBiddingStatus(row.status);
    if (filters.kind === "anuladas" && status !== BIDDING_STATUS.ANNULLED) return false;
    if (filters.kind === "agendadas" && (!row.sessionDate || row.sessionDate < now || ![BIDDING_STATUS.DRAFT, BIDDING_STATUS.PUBLISHED, BIDDING_STATUS.OPEN].some(value => value === status))) return false;
    if (filters.kind === "sem-contrato" && row.hasContract) return false;
    const homologated = Boolean(row.homologatedAt) || status === BIDDING_STATUS.HOMOLOGATED || status === BIDDING_STATUS.CONCLUDED;
    if (filters.kind === "sem-homologacao" && homologated) return false;
    if (filters.kind === "homologadas" && !homologated) return false;
    return biddingDateInPeriod(filters.kind === "homologadas" ? row.homologatedAt : filters.kind === "anuladas" ? row.annulledAt : filters.kind === "agendadas" ? row.sessionDate : row.createdAt, filters.start, filters.end);
  });
}
