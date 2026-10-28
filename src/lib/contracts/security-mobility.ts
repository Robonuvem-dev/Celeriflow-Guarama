import type { Decimal } from "@/db/decimal";

type SecurityRecord = { id: string; tipo: string; status: string; isActive: boolean; createdAt: Date; updatedAt: Date };
export type SecurityGuard = SecurityRecord & { matricula: string; nome: string; equipe: string | null; employeeId: string | null };
export type SecurityOccurrence = SecurityRecord & { numero: string; descricao: string; local: string | null; bairro: string | null; prioridade: string; responsavelGuardaId: string | null };
export type SecurityInfraction = SecurityRecord & { auto: string; data: Date; placa: string; local: string; valor: number | null };
export type MobilityRecord = SecurityRecord & { codigo: string; categoria: string; titulo: string; descricao: string | null; local: string | null; bairro: string | null; responsavel: string | null; prioridade: string; dataInicio: Date; dataFim: Date | null; valor: number | null; placa: string | null; relatedModule: string | null; relatedId: string | null; assetId: string | null; obrasServicoId: string | null; documentId: string | null };
export type TrafficInfractionTicket = { id: string; numeroAit: string; placaVeiculo: string; chassi: string | null; codigoCtb: string; descricaoInfracao: string; valorMulta: Decimal; geolocalizacao: string; agenteMatricula: string; status: string; qrCodePix: string | null; createdAt: Date };
