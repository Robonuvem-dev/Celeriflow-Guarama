import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import type { SecurityGuard as SegurancaGuarda, SecurityInfraction as SegurancaInfracao, MobilityRecord as SegurancaMobilidadeRegistro, SecurityOccurrence as SegurancaOcorrencia } from "@/lib/contracts/security-mobility";
import { db } from "@/db/client";
import { listMobilityRecords } from "@/db/repositories/security-mobility/queries";
import type { SegMobItem } from "./types";

export function mapGuarda(item: SegurancaGuarda): SegMobItem {
  return {
    id: item.id,
    kind: "guarda",
    code: item.matricula,
    title: item.nome,
    type: item.tipo,
    status: item.status,
    isActive: item.isActive,
    location: item.equipe,
    date: item.createdAt,
  };
}

export function mapOcorrencia(item: SegurancaOcorrencia): SegMobItem {
  return {
    id: item.id,
    kind: "ocorrencia",
    code: item.numero,
    title: item.descricao,
    type: item.tipo,
    status: item.status,
    isActive: item.isActive,
    location: item.local,
    district: item.bairro,
    priority: item.prioridade,
    description: item.descricao,
    date: item.createdAt,
  };
}

export function mapInfracao(item: SegurancaInfracao): SegMobItem {
  return {
    id: item.id,
    kind: "infracao",
    code: item.auto,
    title: item.placa,
    type: item.tipo,
    status: item.status,
    isActive: item.isActive,
    location: item.local,
    date: item.data,
    plate: item.placa,
    value: item.valor,
  };
}

export function mapRegistro(item: SegurancaMobilidadeRegistro): SegMobItem {
  return {
    id: item.id,
    kind: "registro",
    code: item.codigo,
    title: item.titulo,
    type: item.tipo,
    status: item.status,
    isActive: item.isActive,
    location: item.local,
    district: item.bairro,
    responsible: item.responsavel,
    priority: item.prioridade,
    date: item.dataInicio,
    description: item.descricao,
    plate: item.placa,
    value: item.valor,
    category: item.categoria,
    relatedModule: item.relatedModule,
    relatedId: item.relatedId,
  };
}

export async function getRegistrosByCategorias(categories: string[]) {
  await getTenantContextForModule("SEGURANCA");
  const records = await listMobilityRecords(db, categories);
  return records.map(mapRegistro);
}
